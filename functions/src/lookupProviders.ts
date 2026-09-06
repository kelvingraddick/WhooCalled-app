type JsonRecord = Record<string, unknown>;

type ProviderFailureKind =
  | 'http_error'
  | 'invalid_response'
  | 'network_error'
  | 'timeout'
  | 'unexpected_error';

export type ProviderFailureSummary = Readonly<{
  failureKind: ProviderFailureKind;
  httpStatus: number | null;
}>;

export class ProviderRequestError extends Error {
  constructor(readonly summary: ProviderFailureSummary) {
    super('Provider request failed.');
    this.name = 'ProviderRequestError';
  }
}

export function providerFailureSummary(error: unknown): ProviderFailureSummary {
  return error instanceof ProviderRequestError
    ? error.summary
    : { failureKind: 'unexpected_error', httpStatus: null };
}

export type PhoneValidation = Readonly<{
  valid: boolean;
  phoneDisplay: string;
  carrier: string | null;
  lineType: string | null;
  callerName: string | null;
}>;

export type IdentityOwner = Readonly<{
  name: string;
  kind: 'BUSINESS' | 'PERSON' | 'UNKNOWN';
  region: string | null;
}>;

export type WebEvidence = Readonly<{
  title: string;
  description: string;
  domain: string | null;
  url: string;
  retrievalProvider: 'GOOGLE_GROUNDING' | 'BRAVE';
}>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

async function fetchJson(url: string, options: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderRequestError({
          failureKind: 'http_error',
          httpStatus: response.status,
        });
      }
      try {
        return await response.json();
      } catch {
        throw new ProviderRequestError({
          failureKind: 'invalid_response',
          httpStatus: response.status,
        });
      }
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderRequestError({
          failureKind: 'timeout',
          httpStatus: null,
        });
      }
      throw new ProviderRequestError({
        failureKind: 'network_error',
        httpStatus: null,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

function nationalDigits(e164: string): string {
  return e164.replace(/\D/g, '').replace(/^1/, '');
}

function toPhoneDisplay(value: string | null, fallback: string): string {
  const digits = (value ?? fallback).replace(/\D/g, '').replace(/^1/, '');
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : fallback;
}

export async function lookupTwilio(
  e164: string,
  accountSid: string,
  authToken: string,
): Promise<PhoneValidation> {
  const encodedNumber = encodeURIComponent(e164);
  const body = await fetchJson(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodedNumber}?Fields=line_type_intelligence,caller_name`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${accountSid}:${authToken}`,
        ).toString('base64')}`,
      },
    },
  );
  const value = asRecord(body) ?? {};
  const lineType = asRecord(value.line_type_intelligence);
  const caller = asRecord(value.caller_name);

  return {
    valid: asBoolean(value.valid) ?? false,
    phoneDisplay: toPhoneDisplay(asString(value.national_format), e164),
    carrier: asString(lineType?.carrier_name),
    lineType: asString(lineType?.type),
    callerName:
      asString(caller?.caller_name) ??
      asString(caller?.name) ??
      asString(value.caller_name),
  };
}

export async function lookupTrestle(
  e164: string,
  apiKey: string,
): Promise<IdentityOwner[]> {
  const phone = encodeURIComponent(nationalDigits(e164));
  const body = await fetchJson(
    `https://api.trestleiq.com/3.2/phone?phone=${phone}&phone.country_hint=US`,
    { headers: { 'x-api-key': apiKey } },
  );
  const value = asRecord(body) ?? {};
  const owners = Array.isArray(value.owners)
    ? value.owners
    : value.belongs_to
    ? [value.belongs_to]
    : [];

  return owners.flatMap(owner => {
    const item = asRecord(owner);
    const name = asString(item?.name);
    if (!name) {
      return [];
    }
    const type = asString(item?.type)?.toUpperCase();
    const address = asRecord(item?.current_address);
    const addresses = Array.isArray(item?.current_addresses)
      ? item?.current_addresses
      : [];
    const firstAddress = asRecord(addresses[0]);

    return [
      {
        name,
        kind:
          type === 'BUSINESS'
            ? 'BUSINESS'
            : type === 'PERSON'
            ? 'PERSON'
            : 'UNKNOWN',
        region:
          asString(address?.state_code) ?? asString(firstAddress?.state_code),
      },
    ];
  });
}

function matchesNumber(value: string, e164: string): boolean {
  const digits = value.replace(/\D/g, '');
  const national = nationalDigits(e164);
  return digits.includes(national) || digits.includes(`1${national}`);
}

function safeHttpsUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') {
      return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function hasSpamLanguage(value: string): boolean {
  return /\b(?:spam|scam|fraud|robocall|telemarketer|unwanted\s+calls?)\b/i.test(
    value,
  );
}

export async function lookupBraveEvidence(
  e164: string,
  candidateName: string | null,
  apiKey: string,
): Promise<WebEvidence[]> {
  const searchTerms = candidateName
    ? `"${nationalDigits(e164)}" "${candidateName}"`
    : `"${nationalDigits(e164)}"`;
  const search = new URL('https://api.search.brave.com/res/v1/web/search');
  search.searchParams.set('q', searchTerms);
  search.searchParams.set('country', 'US');
  search.searchParams.set('search_lang', 'en');
  search.searchParams.set('count', '8');
  search.searchParams.set('safesearch', 'strict');

  const body = await fetchJson(search.toString(), {
    headers: { 'X-Subscription-Token': apiKey },
  });
  const results = asRecord(asRecord(body)?.web)?.results;
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap(result => {
    const item = asRecord(result);
    const url = safeHttpsUrl(item?.url);
    const title = asString(item?.title);
    const description = asString(item?.description) ?? '';
    const snippets = Array.isArray(item?.extra_snippets)
      ? item.extra_snippets.filter(
          (snippet): snippet is string => typeof snippet === 'string',
        )
      : [];
    const excerpt = [title, description, ...snippets].join(' ');

    if (!url || !title || !matchesNumber(excerpt, e164)) {
      return [];
    }

    let domain: string | null = null;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      domain = null;
    }

    return [
      {
        title,
        description,
        domain,
        url,
        retrievalProvider: 'BRAVE' as const,
      },
    ];
  });
}

export async function lookupBraveSpamEvidence(
  e164: string,
  apiKey: string,
): Promise<WebEvidence[]> {
  const search = new URL('https://api.search.brave.com/res/v1/web/search');
  search.searchParams.set('q', `"${nationalDigits(e164)}"`);
  search.searchParams.set('country', 'US');
  search.searchParams.set('search_lang', 'en');
  search.searchParams.set('count', '20');
  search.searchParams.set('extra_snippets', 'true');
  search.searchParams.set('safesearch', 'strict');

  const body = await fetchJson(search.toString(), {
    headers: { 'X-Subscription-Token': apiKey },
  });
  const results = asRecord(asRecord(body)?.web)?.results;
  if (!Array.isArray(results)) {
    return [];
  }

  const seenUrls = new Set<string>();
  return results.flatMap(result => {
    const item = asRecord(result);
    const url = safeHttpsUrl(item?.url);
    const title = asString(item?.title);
    const description = asString(item?.description) ?? '';
    const snippets = Array.isArray(item?.extra_snippets)
      ? item.extra_snippets.filter(
          (snippet): snippet is string => typeof snippet === 'string',
        )
      : [];
    const excerpt = [title, description, ...snippets].join(' ');

    if (
      !url ||
      !title ||
      seenUrls.has(url) ||
      !matchesNumber(excerpt, e164) ||
      !hasSpamLanguage(excerpt)
    ) {
      return [];
    }
    seenUrls.add(url);

    let domain: string | null = null;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      domain = null;
    }
    return [
      {
        title,
        description: description || snippets[0] || '',
        domain,
        url,
        retrievalProvider: 'BRAVE' as const,
      },
    ];
  });
}
