export type PendingLookup = Readonly<{
  phoneInput: string;
  countryHint: 'US';
}>;

export type ConfidenceLabel = 'VERY HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ConfidenceFactorKey =
  | 'BASE_CONFIDENCE'
  | 'IDENTITY_ASSOCIATION'
  | 'CROSS_SOURCE_CORROBORATION'
  | 'CALLER_NAME_MATCH'
  | 'NUMBER_VALIDATION';
export type ConfidenceFactors = Readonly<Record<ConfidenceFactorKey, number>>;
export type LookupRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
export type LookupStageKey =
  | 'validation'
  | 'identity'
  | 'web'
  | 'reputation'
  | 'confidence';
export type LookupStageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETE'
  | 'FAILED'
  | 'SKIPPED';
export type CommunityTag =
  | 'SPAM'
  | 'SCAM'
  | 'WRONG_IDENTITY'
  | 'LEGITIMATE_BUSINESS'
  | 'OTHER';

export const spamReportCategories = [
  'SPAM',
  'SCAM_FRAUD',
  'TELEMARKETING',
  'ROBOCALL',
  'DEBT_COLLECTION',
  'POLITICAL',
  'SURVEY',
  'OTHER',
] as const;

export type SpamReportCategory = (typeof spamReportCategories)[number];
export type CommunitySubmissionTag = CommunityTag | SpamReportCategory;

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

export type LookupDetail = Readonly<{
  id: string;
  status: LookupRunStatus;
  phoneDisplay: string;
  numberKey: string;
  stages: Readonly<Record<LookupStageKey, LookupStage>>;
  result: LookupResult | null;
  errorMessage: string | null;
}>;

export type LookupHistoryItem = Readonly<{
  id: string;
  displayName: string;
  phoneDisplay: string;
  confidenceLabel: ConfidenceLabel;
  confidenceScore: number;
  spamReportCount: number;
}>;

export type LookupHistoryPage = Readonly<{
  lookups: LookupHistoryItem[];
  cursor: unknown | null;
  hasMore: boolean;
}>;

export type CommunitySubmission = Readonly<{
  id: string;
  displayName: string;
  kind: 'REPORT' | 'COMMENT';
  tag: CommunitySubmissionTag;
  note: string | null;
  createdAt: string | null;
}>;

export type CommunitySummary = Readonly<{
  reportCount: number;
  commentCount: number;
}>;

export type LookupRequestState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'message'; message: string; tone: 'neutral' | 'error' }>;
