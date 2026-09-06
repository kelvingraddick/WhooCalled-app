import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import {
  GoogleGenAI,
  type GenerateContentResponse,
  type GroundingMetadata,
} from '@google/genai';

import { ProviderRequestError, type WebEvidence } from './lookupProviders';

const GOOGLE_LOCATION = 'global';
const GOOGLE_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 5_000;
const MAX_ATTRIBUTION_BYTES = 64 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_CITATIONS = 8;
const MAX_SEARCH_QUERIES = 16;
const MAX_SEARCH_QUERY_LENGTH = 512;
const VERIFY_CONCURRENCY = 4;
const PROXIMITY_RADIUS = 500;

export type GoogleGroundingStage = 'web' | 'reputation';

export type GoogleSearchAttribution = Readonly<{
  stage: GoogleGroundingStage;
  provider: 'GOOGLE_GROUNDING';
  renderedContent: string;
  webSearchQueries: string[];
}>;

export type GroundingDiagnostics = Readonly<{
  groundedCitationCount: number;
  googleQueryCount: number;
  verifiedCount: number;
  rejected: Readonly<Record<string, number>>;
}>;

export type GoogleGroundingResult = Readonly<{
  attribution: GoogleSearchAttribution | null;
  diagnostics: GroundingDiagnostics;
  evidence: WebEvidence[];
}>;

export function shouldUseBraveSearchFallback(
  enabled: boolean,
  googleRequestFailed: boolean,
): boolean {
  return enabled && googleRequestFailed;
}

export type GroundingRequest = Readonly<{
  e164: string;
  candidateName: string | null;
  model: string;
  projectId: string;
  stage: GoogleGroundingStage;
}>;

type GenerateGroundedContent = (
  prompt: string,
  model: string,
) => Promise<GenerateContentResponse>;

type PageVerificationDependencies = Readonly<{
  fetchAtValidatedAddress?: (
    url: URL,
    addresses: string[],
  ) => Promise<Response>;
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
}>;

type Citation = Readonly<{
  title: string;
  uri: string;
}>;

type VerifiedPage = Readonly<{
  description: string;
  domain: string;
  title: string;
  url: string;
}>;

type ValidatedPublicUrl = Readonly<{
  addresses: string[];
  url: URL;
}>;

function nationalDigits(e164: string): string {
  return e164.replace(/\D/g, '').replace(/^1/, '');
}

function phoneDisplay(e164: string): string {
  const digits = nationalDigits(e164);
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : e164;
}

function promptFor(request: GroundingRequest): string {
  const number = phoneDisplay(request.e164);
  const digits = nationalDigits(request.e164);
  if (request.stage === 'web') {
    return [
      `Find public web pages that directly associate US phone number ${number} (${digits}) with ${
        request.candidateName ?? 'a named caller or business'
      }.`,
      'Search exact-number variants. Use only pages that visibly contain the full phone number and the caller or business name.',
      'Write one short factual sentence for each useful page and cite that page. Do not infer ownership from area code, exchange, or similar numbers.',
      'If no exact association exists, say so without inventing a source.',
    ].join(' ');
  }
  return [
    `Find public spam, scam, fraud, robocall, telemarketer, or unwanted-call reports for US phone number ${number} (${digits}).`,
    'Search exact-number variants. Use only pages that visibly contain the full phone number and reputation language.',
    'Write one short factual sentence for each useful page and cite that page. Do not use area-code pages, neighboring numbers, or inferred associations.',
    'If no exact report exists, say so without inventing a source.',
  ].join(' ');
}

function classifyProviderError(error: unknown): ProviderRequestError {
  const item = error as { status?: unknown; code?: unknown; message?: unknown };
  const rawStatus = item?.status ?? item?.code;
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)
      ? Number(rawStatus)
      : null;
  const message = typeof item?.message === 'string' ? item.message : '';
  return new ProviderRequestError({
    failureKind: /timeout|deadline|abort/i.test(message)
      ? 'timeout'
      : status
      ? 'http_error'
      : 'network_error',
    httpStatus: status,
  });
}

function metadataFor(
  response: GenerateContentResponse,
): GroundingMetadata | null {
  return response.candidates?.[0]?.groundingMetadata ?? null;
}

function citationsFor(metadata: GroundingMetadata | null): Citation[] {
  const seen = new Set<string>();
  return (metadata?.groundingChunks ?? []).flatMap(chunk => {
    const uri = chunk.web?.uri?.trim();
    const title = chunk.web?.title?.trim();
    if (!uri || !title || seen.has(uri)) {
      return [];
    }
    seen.add(uri);
    return [{ title, uri }];
  });
}

function attributionFor(
  metadata: GroundingMetadata | null,
  stage: GoogleGroundingStage,
): GoogleSearchAttribution | null {
  const renderedContent = metadata?.searchEntryPoint?.renderedContent?.trim();
  if (!renderedContent) {
    return null;
  }
  if (Buffer.byteLength(renderedContent, 'utf8') > MAX_ATTRIBUTION_BYTES) {
    throw new ProviderRequestError({
      failureKind: 'invalid_response',
      httpStatus: null,
    });
  }
  return {
    stage,
    provider: 'GOOGLE_GROUNDING',
    renderedContent,
    webSearchQueries: (metadata?.webSearchQueries ?? [])
      .filter(query => typeof query === 'string' && query.trim())
      .slice(0, MAX_SEARCH_QUERIES)
      .map(query => query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)),
  };
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return isPrivateIpv4(address);
  }
  if (isIP(address) !== 6) {
    return true;
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map(address => address.address);
}

async function validatePublicUrl(
  rawUrl: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<ValidatedPublicUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('unsafe_url');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.local')
  ) {
    throw new Error('unsafe_url');
  }
  const addresses = isIP(url.hostname)
    ? [url.hostname]
    : await resolveHost(url.hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error('unsafe_url');
  }
  return { addresses, url };
}

async function fetchAtValidatedAddress(
  url: URL,
  addresses: string[],
): Promise<Response> {
  const address = addresses[0];
  if (!address) {
    throw new Error('unsafe_url');
  }

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        headers: {
          Accept: 'text/html,text/plain,application/xhtml+xml',
          Host: url.host,
          'User-Agent': 'WhooCalledEvidenceVerifier/1.0',
        },
        hostname: address,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        port: url.port ? Number(url.port) : 443,
        servername: url.hostname,
      },
      response => {
        const declaredLength = Number(response.headers['content-length']);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_PAGE_BYTES
        ) {
          response.resume();
          reject(new Error('too_large'));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PAGE_BYTES) {
            response.destroy(new Error('too_large'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', error => reject(error));
        response.once('end', () => {
          const headers = new Headers();
          Object.entries(response.headers).forEach(([name, value]) => {
            if (Array.isArray(value)) {
              headers.set(name, value.join(', '));
            } else if (value !== undefined) {
              headers.set(name, String(value));
            }
          });
          resolve(
            new Response(Buffer.concat(chunks), {
              headers,
              status: response.statusCode ?? 500,
            }),
          );
        });
      },
    );
    request.once('error', error => reject(error));
    request.setTimeout(PAGE_TIMEOUT_MS, () => {
      request.destroy(new DOMException('Timed out', 'AbortError'));
    });
    request.end();
  });
}

async function readTextWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAGE_BYTES) {
    throw new Error('too_large');
  }
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchPublicPage(
  rawUrl: string,
  dependencies: PageVerificationDependencies,
): Promise<Readonly<{ body: string; finalUrl: URL }>> {
  const fetchImpl = dependencies.fetchImpl;
  const resolveHost = dependencies.resolveHost ?? defaultResolveHost;
  let verifiedUrl = await validatePublicUrl(rawUrl, resolveHost);

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = fetchImpl
        ? await fetchImpl(verifiedUrl.url.toString(), {
            headers: {
              Accept: 'text/html,text/plain,application/xhtml+xml',
              'User-Agent': 'WhooCalledEvidenceVerifier/1.0',
            },
            redirect: 'manual',
            signal: controller.signal,
          })
        : await (
            dependencies.fetchAtValidatedAddress ?? fetchAtValidatedAddress
          )(verifiedUrl.url, verifiedUrl.addresses);
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : 'fetch_failed',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) {
        throw new Error('redirect_failed');
      }
      verifiedUrl = await validatePublicUrl(
        new URL(location, verifiedUrl.url).toString(),
        resolveHost,
      );
      continue;
    }
    if (!response.ok) {
      throw new Error('http_error');
    }
    const contentType =
      response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      !contentType.startsWith('text/html') &&
      !contentType.startsWith('text/plain') &&
      !contentType.startsWith('application/xhtml+xml')
    ) {
      throw new Error('non_text');
    }
    return {
      body: await readTextWithLimit(response),
      finalUrl: verifiedUrl.url,
    };
  }
  throw new Error('redirect_failed');
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (_match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : ' ';
      }
      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : ' ';
      }
      return named[entity.toLowerCase()] ?? ' ';
    },
  );
}

function textFromHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromHtml(html: string, fallback: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return (title ? textFromHtml(title) : fallback).slice(0, 180).trim();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phonePattern(e164: string): RegExp {
  const digits = nationalDigits(e164);
  const area = escaped(digits.slice(0, 3));
  const exchange = escaped(digits.slice(3, 6));
  const subscriber = escaped(digits.slice(6));
  return new RegExp(
    `(^|\\D)(?:\\+?1[\\s().-]*)?${area}[\\s().-]*${exchange}[\\s.-]*${subscriber}(?!\\d)`,
    'i',
  );
}

function nearbyText(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const start = Math.max(0, match.index - PROXIMITY_RADIUS);
  const end = Math.min(
    text.length,
    match.index + match[0].length + PROXIMITY_RADIUS,
  );
  return text.slice(start, end);
}

function candidatePattern(candidateName: string): RegExp {
  const terms = candidateName.trim().split(/\s+/).filter(Boolean).map(escaped);
  return new RegExp(terms.join('[\\s\\W_]+'), 'i');
}

const spamPattern =
  /\b(?:spam|scam|fraud|robocall|telemarketer|unwanted\s+calls?|negative\s+reputation|user\s+reports?)\b/i;

function verificationExcerpt(
  body: string,
  e164: string,
  stage: GoogleGroundingStage,
  candidateName: string | null,
): string | null {
  const text = textFromHtml(body);
  const nearby = nearbyText(text, phonePattern(e164));
  if (!nearby) {
    return null;
  }
  if (stage === 'web') {
    if (!candidateName || !candidatePattern(candidateName).test(nearby)) {
      return null;
    }
  } else if (!spamPattern.test(nearby)) {
    return null;
  }
  return nearby.slice(0, 320).trim();
}

async function verifyCitation(
  citation: Citation,
  request: GroundingRequest,
  dependencies: PageVerificationDependencies,
): Promise<VerifiedPage> {
  const page = await fetchPublicPage(citation.uri, dependencies);
  const description = verificationExcerpt(
    page.body,
    request.e164,
    request.stage,
    request.candidateName,
  );
  if (!description) {
    throw new Error('content_mismatch');
  }
  return {
    description,
    domain: page.finalUrl.hostname.replace(/^www\./, ''),
    title: titleFromHtml(page.body, citation.title),
    url: page.finalUrl.toString(),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = {
            status: 'fulfilled',
            value: await mapper(values[index]),
          };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    }),
  );
  return results;
}

export async function evidenceFromGoogleResponse(
  response: GenerateContentResponse,
  request: GroundingRequest,
  dependencies: PageVerificationDependencies = {},
): Promise<GoogleGroundingResult> {
  const metadata = metadataFor(response);
  const citations = citationsFor(metadata);
  const attribution = attributionFor(metadata, request.stage);
  if (citations.length && !attribution) {
    throw new ProviderRequestError({
      failureKind: 'invalid_response',
      httpStatus: null,
    });
  }
  const limitedCitations = citations.slice(0, MAX_CITATIONS);
  const verified = await mapWithConcurrency(
    limitedCitations,
    VERIFY_CONCURRENCY,
    citation => verifyCitation(citation, request, dependencies),
  );
  const seenUrls = new Set<string>();
  const rejected: Record<string, number> = {};
  const evidence = verified.flatMap(result => {
    if (result.status === 'rejected') {
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : 'verification_failed';
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      return [];
    }
    if (seenUrls.has(result.value.url)) {
      rejected.duplicate = (rejected.duplicate ?? 0) + 1;
      return [];
    }
    seenUrls.add(result.value.url);
    return [
      {
        ...result.value,
        retrievalProvider: 'GOOGLE_GROUNDING' as const,
      },
    ];
  });
  return {
    attribution,
    diagnostics: {
      groundedCitationCount: citations.length,
      googleQueryCount: metadata?.webSearchQueries?.length ?? 0,
      verifiedCount: evidence.length,
      rejected,
    },
    evidence,
  };
}

export async function lookupGoogleGroundedEvidence(
  request: GroundingRequest,
  dependencies: PageVerificationDependencies & {
    generateContent?: GenerateGroundedContent;
  } = {},
): Promise<GoogleGroundingResult> {
  const generateContent =
    dependencies.generateContent ??
    (async (prompt: string, model: string) => {
      const client = new GoogleGenAI({
        vertexai: true,
        project: request.projectId,
        location: GOOGLE_LOCATION,
      });
      return client.models.generateContent({
        model,
        contents: prompt,
        config: {
          httpOptions: {
            apiVersion: 'v1',
            timeout: GOOGLE_TIMEOUT_MS,
          },
          maxOutputTokens: 768,
          temperature: 1,
          tools: [{ googleSearch: {} }],
        },
      });
    });
  let response: GenerateContentResponse;
  try {
    response = await generateContent(promptFor(request), request.model);
  } catch (error) {
    throw classifyProviderError(error);
  }
  return evidenceFromGoogleResponse(response, request, dependencies);
}
