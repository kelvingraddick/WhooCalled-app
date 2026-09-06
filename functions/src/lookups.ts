import { getFunctions } from 'firebase-admin/functions';
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
import { defineBoolean, defineString } from 'firebase-functions/params';
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
  captureLookupCredit,
  getSettingsBalance,
  releaseLookupCredit,
  reserveLookupCredit,
} from './settings';
import {
  formatUsPhone,
  cacheMatchesRetrievalVersion,
  initialStages,
  normalizeUsPhone,
  numberKeyFor,
  shouldReleaseCreditForPartialResult,
  type CallerCandidate,
  type EvidenceSource,
  type LookupResult,
  type LookupStageKey,
  type LookupStatus,
  type LookupTask,
} from './lookupTypes';
import { emptyConfidenceFactors, scoreCandidates } from './lookupScoring';
import { sourceOrigin } from './sourceMetadata';

const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: false });
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
const cacheLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const retrievalVersion = 'google-grounding-v1';

type LookupDocument = Readonly<{
  status: LookupStatus;
  numberKey: string;
  phoneE164: string;
  phoneDisplay: string;
  requestId: string;
  mode: 'INITIAL' | 'REFRESH';
  creditReservationId: string;
  result?: LookupResult;
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
    | 'INSUFFICIENT_CREDITS'
    | 'PROVIDER_NOT_CONFIGURED',
  message: string,
  balance: Awaited<ReturnType<typeof getSettingsBalance>>,
) {
  return { requestId, lookupId, status, message, balance };
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
      const existing = existingRun.data() as Partial<LookupDocument>;
      return responseFor(
        input.requestId,
        lookupId,
        existing.status === 'COMPLETE' ? 'COMPLETE' : 'ACCEPTED',
        existing.status === 'COMPLETE'
          ? 'Lookup is ready.'
          : 'Lookup is already in progress.',
        await getSettingsBalance(uid),
      );
    }

    const numberKey = numberKeyFor(phoneE164);
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

    const now = new Date().toISOString();
    const cache =
      input.mode === 'INITIAL' ? await cacheReference(numberKey).get() : null;
    const cacheData = cache?.data() as Record<string, unknown> | undefined;

    if (
      isFreshCache(cacheData) &&
      !shouldReleaseCreditForPartialResult(cacheData.result)
    ) {
      await reference.create({
        creditReservationId: lookupId,
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
        stages: completedStages('Reused a recently completed lookup.'),
        status: 'COMPLETE',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
        confidenceLabel: cacheData.result.confidenceLabel,
        confidenceScore: cacheData.result.confidenceScore,
        spamReportCount: 0,
      });
      await captureLookupCredit(uid, lookupId);
      return responseFor(
        input.requestId,
        lookupId,
        'COMPLETE',
        'Lookup is ready.',
        await getSettingsBalance(uid),
      );
    }

    await reference.create({
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

    try {
      await enqueueLookup({ uid, lookupId });
    } catch {
      await Promise.all([
        reference.update({
          status: 'FAILED',
          errorMessage:
            'We could not start this lookup. Your credit was returned.',
          updatedAt: new Date().toISOString(),
        }),
        releaseLookupCredit(uid, lookupId),
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
  const fromOwners = owners.slice(0, 3).map((owner, index) => ({
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
        return { attribution: null, evidence, succeeded: true };
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
    return { attribution: null, evidence: [], succeeded: false };
  }
}

async function finishFailedLookup(
  reference: DocumentReference,
  uid: string,
  lookupId: string,
): Promise<void> {
  await releaseLookupCredit(uid, lookupId);
  await reference.update({
    status: 'FAILED',
    errorMessage:
      'We could not reach any lookup sources. Your credit was returned.',
    updatedAt: new Date().toISOString(),
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
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      return;
    }
    const lookup = snapshot.data() as LookupDocument;
    if (lookup.status === 'COMPLETE' || lookup.status === 'FAILED') {
      return;
    }

    await reference.update({
      status: 'RUNNING',
      updatedAt: new Date().toISOString(),
    });
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
      await finishFailedLookup(reference, uid, lookupId);
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
              candidateId: candidateIdValue,
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

    await setStage(
      reference,
      'confidence',
      'COMPLETE',
      `${result.confidenceLabel.toLocaleLowerCase()} confidence from ${
        sources.length
      } sources.`,
    );
    const creditReturned = shouldReleaseCreditForPartialResult(result);
    if (creditReturned) {
      await releaseLookupCredit(uid, lookup.creditReservationId);
      logger.info('Lookup credit returned for an evidence-free partial result');
    } else {
      await captureLookupCredit(uid, lookup.creditReservationId);
    }
    const db = getFirestore();
    const batch = db.batch();
    if (!creditReturned) {
      batch.set(
        cacheReference(lookup.numberKey),
        {
          result,
          retrievalVersion,
          updatedAt: checkedAt,
          expiresAt: new Date(Date.now() + cacheLifetimeMs).toISOString(),
        },
        { merge: true },
      );
    }
    batch.update(reference, {
      status: 'COMPLETE',
      result,
      displayName: primary?.name ?? 'Unknown caller',
      phoneDisplay: result.phoneDisplay,
      confidenceLabel: result.confidenceLabel,
      confidenceScore: result.confidenceScore,
      spamReportCount: 0,
      creditOutcome: creditReturned ? 'RETURNED' : 'CAPTURED',
      completedAt: checkedAt,
      updatedAt: checkedAt,
    });
    await batch.commit();
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
