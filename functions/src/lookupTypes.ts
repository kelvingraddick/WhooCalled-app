import { createHash } from 'node:crypto';

export const lookupStageKeys = [
  'validation',
  'identity',
  'web',
  'reputation',
  'confidence',
] as const;

export type LookupStageKey = (typeof lookupStageKeys)[number];
export type LookupStageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETE'
  | 'FAILED'
  | 'SKIPPED';
export type LookupStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
export type ConfidenceLabel = 'VERY HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
export const confidenceFactorKeys = [
  'BASE_CONFIDENCE',
  'IDENTITY_ASSOCIATION',
  'CROSS_SOURCE_CORROBORATION',
  'CALLER_NAME_MATCH',
  'NUMBER_VALIDATION',
] as const;
export type ConfidenceFactorKey = (typeof confidenceFactorKeys)[number];
export type ConfidenceFactors = Readonly<Record<ConfidenceFactorKey, number>>;
export type CommunityTag =
  | 'SPAM'
  | 'SCAM'
  | 'WRONG_IDENTITY'
  | 'LEGITIMATE_BUSINESS'
  | 'OTHER';

export type LookupStage = Readonly<{
  status: LookupStageStatus;
  detail: string;
}>;

export type CallerCandidate = Readonly<{
  id: string;
  name: string;
  kind: 'BUSINESS' | 'PERSON' | 'UNKNOWN';
  region: string | null;
  score: number;
  confidenceLabel: ConfidenceLabel;
  confidenceFactors: ConfidenceFactors;
}>;

export type EvidenceSource = Readonly<{
  id: string;
  title: string;
  description: string;
  domain: string | null;
  url: string | null;
  score: number;
  kind: 'WEB' | 'DIRECTORY' | 'CNAM' | 'IDENTITY' | 'SPAM_REPORT';
  candidateId: string | null;
  origin: 'FIRST_PARTY' | 'INDEPENDENT';
  retrievalProvider: 'GOOGLE_GROUNDING' | 'BRAVE' | null;
  retrievedAt: string;
}>;

export type SearchAttribution = Readonly<{
  stage: 'web' | 'reputation';
  provider: 'GOOGLE_GROUNDING';
  renderedContent: string;
  webSearchQueries: string[];
}>;

export type LookupResult = Readonly<{
  phoneDisplay: string;
  carrier: string | null;
  lineType: string | null;
  region: string | null;
  checkedAt: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  primaryCandidateId: string | null;
  candidates: CallerCandidate[];
  sources: EvidenceSource[];
  spamSources: EvidenceSource[];
  searchAttributions: SearchAttribution[];
  isPartial: boolean;
}>;

export function shouldReleaseCreditForPartialResult(
  result: LookupResult,
): boolean {
  return (
    result.isPartial &&
    result.candidates.length === 0 &&
    result.sources.length === 0 &&
    result.spamSources.length === 0 &&
    result.carrier === null &&
    result.lineType === null
  );
}

export function cacheMatchesRetrievalVersion(
  data: Readonly<Record<string, unknown>> | undefined,
  expectedVersion: string,
): boolean {
  return data?.retrievalVersion === expectedVersion;
}

export type LookupTask = Readonly<{
  uid: string;
  lookupId: string;
}>;

export function formatUsPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '').replace(/^1/, '');
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeUsPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (
    national.length !== 10 ||
    national.startsWith('0') ||
    national.startsWith('1')
  ) {
    throw new Error('A valid US phone number is required.');
  }

  return `+1${national}`;
}

export function numberKeyFor(e164: string): string {
  return createHash('sha256').update(e164).digest('hex');
}

export function confidenceLabelFor(score: number): ConfidenceLabel {
  if (score >= 90) {
    return 'VERY HIGH';
  }
  if (score >= 75) {
    return 'HIGH';
  }
  if (score >= 50) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function initialStages(): Record<LookupStageKey, LookupStage> {
  return {
    validation: { status: 'PENDING', detail: 'Checking number details…' },
    identity: { status: 'PENDING', detail: 'Searching identity databases…' },
    web: { status: 'PENDING', detail: 'Searching indexed pages…' },
    reputation: { status: 'PENDING', detail: 'Checking public spam reports…' },
    confidence: { status: 'PENDING', detail: 'Scoring confidence…' },
  };
}
