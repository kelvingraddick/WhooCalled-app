import { HttpsError } from 'firebase-functions/v2/https';

export const completedLookupStatus = 'COMPLETE';

export function lookupHistoryCollectionPath(uid: string): string {
  return `users/${uid}/lookups`;
}

export function normalizeDebugTesterEmail(
  value: string | null | undefined,
): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export function parseDebugTesterEmails(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map(normalizeDebugTesterEmail)
        .filter((email): email is string => email !== null),
    ),
  ];
}

export function isDebugTesterEmail(
  email: string | null | undefined,
  configuredEmails: string,
): boolean {
  const normalizedEmail = normalizeDebugTesterEmail(email);
  return (
    normalizedEmail !== null &&
    parseDebugTesterEmails(configuredEmails).includes(normalizedEmail)
  );
}

export function requireDebugTesterEmail(
  email: string | null | undefined,
  configuredEmails: string,
): string {
  const normalizedEmail = normalizeDebugTesterEmail(email);
  if (
    normalizedEmail === null ||
    !isDebugTesterEmail(normalizedEmail, configuredEmails)
  ) {
    throw new HttpsError(
      'permission-denied',
      'Debug tools are unavailable for this account.',
    );
  }

  return normalizedEmail;
}
