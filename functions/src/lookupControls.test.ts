import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReserveProviderBudget,
  creditSettlementReasonFor,
  existingProviderReservationAllowsLookup,
  lookupCacheLifetimeMs,
  lookupRunClaimDecision,
  negativeLookupCacheLifetimeMs,
  nextLookupRateLimitState,
  positiveLookupCacheLifetimeMs,
  shouldCacheLookupResult,
} from './lookupControls';

test('settles fully empty results as courtesy returns when enabled', () => {
  assert.equal(
    creditSettlementReasonFor({
      isPartial: false,
      noResultRefundsEnabled: true,
      resultOutcome: 'NO_USEFUL_EVIDENCE',
    }),
    'NO_USEFUL_EVIDENCE',
  );
});

test('settles evidence-free partial results as technical returns', () => {
  assert.equal(
    creditSettlementReasonFor({
      isPartial: true,
      noResultRefundsEnabled: true,
      resultOutcome: 'NO_USEFUL_EVIDENCE',
    }),
    'TECHNICAL_FAILURE',
  );
});

test('captures useful results and empty results while the flag is disabled', () => {
  assert.equal(
    creditSettlementReasonFor({
      isPartial: true,
      noResultRefundsEnabled: true,
      resultOutcome: 'USEFUL',
    }),
    'CAPTURE',
  );
  assert.equal(
    creditSettlementReasonFor({
      isPartial: false,
      noResultRefundsEnabled: false,
      resultOutcome: 'NO_USEFUL_EVIDENCE',
    }),
    'CAPTURE',
  );
});

test('rate limits a user independently of lookup credits', () => {
  const first = nextLookupRateLimitState({
    current: undefined,
    limit: 2,
    now: 1_000,
    windowMs: 60_000,
  });
  const second = nextLookupRateLimitState({
    current: first.state,
    limit: 2,
    now: 2_000,
    windowMs: 60_000,
  });
  const blocked = nextLookupRateLimitState({
    current: second.state,
    limit: 2,
    now: 3_000,
    windowMs: 60_000,
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.state.count, 2);
});

test('starts a fresh rate-limit window after the configured interval', () => {
  const result = nextLookupRateLimitState({
    current: { count: 10, windowStartedAt: 1_000 },
    limit: 10,
    now: 61_000,
    windowMs: 60_000,
  });

  assert.deepEqual(result, {
    allowed: true,
    state: { count: 1, windowStartedAt: 61_000 },
  });
});

test('provider budget stops reservations at the safety threshold', () => {
  assert.equal(
    canReserveProviderBudget({
      amountCents: 15,
      pauseAtCents: 22_500,
      reservedCents: 22_485,
    }),
    true,
  );
  assert.equal(
    canReserveProviderBudget({
      amountCents: 15,
      pauseAtCents: 22_500,
      reservedCents: 22_486,
    }),
    false,
  );
});

test('provider reservations are idempotent for a unique lookup id', () => {
  assert.equal(existingProviderReservationAllowsLookup('RESERVED'), true);
  assert.equal(existingProviderReservationAllowsLookup('USED'), true);
  assert.equal(existingProviderReservationAllowsLookup('COMPLETED'), true);
  assert.equal(existingProviderReservationAllowsLookup('RELEASED'), false);
});

test('only claims one active provider run and recovers a stale lease', () => {
  assert.equal(
    lookupRunClaimDecision({
      leaseExpiresAt: null,
      now: 1_000,
      status: 'QUEUED',
    }),
    'CLAIM',
  );
  assert.equal(
    lookupRunClaimDecision({
      leaseExpiresAt: new Date(2_000).toISOString(),
      now: 1_000,
      status: 'RUNNING',
    }),
    'ACTIVE',
  );
  assert.equal(
    lookupRunClaimDecision({
      leaseExpiresAt: new Date(500).toISOString(),
      now: 1_000,
      status: 'RUNNING',
    }),
    'CLAIM',
  );
  assert.equal(
    lookupRunClaimDecision({
      leaseExpiresAt: null,
      now: 1_000,
      status: 'COMPLETE',
    }),
    'TERMINAL',
  );
});

test('uses 30-day positive and 24-hour negative cache lifetimes', () => {
  assert.equal(lookupCacheLifetimeMs('USEFUL'), positiveLookupCacheLifetimeMs);
  assert.equal(
    lookupCacheLifetimeMs('NO_USEFUL_EVIDENCE'),
    negativeLookupCacheLifetimeMs,
  );
  assert.equal(positiveLookupCacheLifetimeMs, 30 * 24 * 60 * 60 * 1000);
  assert.equal(negativeLookupCacheLifetimeMs, 24 * 60 * 60 * 1000);
});

test('does not cache evidence-free partial provider failures', () => {
  assert.equal(
    shouldCacheLookupResult({
      isPartial: true,
      resultOutcome: 'NO_USEFUL_EVIDENCE',
    }),
    false,
  );
  assert.equal(
    shouldCacheLookupResult({
      isPartial: false,
      resultOutcome: 'NO_USEFUL_EVIDENCE',
    }),
    true,
  );
  assert.equal(
    shouldCacheLookupResult({ isPartial: true, resultOutcome: 'USEFUL' }),
    true,
  );
});
