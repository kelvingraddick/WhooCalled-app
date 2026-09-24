export type LookupRateLimitState = Readonly<{
  count: number;
  windowStartedAt: number;
}>;

export const positiveLookupCacheLifetimeMs = 30 * 24 * 60 * 60 * 1000;
export const negativeLookupCacheLifetimeMs = 24 * 60 * 60 * 1000;

export function creditSettlementReasonFor({
  isPartial,
  noResultRefundsEnabled,
  resultOutcome,
}: Readonly<{
  isPartial: boolean;
  noResultRefundsEnabled: boolean;
  resultOutcome: 'USEFUL' | 'NO_USEFUL_EVIDENCE';
}>): 'CAPTURE' | 'TECHNICAL_FAILURE' | 'NO_USEFUL_EVIDENCE' {
  if (resultOutcome === 'USEFUL') {
    return 'CAPTURE';
  }
  if (isPartial) {
    return 'TECHNICAL_FAILURE';
  }
  return noResultRefundsEnabled ? 'NO_USEFUL_EVIDENCE' : 'CAPTURE';
}

export function lookupCacheLifetimeMs(
  resultOutcome: 'USEFUL' | 'NO_USEFUL_EVIDENCE',
): number {
  return resultOutcome === 'USEFUL'
    ? positiveLookupCacheLifetimeMs
    : negativeLookupCacheLifetimeMs;
}

export function shouldCacheLookupResult({
  isPartial,
  resultOutcome,
}: Readonly<{
  isPartial: boolean;
  resultOutcome: 'USEFUL' | 'NO_USEFUL_EVIDENCE';
}>): boolean {
  return resultOutcome === 'USEFUL' || !isPartial;
}

export function existingProviderReservationAllowsLookup(
  status: unknown,
): boolean {
  return status === 'RESERVED' || status === 'USED' || status === 'COMPLETED';
}

export function lookupRunClaimDecision({
  leaseExpiresAt,
  now,
  status,
}: Readonly<{
  leaseExpiresAt: unknown;
  now: number;
  status: unknown;
}>): 'ACTIVE' | 'CLAIM' | 'TERMINAL' {
  if (status === 'COMPLETE' || status === 'FAILED') {
    return 'TERMINAL';
  }
  if (
    status === 'RUNNING' &&
    typeof leaseExpiresAt === 'string' &&
    Date.parse(leaseExpiresAt) > now
  ) {
    return 'ACTIVE';
  }
  return status === 'QUEUED' || status === 'RUNNING' ? 'CLAIM' : 'TERMINAL';
}

export function nextLookupRateLimitState({
  current,
  limit,
  now,
  windowMs,
}: Readonly<{
  current: Partial<LookupRateLimitState> | undefined;
  limit: number;
  now: number;
  windowMs: number;
}>): { allowed: boolean; state: LookupRateLimitState } {
  const currentWindowStartedAt =
    typeof current?.windowStartedAt === 'number' ? current.windowStartedAt : 0;
  const currentCount =
    typeof current?.count === 'number' && current.count > 0
      ? Math.floor(current.count)
      : 0;
  const windowExpired = now - currentWindowStartedAt >= windowMs;
  const state = windowExpired
    ? { count: 0, windowStartedAt: now }
    : { count: currentCount, windowStartedAt: currentWindowStartedAt };

  if (state.count >= Math.max(1, Math.floor(limit))) {
    return { allowed: false, state };
  }

  return {
    allowed: true,
    state: { ...state, count: state.count + 1 },
  };
}

export function canReserveProviderBudget({
  amountCents,
  pauseAtCents,
  reservedCents,
}: Readonly<{
  amountCents: number;
  pauseAtCents: number;
  reservedCents: number;
}>): boolean {
  return (
    Math.max(0, Math.floor(reservedCents)) +
      Math.max(0, Math.floor(amountCents)) <=
    Math.max(0, Math.floor(pauseAtCents))
  );
}
