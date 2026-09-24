import { getFunctions } from 'firebase-admin/functions';
import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import {
  defineBoolean,
  defineInt,
  defineString,
} from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import { ZodError } from 'zod';

import {
  deleteCommunitySubmissionSchema,
  communitySubmissionSchema,
} from './lookupContracts';
import {
  lookupBraveEvidence,
  lookupBraveSpamEvidence,
  lookupTrestle,
  lookupTwilio,
  providerFailureSummary,
  type IdentityOwner,
  type PhoneValidation,
  type WebEvidence,
} from './lookupProviders';
import {
  lookupGoogleGroundedEvidence,
  shouldUseBraveSearchFallback,
  type GoogleGroundingStage,
  type GoogleSearchAttribution,
} from './googleGrounding';
import { parseLookupRequest } from './contracts';
import {
  braveSearchApiKey,
  trestleApiKey,
  twilioAccountSid,
  twilioAuthToken,
} from './providerSecrets';
import {
  getSettingsBalance,
  reserveLookupCredit,
  settleLookupCredit,
} from './settings';
import {
  canReserveProviderBudget,
  creditSettlementReasonFor,
  existingProviderReservationAllowsLookup,
  lookupCacheLifetimeMs,
  lookupRunClaimDecision,
  nextLookupRateLimitState,
  shouldCacheLookupResult,
} from './lookupControls';
import {
  formatUsPhone,
  cacheMatchesRetrievalVersion,
  initialStages,
  normalizeUsPhone,
  numberKeyFor,
  resultOutcomeFor,
  type CreditOutcome,
  type CallerCandidate,
  type EvidenceSource,
  type LookupResult,
  type LookupStageKey,
  type LookupStatus,
  type LookupTask,
  type ResultOutcome,
} from './lookupTypes';
import { emptyConfidenceFactors, scoreCandidates } from './lookupScoring';
import { sourceOrigin } from './sourceMetadata';

const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: true });
const lookupCallableOptions = {
  enforceAppCheck,
  region: 'us-east4',
} as const;
const lookupProviderConfigured = defineBoolean('LOOKUP_PROVIDER_CONFIGURED', {
  default: false,
});
const enableBraveSearchFallback = defineBoolean(
  'ENABLE_BRAVE_SEARCH_FALLBACK',
  { default: false },
);
const googleGroundingModel = defineString('GOOGLE_GROUNDING_MODEL', {
  default: 'gemini-3.5-flash-lite',
});
const googleGroundingProjectId = defineString('GOOGLE_GROUNDING_PROJECT_ID', {
  default: 'whoo-called',
});
const noResultRefundsEnabled = defineBoolean('NO_RESULT_REFUNDS_ENABLED', {
  default: false,
});
const lookupRateLimitPerMinute = defineInt('LOOKUP_RATE_LIMIT_PER_MINUTE', {
  default: 10,
});
const providerBudgetPauseCents = defineInt('PROVIDER_BUDGET_PAUSE_CENTS', {
  default: 22_500,
});
const providerBudgetMonthlyCents = defineInt('PROVIDER_BUDGET_MONTHLY_CENTS', {
  default: 25_000,
});
const providerBudgetReservationCents = defineInt(
  'PROVIDER_BUDGET_RESERVATION_CENTS',
  { default: 15 },
);
const lookupRateLimitWindowMs = 60 * 1000;
const lookupRunLeaseMs = 150 * 1000;
const retrievalVersion = 'google-grounding-v1';

type LookupDocument = Readonly<{
  status: LookupStatus;
  numberKey: string;
  phoneE164: string;
  phoneDisplay: string;
  requestId: string;
  mode: 'INITIAL' | 'REFRESH';
  creditReservationId?: string;
  result?: LookupResult;
  resultOutcome?: ResultOutcome;
  creditOutcome?: CreditOutcome;
  errorCode?: 'PROVIDER_BUDGET_PAUSED';
  runLeaseExpiresAt?: string;
}>;

type ProviderBudgetMetrics = Readonly<{
  creditOutcome: CreditOutcome;
  creditSource: 'monthly' | 'purchased';
  googleQueryCount: number;
  identitySucceeded: boolean;
  latencyMs: number;
  planName: string;
  resultOutcome: ResultOutcome | null;
  reputationSucceeded: boolean;
  validationSucceeded: boolean;
  webSucceeded: boolean;
}>;

function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth?.uid) {
    throw new HttpsError(
      'unauthenticated',
      'Sign in is required before requesting a lookup.',
    );
  }

  return request.auth.uid;
}

function lookupReference(uid: string, lookupId: string): DocumentReference {
  return getFirestore().doc(`users/${uid}/lookups/${lookupId}`);
}

function cacheReference(numberKey: string): DocumentReference {
  return getFirestore().doc(`numberIntelligence/${numberKey}`);
}

function communitySummaryReference(numberKey: string): DocumentReference {
  return getFirestore().doc(`communitySummaries/${numberKey}`);
}

function lookupRateLimitReference(uid: string): DocumentReference {
  return getFirestore().doc(`users/${uid}/private/lookupRateLimit`);
}

function providerBudgetReference(monthKey: string): DocumentReference {
  return getFirestore().doc(`providerBudgets/${monthKey}`);
}

function providerBudgetReservationReference(
  uid: string,
  lookupId: string,
): DocumentReference {
  const reservationKey = numberKeyFor(`${uid}:${lookupId}`);
  return getFirestore().doc(`providerBudgetReservations/${reservationKey}`);
}

function utcMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

async function consumeLookupRateLimit(uid: string): Promise<boolean> {
  const db = getFirestore();
  const reference = lookupRateLimitReference(uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const decision = nextLookupRateLimitState({
      current: snapshot.data(),
      limit: lookupRateLimitPerMinute.value(),
      now: Date.now(),
      windowMs: lookupRateLimitWindowMs,
    });
    if (decision.allowed) {
      transaction.set(reference, decision.state, { merge: true });
    }
    return decision.allowed;
  });
}

async function reserveProviderBudget(
  uid: string,
  lookupId: string,
): Promise<boolean> {
  const db = getFirestore();
  const now = new Date();
  const monthKey = utcMonthKey(now);
  const budgetRef = providerBudgetReference(monthKey);
  const reservationRef = providerBudgetReservationReference(uid, lookupId);
  return db.runTransaction(async transaction => {
    const [budget, reservation] = await Promise.all([
      transaction.get(budgetRef),
      transaction.get(reservationRef),
    ]);
    if (reservation.exists) {
      return existingProviderReservationAllowsLookup(
        reservation.data()?.status,
      );
    }

    const estimatedReservedCents = count(budget.data()?.estimatedReservedCents);
    const amountCents = providerBudgetReservationCents.value();
    if (
      !canReserveProviderBudget({
        amountCents,
        pauseAtCents: Math.min(
          providerBudgetPauseCents.value(),
          providerBudgetMonthlyCents.value(),
        ),
        reservedCents: estimatedReservedCents,
      })
    ) {
      return false;
    }

    transaction.set(
      budgetRef,
      {
        estimatedReservedCents: estimatedReservedCents + amountCents,
        monthlyBudgetCents: providerBudgetMonthlyCents.value(),
        pauseAtCents: providerBudgetPauseCents.value(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(reservationRef, {
      amountCents,
      monthKey,
      status: 'RESERVED',
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function releaseProviderBudget(
  uid: string,
  lookupId: string,
): Promise<void> {
  const db = getFirestore();
  const reservationRef = providerBudgetReservationReference(uid, lookupId);
  await db.runTransaction(async transaction => {
    const reservation = await transaction.get(reservationRef);
    if (!reservation.exists || reservation.data()?.status !== 'RESERVED') {
      return;
    }
    const monthKey = reservation.data()?.monthKey;
    if (typeof monthKey !== 'string') {
      return;
    }
    const budgetRef = providerBudgetReference(monthKey);
    const budget = await transaction.get(budgetRef);
    const amountCents = count(reservation.data()?.amountCents);
    transaction.set(
      budgetRef,
      {
        estimatedReservedCents: Math.max(
          0,
          count(budget.data()?.estimatedReservedCents) - amountCents,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      reservationRef,
      { status: 'RELEASED', releasedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}

async function markProviderAttemptStarted(
  uid: string,
  lookupId: string,
): Promise<void> {
  const db = getFirestore();
  const reservationRef = providerBudgetReservationReference(uid, lookupId);
  await db.runTransaction(async transaction => {
    const reservation = await transaction.get(reservationRef);
    if (!reservation.exists || reservation.data()?.status !== 'RESERVED') {
      return;
    }
    const monthKey = reservation.data()?.monthKey;
    if (typeof monthKey !== 'string') {
      return;
    }
    const budgetRef = providerBudgetReference(monthKey);
    const budget = await transaction.get(budgetRef);
    transaction.set(
      budgetRef,
      {
        uncachedAttempts: count(budget.data()?.uncachedAttempts) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      reservationRef,
      { status: 'USED', startedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}

async function completeProviderBudgetReservation(
  uid: string,
  lookupId: string,
  metrics: ProviderBudgetMetrics,
): Promise<void> {
  const db = getFirestore();
  const reservationRef = providerBudgetReservationReference(uid, lookupId);
  await db.runTransaction(async transaction => {
    const reservation = await transaction.get(reservationRef);
    const status = reservation.data()?.status;
    if (
      !reservation.exists ||
      status === 'COMPLETED' ||
      status === 'RELEASED'
    ) {
      return;
    }
    const monthKey = reservation.data()?.monthKey;
    if (typeof monthKey !== 'string') {
      return;
    }
    const budgetRef = providerBudgetReference(monthKey);
    const budget = await transaction.get(budgetRef);
    const incrementedAttempts = status === 'RESERVED' ? 1 : 0;
    const resultCounter =
      metrics.resultOutcome === 'USEFUL'
        ? 'usefulOutcomes'
        : metrics.resultOutcome === 'NO_USEFUL_EVIDENCE'
        ? 'noUsefulEvidenceOutcomes'
        : 'technicalFailures';
    const recordedCreditOutcomes = budget.data()?.creditOutcomes;
    const creditOutcomes =
      recordedCreditOutcomes &&
      typeof recordedCreditOutcomes === 'object' &&
      !Array.isArray(recordedCreditOutcomes)
        ? (recordedCreditOutcomes as Record<string, unknown>)
        : {};
    transaction.set(
      budgetRef,
      {
        completedAttempts: count(budget.data()?.completedAttempts) + 1,
        googleQueryCount:
          count(budget.data()?.googleQueryCount) + metrics.googleQueryCount,
        [resultCounter]: count(budget.data()?.[resultCounter]) + 1,
        ...(incrementedAttempts
          ? {
              uncachedAttempts:
                count(budget.data()?.uncachedAttempts) + incrementedAttempts,
            }
          : {}),
        creditOutcomes: {
          ...creditOutcomes,
          [metrics.creditOutcome]:
            count(creditOutcomes[metrics.creditOutcome]) + 1,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      reservationRef,
      {
        ...metrics,
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function communityReportCount(numberKey: string): Promise<number> {
  const summary = await communitySummaryReference(numberKey).get();
  return count(summary.data()?.reportCount);
}

function communityOwnerReference(submissionId: string): DocumentReference {
  return getFirestore().doc(`communitySubmissionOwners/${submissionId}`);
}

function userCommunitySubmissionReference(
  uid: string,
  submissionId: string,
): DocumentReference {
  return getFirestore().doc(
    `users/${uid}/communitySubmissions/${submissionId}`,
  );
}

function stageField(key: LookupStageKey): string {
  return `stages.${key}`;
}

async function setStage(
  reference: DocumentReference,
  key: LookupStageKey,
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SKIPPED',
  detail: string,
): Promise<void> {
  await reference.update({
    [stageField(key)]: { status, detail },
    updatedAt: new Date().toISOString(),
  });
}

function completedStages(detail: string) {
  return {
    validation: { status: 'COMPLETE', detail },
    identity: {
      status: 'COMPLETE',
      detail: 'Reused recently checked identity data.',
    },
    web: {
      status: 'COMPLETE',
      detail: 'Reused recently checked public evidence.',
    },
    reputation: {
      status: 'COMPLETE',
      detail: 'Reused recently checked public spam evidence.',
    },
    confidence: { status: 'COMPLETE', detail: 'Confidence is ready.' },
  };
}

function safeResult(value: unknown): LookupResult | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LookupResult)
    : null;
}

function isFreshCache(
  data: Record<string, unknown> | undefined,
): data is Record<string, unknown> & {
  result: LookupResult;
  expiresAt: string;
} {
  if (
    !data ||
    !cacheMatchesRetrievalVersion(data, retrievalVersion) ||
    typeof data.expiresAt !== 'string' ||
    Date.parse(data.expiresAt) <= Date.now()
  ) {
    return false;
  }

  return safeResult(data.result) !== null;
}

function responseFor(
  requestId: string,
  lookupId: string | null,
  status:
    | 'ACCEPTED'
    | 'COMPLETE'
    | 'FAILED'
    | 'RATE_LIMITED'
    | 'INSUFFICIENT_CREDITS'
    | 'PROVIDER_NOT_CONFIGURED'
    | 'PROVIDER_BUDGET_PAUSED',
  message: string,
  balance: Awaited<ReturnType<typeof getSettingsBalance>>,
) {
  return { requestId, lookupId, status, message, balance };
}

async function responseForExistingLookup(
  uid: string,
  requestId: string,
  lookupId: string,
  existing: Partial<LookupDocument>,
) {
  const status =
    existing.status === 'COMPLETE'
      ? 'COMPLETE'
      : existing.status === 'FAILED' &&
        existing.errorCode === 'PROVIDER_BUDGET_PAUSED'
      ? 'PROVIDER_BUDGET_PAUSED'
      : existing.status === 'FAILED'
      ? 'FAILED'
      : 'ACCEPTED';
  return responseFor(
    requestId,
    status === 'PROVIDER_BUDGET_PAUSED' ? null : lookupId,
    status,
    status === 'COMPLETE'
      ? 'Lookup is ready.'
      : status === 'PROVIDER_BUDGET_PAUSED'
      ? 'Lookup temporarily unavailable. No credit was used.'
      : status === 'FAILED'
      ? 'That lookup could not be completed. No credit was used.'
      : 'Lookup is already in progress.',
    await getSettingsBalance(uid),
  );
}

async function createLookupDocumentOnce(
  reference: DocumentReference,
  data: Record<string, unknown>,
): Promise<boolean> {
  return getFirestore().runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      return false;
    }
    transaction.create(reference, data);
    return true;
  });
}

async function existingLookupResponse(
  uid: string,
  requestId: string,
  lookupId: string,
  reference: DocumentReference,
) {
  const existing = await reference.get();
  if (!existing.exists) {
    throw new HttpsError('aborted', 'Lookup could not be started. Try again.');
  }
  if (existing.data()?.status === 'QUEUED') {
    try {
      await enqueueLookup({ uid, lookupId });
    } catch (error) {
      logger.warn('Lookup retry enqueue failed', {
        lookupIdHash: numberKeyFor(lookupId),
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return responseForExistingLookup(
    uid,
    requestId,
    lookupId,
    existing.data() as Partial<LookupDocument>,
  );
}

async function claimLookupRun(
  reference: DocumentReference,
): Promise<LookupDocument | null> {
  const attemptId = randomUUID();
  const now = Date.now();
  return getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      return null;
    }
    const lookup = snapshot.data() as LookupDocument;
    const decision = lookupRunClaimDecision({
      leaseExpiresAt: lookup.runLeaseExpiresAt,
      now,
      status: lookup.status,
    });
    if (decision === 'TERMINAL') {
      return null;
    }
    if (decision === 'ACTIVE') {
      throw new Error('Lookup provider run is already active.');
    }
    transaction.update(reference, {
      runAttemptId: attemptId,
      runLeaseExpiresAt: new Date(now + lookupRunLeaseMs).toISOString(),
      status: 'RUNNING',
      updatedAt: new Date(now).toISOString(),
    });
    return lookup;
  });
}

async function enqueueLookup(task: LookupTask): Promise<void> {
  await getFunctions()
    .taskQueue<LookupTask>('locations/us-east4/functions/runLookup')
    .enqueue(task, { dispatchDeadlineSeconds: 120 });
}

export const createLookup = onCall(lookupCallableOptions, async request => {
  const uid = requireUid(request);

  try {
    const input = parseLookupRequest(request.data);
    let phoneE164: string;
    try {
      phoneE164 = normalizeUsPhone(input.phoneInput);
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'Enter a valid 10-digit US phone number.',
      );
    }

    if (!lookupProviderConfigured.value()) {
      return responseFor(
        input.requestId,
        null,
        'PROVIDER_NOT_CONFIGURED',
        'Lookups are not available yet. No credit was used.',
        await getSettingsBalance(uid),
      );
    }

    if (input.mode === 'REFRESH') {
      const existing = await lookupReference(uid, input.lookupId!).get();
      if (!existing.exists) {
        throw new HttpsError(
          'not-found',
          'That saved lookup is no longer available.',
        );
      }
    }

    const lookupId = input.requestId;
    const reference = lookupReference(uid, lookupId);
    const existingRun = await reference.get();
    if (existingRun.exists) {
      return existingLookupResponse(uid, input.requestId, lookupId, reference);
    }

    if (!(await consumeLookupRateLimit(uid))) {
      return responseFor(
        input.requestId,
        null,
        'RATE_LIMITED',
        'Too many lookups were started recently. Wait a minute and try again. No credit was used.',
        await getSettingsBalance(uid),
      );
    }

    const numberKey = numberKeyFor(phoneE164);
    const now = new Date().toISOString();
    const [cache, currentCommunityReportCount] =
      input.mode === 'INITIAL'
        ? await Promise.all([
            cacheReference(numberKey).get(),
            communityReportCount(numberKey),
          ])
        : [null, 0];
    const cacheData = cache?.data() as Record<string, unknown> | undefined;

    if (isFreshCache(cacheData)) {
      const resultOutcome = resultOutcomeFor(
        cacheData.result,
        currentCommunityReportCount,
      );
      const created = await createLookupDocumentOnce(reference, {
        displayName:
          cacheData.result.candidates.find(
            candidate => candidate.id === cacheData.result.primaryCandidateId,
          )?.name ?? 'Unknown caller',
        lastOpenedAt: now,
        mode: input.mode,
        numberKey,
        phoneDisplay: cacheData.result.phoneDisplay,
        phoneE164,
        requestId: input.requestId,
        result: cacheData.result,
        resultOutcome,
        stages: completedStages('Reused a recently completed lookup.'),
        status: 'COMPLETE',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
        confidenceLabel: cacheData.result.confidenceLabel,
        confidenceScore: cacheData.result.confidenceScore,
        spamReportCount: currentCommunityReportCount,
        cacheHit: true,
      });
      if (!created) {
        return existingLookupResponse(
          uid,
          input.requestId,
          lookupId,
          reference,
        );
      }
      logger.info('Lookup economics', {
        cacheHit: true,
        creditOutcome: null,
        resultOutcome,
      });
      return responseFor(
        input.requestId,
        lookupId,
        'COMPLETE',
        'Lookup is ready.',
        await getSettingsBalance(uid),
      );
    }

    const reservation = await reserveLookupCredit(uid, lookupId);
    if (!reservation) {
      return responseFor(
        input.requestId,
        null,
        'INSUFFICIENT_CREDITS',
        'You have no lookups remaining. Buy more to continue.',
        await getSettingsBalance(uid),
      );
    }

    if (!(await reserveProviderBudget(uid, lookupId))) {
      const settlement = await settleLookupCredit(
        uid,
        lookupId,
        'TECHNICAL_FAILURE',
      );
      const created = await createLookupDocumentOnce(reference, {
        creditReservationId: lookupId,
        creditOutcome: settlement.creditOutcome,
        createdAt: now,
        errorCode: 'PROVIDER_BUDGET_PAUSED',
        errorMessage: 'Lookup temporarily unavailable. No credit was used.',
        lastOpenedAt: now,
        mode: input.mode,
        numberKey,
        phoneDisplay: formatUsPhone(phoneE164),
        phoneE164,
        requestId: input.requestId,
        stages: initialStages(),
        status: 'FAILED',
        updatedAt: now,
      });
      if (!created) {
        return existingLookupResponse(
          uid,
          input.requestId,
          lookupId,
          reference,
        );
      }
      logger.warn('Lookup provider budget paused', {
        cacheHit: false,
        creditOutcome: settlement.creditOutcome,
        pauseAtCents: providerBudgetPauseCents.value(),
      });
      return responseFor(
        input.requestId,
        null,
        'PROVIDER_BUDGET_PAUSED',
        'Lookup temporarily unavailable. No credit was used.',
        await getSettingsBalance(uid),
      );
    }

    const created = await createLookupDocumentOnce(reference, {
      creditReservationId: lookupId,
      createdAt: now,
      lastOpenedAt: now,
      mode: input.mode,
      numberKey,
      phoneDisplay: formatUsPhone(phoneE164),
      phoneE164,
      requestId: input.requestId,
      stages: initialStages(),
      status: 'QUEUED',
      updatedAt: now,
    });
    if (!created) {
      return existingLookupResponse(uid, input.requestId, lookupId, reference);
    }

    try {
      await enqueueLookup({ uid, lookupId });
    } catch {
      const settlement = await settleLookupCredit(
        uid,
        lookupId,
        'TECHNICAL_FAILURE',
      );
      await Promise.all([
        reference.update({
          creditOutcome: settlement.creditOutcome,
          status: 'FAILED',
          errorMessage:
            'We could not start this lookup. Your credit was returned.',
          updatedAt: new Date().toISOString(),
        }),
        releaseProviderBudget(uid, lookupId),
      ]);
      return responseFor(
        input.requestId,
        lookupId,
        'FAILED',
        'We could not start that lookup. Your credit was returned.',
        await getSettingsBalance(uid),
      );
    }

    return responseFor(
      input.requestId,
      lookupId,
      'ACCEPTED',
      'Lookup started.',
      await getSettingsBalance(uid),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpsError(
        'invalid-argument',
        'The lookup request is invalid.',
      );
    }
    throw error;
  }
});

function candidateId(index: number): string {
  return `candidate-${index + 1}`;
}

function toCandidates(
  owners: IdentityOwner[],
  validation: PhoneValidation | null,
): CallerCandidate[] {
  const fromOwners = owners.slice(0, 4).map((owner, index) => ({
    id: candidateId(index),
    name: owner.name,
    kind: owner.kind,
    region: owner.region,
    score: 0,
    confidenceLabel: 'LOW' as const,
    confidenceFactors: emptyConfidenceFactors(),
  }));

  if (fromOwners.length || !validation?.callerName) {
    return fromOwners;
  }

  return [
    {
      id: candidateId(0),
      name: validation.callerName,
      kind: 'UNKNOWN',
      region: null,
      score: 0,
      confidenceLabel: 'LOW',
      confidenceFactors: emptyConfidenceFactors(),
    },
  ];
}

function sourceKind(domain: string | null): EvidenceSource['kind'] {
  return domain && /(directory|yellowpages|yelp|bbb|chamber)/i.test(domain)
    ? 'DIRECTORY'
    : 'WEB';
}

function toWebSources(
  evidence: WebEvidence[],
  candidateIdValue: string | null,
  candidateName: string | null,
  retrievedAt: string,
): EvidenceSource[] {
  const seenDomains = new Set<string>();
  return evidence.flatMap((item, index) => {
    const key = item.domain ?? item.url;
    if (seenDomains.has(key)) {
      return [];
    }
    seenDomains.add(key);
    const kind = sourceKind(item.domain);
    return [
      {
        id: `web-${index + 1}`,
        title: item.title,
        description:
          item.description || 'Exact number appears in this indexed result.',
        domain: item.domain,
        url: item.url,
        score: Math.max(72, 96 - index * 4),
        kind,
        candidateId: candidateIdValue,
        origin: sourceOrigin(item.domain, candidateName, kind),
        retrievalProvider: item.retrievalProvider,
        retrievedAt,
      },
    ];
  });
}

function toSpamSources(
  evidence: WebEvidence[],
  retrievedAt: string,
): EvidenceSource[] {
  return evidence.map((item, index) => ({
    id: `spam-report-${index + 1}`,
    title: item.title,
    description:
      item.description || 'Exact number appears in a public spam report.',
    domain: item.domain,
    url: item.url,
    score: 0,
    kind: 'SPAM_REPORT' as const,
    candidateId: null,
    origin: 'INDEPENDENT' as const,
    retrievalProvider: item.retrievalProvider,
    retrievedAt,
  }));
}

type PublicSearchOutcome = Readonly<{
  attribution: GoogleSearchAttribution | null;
  evidence: WebEvidence[];
  googleQueryCount: number;
  succeeded: boolean;
}>;

async function runPublicSearch(
  reference: DocumentReference,
  stage: GoogleGroundingStage,
  e164: string,
  candidateName: string | null,
): Promise<PublicSearchOutcome> {
  const isReputation = stage === 'reputation';
  await setStage(
    reference,
    stage,
    'RUNNING',
    isReputation
      ? 'Checking Google for public spam reports…'
      : 'Searching Google for exact-number pages…',
  );
  const startedAt = Date.now();
  try {
    const result = await lookupGoogleGroundedEvidence({
      candidateName,
      e164,
      model: googleGroundingModel.value(),
      projectId: googleGroundingProjectId.value(),
      stage,
    });
    logger.info('Lookup provider completed', {
      provider: isReputation
        ? 'google-grounding-reputation'
        : 'google-grounding-identity',
      outcome: 'success',
      model: googleGroundingModel.value(),
      groundedCitationCount: result.diagnostics.groundedCitationCount,
      googleQueryCount: result.diagnostics.googleQueryCount,
      verifiedCount: result.diagnostics.verifiedCount,
      rejected: result.diagnostics.rejected,
      latencyMs: Date.now() - startedAt,
    });
    await setStage(
      reference,
      stage,
      'COMPLETE',
      result.evidence.length
        ? isReputation
          ? `${result.evidence.length} verified public spam ${
              result.evidence.length === 1 ? 'report' : 'reports'
            } found`
          : `${result.evidence.length} verified public ${
              result.evidence.length === 1 ? 'page' : 'pages'
            } found`
        : isReputation
        ? 'No verified public spam reports found.'
        : 'No verified public pages found.',
    );
    return {
      attribution: result.attribution,
      evidence: result.evidence,
      googleQueryCount: result.diagnostics.googleQueryCount,
      succeeded: true,
    };
  } catch (googleError) {
    logger.warn('Lookup provider failed', {
      provider: isReputation
        ? 'google-grounding-reputation'
        : 'google-grounding-identity',
      model: googleGroundingModel.value(),
      groundedCitationCount: 0,
      googleQueryCount: 0,
      verifiedCount: 0,
      rejected: { request_failure: 1 },
      latencyMs: Date.now() - startedAt,
      ...providerFailureSummary(googleError),
    });

    if (shouldUseBraveSearchFallback(enableBraveSearchFallback.value(), true)) {
      try {
        const evidence = isReputation
          ? await lookupBraveSpamEvidence(e164, braveSearchApiKey.value())
          : await lookupBraveEvidence(
              e164,
              candidateName,
              braveSearchApiKey.value(),
            );
        logger.info('Lookup provider completed', {
          provider: isReputation
            ? 'brave-reputation-fallback'
            : 'brave-fallback',
          outcome: 'success',
          resultCount: evidence.length,
        });
        await setStage(
          reference,
          stage,
          'COMPLETE',
          evidence.length
            ? `${evidence.length} matching public ${
                evidence.length === 1 ? 'page' : 'pages'
              } found`
            : 'No matching public pages found.',
        );
        return {
          attribution: null,
          evidence,
          googleQueryCount: 0,
          succeeded: true,
        };
      } catch (braveError) {
        logger.warn('Lookup provider failed', {
          provider: isReputation
            ? 'brave-reputation-fallback'
            : 'brave-fallback',
          ...providerFailureSummary(braveError),
        });
      }
    }

    await setStage(
      reference,
      stage,
      'FAILED',
      isReputation
        ? 'Public spam-report source did not answer.'
        : 'Public web source did not answer.',
    );
    return {
      attribution: null,
      evidence: [],
      googleQueryCount: 0,
      succeeded: false,
    };
  }
}

async function finishFailedLookup(
  reference: DocumentReference,
  uid: string,
  lookupId: string,
  metrics: Omit<
    ProviderBudgetMetrics,
    'creditOutcome' | 'creditSource' | 'planName' | 'resultOutcome'
  >,
): Promise<void> {
  const settlement = await settleLookupCredit(
    uid,
    lookupId,
    'TECHNICAL_FAILURE',
  );
  await reference.update({
    creditOutcome: settlement.creditOutcome,
    status: 'FAILED',
    errorMessage:
      'We could not reach any lookup sources. Your credit was returned.',
    updatedAt: new Date().toISOString(),
  });
  await completeProviderBudgetReservation(uid, lookupId, {
    ...metrics,
    creditOutcome: settlement.creditOutcome,
    creditSource: settlement.source,
    planName: settlement.planName,
    resultOutcome: null,
  });
  logger.info('Lookup economics', {
    cacheHit: false,
    creditOutcome: settlement.creditOutcome,
    creditSource: settlement.source,
    estimatedCostCents: providerBudgetReservationCents.value(),
    googleQueryCount: metrics.googleQueryCount,
    identitySucceeded: metrics.identitySucceeded,
    latencyMs: metrics.latencyMs,
    noResultRefundsRemaining: settlement.noResultRefundsRemaining,
    planName: settlement.planName,
    reputationSucceeded: metrics.reputationSucceeded,
    resultOutcome: null,
    validationSucceeded: metrics.validationSucceeded,
    webSucceeded: metrics.webSucceeded,
  });
}

export const runLookup = onTaskDispatched<LookupTask>(
  {
    region: 'us-east4',
    timeoutSeconds: 120,
    retryConfig: {
      maxAttempts: 3,
      maxRetrySeconds: 300,
      minBackoffSeconds: 10,
    },
    rateLimits: { maxConcurrentDispatches: 8, maxDispatchesPerSecond: 4 },
    secrets: [
      trestleApiKey,
      twilioAccountSid,
      twilioAuthToken,
      braveSearchApiKey,
    ],
  },
  async request => {
    const { uid, lookupId } = request.data;
    const reference = lookupReference(uid, lookupId);
    const lookup = await claimLookupRun(reference);
    if (!lookup) {
      return;
    }

    const lookupStartedAt = Date.now();
    await markProviderAttemptStarted(uid, lookupId);
    const failures: string[] = [];
    let validation: PhoneValidation | null = null;
    let owners: IdentityOwner[] = [];
    let evidence: WebEvidence[] = [];
    let spamEvidence: WebEvidence[] = [];
    let validationSucceeded = false;
    let identitySucceeded = false;
    let webSucceeded = false;
    let reputationSucceeded = false;
    let searchAttributions: GoogleSearchAttribution[] = [];

    await setStage(
      reference,
      'validation',
      'RUNNING',
      'Validating phone number…',
    );
    try {
      validation = await lookupTwilio(
        lookup.phoneE164,
        twilioAccountSid.value(),
        twilioAuthToken.value(),
      );
      validationSucceeded = true;
      logger.info('Lookup provider completed', {
        provider: 'twilio',
        outcome: 'success',
      });
      await setStage(
        reference,
        'validation',
        'COMPLETE',
        validation.valid
          ? `${validation.carrier ?? 'Carrier'} · ${
              validation.lineType ?? 'Line type unavailable'
            }`
          : 'Number could not be validated.',
      );
    } catch (error) {
      failures.push('validation');
      logger.warn('Lookup provider failed', {
        provider: 'twilio',
        ...providerFailureSummary(error),
      });
      await setStage(
        reference,
        'validation',
        'FAILED',
        'Validation source did not answer.',
      );
    }

    await setStage(
      reference,
      'identity',
      'RUNNING',
      'Searching identity databases…',
    );
    try {
      owners = await lookupTrestle(lookup.phoneE164, trestleApiKey.value());
      identitySucceeded = true;
      logger.info('Lookup provider completed', {
        provider: 'trestle',
        outcome: 'success',
        resultCount: owners.length,
      });
      await setStage(
        reference,
        'identity',
        'COMPLETE',
        owners.length
          ? `${owners.length} candidate ${
              owners.length === 1 ? 'name' : 'names'
            } found`
          : 'No identity candidates found.',
      );
    } catch (error) {
      failures.push('identity');
      logger.warn('Lookup provider failed', {
        provider: 'trestle',
        ...providerFailureSummary(error),
      });
      await setStage(
        reference,
        'identity',
        'FAILED',
        'Identity source did not answer.',
      );
    }

    const initialCandidates = toCandidates(owners, validation);
    const [webOutcome, reputationOutcome] = await Promise.all([
      runPublicSearch(
        reference,
        'web',
        lookup.phoneE164,
        initialCandidates[0]?.name ?? null,
      ),
      runPublicSearch(reference, 'reputation', lookup.phoneE164, null),
    ]);
    evidence = webOutcome.evidence;
    spamEvidence = reputationOutcome.evidence;
    webSucceeded = webOutcome.succeeded;
    reputationSucceeded = reputationOutcome.succeeded;
    searchAttributions = [
      webOutcome.attribution,
      reputationOutcome.attribution,
    ].filter(
      (attribution): attribution is GoogleSearchAttribution =>
        attribution !== null,
    );
    if (!webSucceeded) {
      failures.push('web');
    }
    if (!reputationSucceeded) {
      failures.push('reputation');
    }

    if (
      !validationSucceeded &&
      !identitySucceeded &&
      !webSucceeded &&
      !reputationSucceeded
    ) {
      await finishFailedLookup(reference, uid, lookupId, {
        googleQueryCount:
          webOutcome.googleQueryCount + reputationOutcome.googleQueryCount,
        identitySucceeded,
        latencyMs: Date.now() - lookupStartedAt,
        reputationSucceeded,
        validationSucceeded,
        webSucceeded,
      });
      return;
    }

    await setStage(reference, 'confidence', 'RUNNING', 'Scoring confidence…');
    const candidateIdValue = initialCandidates[0]?.id ?? null;
    const checkedAt = new Date().toISOString();
    const sources: EvidenceSource[] = [
      ...(owners.length
        ? [
            {
              id: 'trestle-identity',
              title: 'Identity database',
              description: `${owners.length} candidate ${
                owners.length === 1 ? 'name' : 'names'
              } linked to this number.`,
              domain: null,
              url: null,
              score: 86,
              kind: 'IDENTITY' as const,
              candidateId: null,
              origin: 'INDEPENDENT' as const,
              retrievalProvider: null,
              retrievedAt: checkedAt,
            },
          ]
        : []),
      ...(validation?.callerName
        ? [
            {
              id: 'twilio-cnam',
              title: validation.callerName,
              description: 'Caller name returned by the telecom provider.',
              domain: null,
              url: null,
              score: 82,
              kind: 'CNAM' as const,
              candidateId: candidateIdValue,
              origin: 'INDEPENDENT' as const,
              retrievalProvider: null,
              retrievedAt: checkedAt,
            },
          ]
        : []),
      ...toWebSources(
        evidence,
        candidateIdValue,
        initialCandidates[0]?.name ?? null,
        checkedAt,
      ),
    ].sort((left, right) => right.score - left.score);
    const candidates = scoreCandidates(
      initialCandidates,
      owners,
      sources,
      validation,
    );
    const primary = candidates[0] ?? null;
    const spamSources = toSpamSources(spamEvidence, checkedAt);
    const result: LookupResult = {
      phoneDisplay: validation?.phoneDisplay ?? lookup.phoneDisplay,
      carrier: validation?.carrier ?? null,
      lineType: validation?.lineType ?? null,
      region: primary?.region ?? null,
      checkedAt,
      confidenceScore: primary?.score ?? 0,
      confidenceLabel: primary?.confidenceLabel ?? 'LOW',
      primaryCandidateId: primary?.id ?? null,
      candidates,
      sources,
      spamSources,
      searchAttributions,
      isPartial: failures.length > 0,
    };
    const currentCommunityReportCount = await communityReportCount(
      lookup.numberKey,
    );
    const resultOutcome = resultOutcomeFor(result, currentCommunityReportCount);

    await setStage(
      reference,
      'confidence',
      'COMPLETE',
      `${result.confidenceLabel.toLocaleLowerCase()} confidence from ${
        sources.length
      } sources.`,
    );
    const settlementReason = creditSettlementReasonFor({
      isPartial: result.isPartial,
      noResultRefundsEnabled: noResultRefundsEnabled.value(),
      resultOutcome,
    });
    const settlement = await settleLookupCredit(
      uid,
      lookup.creditReservationId ?? lookupId,
      settlementReason,
    );
    const db = getFirestore();
    const batch = db.batch();
    if (
      shouldCacheLookupResult({ isPartial: result.isPartial, resultOutcome })
    ) {
      batch.set(
        cacheReference(lookup.numberKey),
        {
          result,
          resultOutcome,
          retrievalVersion,
          updatedAt: checkedAt,
          expiresAt: new Date(
            Date.now() + lookupCacheLifetimeMs(resultOutcome),
          ).toISOString(),
        },
        { merge: true },
      );
    }
    batch.update(reference, {
      status: 'COMPLETE',
      result,
      resultOutcome,
      displayName: primary?.name ?? 'Unknown caller',
      phoneDisplay: result.phoneDisplay,
      confidenceLabel: result.confidenceLabel,
      confidenceScore: result.confidenceScore,
      spamReportCount: currentCommunityReportCount,
      creditOutcome: settlement.creditOutcome,
      completedAt: checkedAt,
      updatedAt: checkedAt,
    });
    await batch.commit();
    const googleQueryCount =
      webOutcome.googleQueryCount + reputationOutcome.googleQueryCount;
    await completeProviderBudgetReservation(uid, lookupId, {
      creditOutcome: settlement.creditOutcome,
      creditSource: settlement.source,
      googleQueryCount,
      identitySucceeded,
      latencyMs: Date.now() - lookupStartedAt,
      planName: settlement.planName,
      resultOutcome,
      reputationSucceeded,
      validationSucceeded,
      webSucceeded,
    });
    logger.info('Lookup economics', {
      cacheHit: false,
      creditOutcome: settlement.creditOutcome,
      creditSource: settlement.source,
      estimatedCostCents: providerBudgetReservationCents.value(),
      googleQueryCount,
      identitySucceeded,
      latencyMs: Date.now() - lookupStartedAt,
      noResultRefundsRemaining: settlement.noResultRefundsRemaining,
      planName: settlement.planName,
      reputationSucceeded,
      resultOutcome,
      validationSucceeded,
      webSucceeded,
    });
  },
);

export const submitCommunitySubmission = onCall(
  lookupCallableOptions,
  async request => {
    const uid = requireUid(request);
    try {
      const input = communitySubmissionSchema.parse(request.data);
      const lookup = await lookupReference(uid, input.lookupId).get();
      const numberKey = lookup.data()?.numberKey;
      if (!lookup.exists || typeof numberKey !== 'string') {
        throw new HttpsError(
          'not-found',
          'That lookup is no longer available.',
        );
      }

      const user = await (await import('firebase-admin/auth'))
        .getAuth()
        .getUser(uid);
      const displayName = user.displayName?.trim() || 'Whoo user';
      const db = getFirestore();

      if (input.kind === 'COMMENT') {
        const latest = await db
          .collection('communitySubmissionOwners')
          .where('authorUid', '==', uid)
          .where('numberKey', '==', numberKey)
          .where('kind', '==', 'COMMENT')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        const latestAt = latest.docs[0]?.data().createdAt;
        if (
          latestAt?.toDate &&
          Date.now() - latestAt.toDate().getTime() < 30_000
        ) {
          throw new HttpsError(
            'resource-exhausted',
            'Please wait before posting another comment.',
          );
        }
      }

      const submissionId =
        input.kind === 'REPORT'
          ? `report_${numberKeyFor(`${numberKey}:${uid}`)}`
          : db.collection('communitySubmissions').doc().id;
      const submissionRef = db.doc(`communitySubmissions/${submissionId}`);
      const ownerRef = communityOwnerReference(submissionId);
      const userSubmissionRef = userCommunitySubmissionReference(
        uid,
        submissionId,
      );
      const summaryRef = communitySummaryReference(numberKey);
      let reportCount = 0;
      let commentCount = 0;

      await db.runTransaction(async transaction => {
        const [existing, owner, summary] = await Promise.all([
          transaction.get(submissionRef),
          transaction.get(ownerRef),
          transaction.get(summaryRef),
        ]);
        if (owner.exists && owner.data()?.authorUid !== uid) {
          throw new HttpsError(
            'permission-denied',
            'You can only update your own contribution.',
          );
        }
        reportCount =
          typeof summary.data()?.reportCount === 'number'
            ? summary.data()!.reportCount
            : 0;
        commentCount =
          typeof summary.data()?.commentCount === 'number'
            ? summary.data()!.commentCount
            : 0;
        if (input.kind === 'REPORT' && existing.exists) {
          throw new HttpsError(
            'already-exists',
            'Delete your existing report before submitting a new one.',
          );
        }
        const isNew = !existing.exists;
        if (input.kind === 'REPORT' && isNew) {
          reportCount += 1;
        }
        if (input.kind === 'COMMENT') {
          commentCount += 1;
        }

        transaction.set(
          submissionRef,
          {
            displayName,
            kind: input.kind,
            lookupId: input.lookupId,
            numberKey,
            note: input.note ?? null,
            tag: input.tag,
            createdAt:
              existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          ownerRef,
          {
            authorUid: uid,
            numberKey,
            kind: input.kind,
            createdAt: owner.data()?.createdAt ?? FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          userSubmissionRef,
          {
            submissionId,
            createdAt:
              existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(
          summaryRef,
          {
            reportCount,
            commentCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });

      return { submissionId, reportCount, commentCount };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError(
          'invalid-argument',
          'Complete the community post before submitting.',
        );
      }
      throw error;
    }
  },
);

export const deleteCommunitySubmission = onCall(
  lookupCallableOptions,
  async request => {
    const uid = requireUid(request);
    try {
      const { submissionId } = deleteCommunitySubmissionSchema.parse(
        request.data,
      );
      const db = getFirestore();
      const submissionRef = db.doc(`communitySubmissions/${submissionId}`);
      const ownerRef = communityOwnerReference(submissionId);

      await db.runTransaction(async transaction => {
        const [submission, owner] = await Promise.all([
          transaction.get(submissionRef),
          transaction.get(ownerRef),
        ]);
        if (
          !submission.exists ||
          !owner.exists ||
          owner.data()?.authorUid !== uid
        ) {
          throw new HttpsError(
            'permission-denied',
            'You can only delete your own contribution.',
          );
        }
        const numberKey = owner.data()?.numberKey;
        const kind = owner.data()?.kind;
        if (
          typeof numberKey !== 'string' ||
          (kind !== 'REPORT' && kind !== 'COMMENT')
        ) {
          throw new HttpsError(
            'failed-precondition',
            'This contribution is invalid.',
          );
        }
        const summaryRef = communitySummaryReference(numberKey);
        const summary = await transaction.get(summaryRef);
        const reportCount = Math.max(
          0,
          (typeof summary.data()?.reportCount === 'number'
            ? summary.data()!.reportCount
            : 0) - (kind === 'REPORT' ? 1 : 0),
        );
        const commentCount = Math.max(
          0,
          (typeof summary.data()?.commentCount === 'number'
            ? summary.data()!.commentCount
            : 0) - (kind === 'COMMENT' ? 1 : 0),
        );
        transaction.delete(submissionRef);
        transaction.delete(ownerRef);
        transaction.delete(userCommunitySubmissionReference(uid, submissionId));
        transaction.set(
          summaryRef,
          {
            reportCount,
            commentCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      return null;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError(
          'invalid-argument',
          'This contribution could not be removed.',
        );
      }
      throw error;
    }
  },
);
