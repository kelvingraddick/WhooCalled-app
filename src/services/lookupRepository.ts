import { getApp } from '@react-native-firebase/app';
import {
  doc,
  getFirestore,
  onSnapshot,
} from '@react-native-firebase/firestore';

import type {
  CallerCandidate,
  ConfidenceFactors,
  ConfidenceLabel,
  EvidenceSource,
  LookupDetail,
  LookupResult,
  LookupRunStatus,
  LookupStageKey,
} from '../types/lookup';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function confidenceLabel(value: unknown): ConfidenceLabel {
  return value === 'VERY HIGH' ||
    value === 'HIGH' ||
    value === 'MEDIUM' ||
    value === 'LOW'
    ? value
    : 'LOW';
}

function confidenceFactors(value: unknown): ConfidenceFactors {
  const item = record(value);
  return {
    BASE_CONFIDENCE: number(item.BASE_CONFIDENCE),
    IDENTITY_ASSOCIATION: number(item.IDENTITY_ASSOCIATION),
    CROSS_SOURCE_CORROBORATION: number(item.CROSS_SOURCE_CORROBORATION),
    CALLER_NAME_MATCH: number(item.CALLER_NAME_MATCH),
    NUMBER_VALIDATION: number(item.NUMBER_VALIDATION),
  };
}

function status(value: unknown): LookupRunStatus {
  return value === 'QUEUED' ||
    value === 'RUNNING' ||
    value === 'COMPLETE' ||
    value === 'FAILED'
    ? value
    : 'FAILED';
}

function candidate(value: unknown): CallerCandidate {
  const item = record(value);
  const kind = item.kind;
  return {
    id: string(item.id),
    name: string(item.name, 'Unknown caller'),
    kind:
      kind === 'BUSINESS' || kind === 'PERSON' || kind === 'UNKNOWN'
        ? kind
        : 'UNKNOWN',
    region: nullableString(item.region),
    score: number(item.score),
    confidenceLabel: confidenceLabel(item.confidenceLabel),
    confidenceFactors: confidenceFactors(item.confidenceFactors),
  };
}

function source(value: unknown): EvidenceSource {
  const item = record(value);
  const kind = item.kind;
  const retrievalProvider = item.retrievalProvider;
  return {
    id: string(item.id),
    title: string(item.title, 'Source'),
    description: string(item.description),
    domain: nullableString(item.domain),
    url: nullableString(item.url),
    score: number(item.score),
    kind:
      kind === 'WEB' ||
      kind === 'DIRECTORY' ||
      kind === 'CNAM' ||
      kind === 'IDENTITY' ||
      kind === 'SPAM_REPORT'
        ? kind
        : 'WEB',
    candidateId: nullableString(item.candidateId),
    origin: item.origin === 'FIRST_PARTY' ? 'FIRST_PARTY' : 'INDEPENDENT',
    retrievalProvider:
      retrievalProvider === 'GOOGLE_GROUNDING' || retrievalProvider === 'BRAVE'
        ? retrievalProvider
        : null,
    retrievedAt: string(item.retrievedAt),
  };
}

function searchAttribution(
  value: unknown,
): LookupResult['searchAttributions'][number] | null {
  const item = record(value);
  if (
    (item.stage !== 'web' && item.stage !== 'reputation') ||
    item.provider !== 'GOOGLE_GROUNDING' ||
    typeof item.renderedContent !== 'string'
  ) {
    return null;
  }
  return {
    stage: item.stage,
    provider: 'GOOGLE_GROUNDING',
    renderedContent: item.renderedContent,
    webSearchQueries: Array.isArray(item.webSearchQueries)
      ? item.webSearchQueries.filter(
          (query): query is string => typeof query === 'string',
        )
      : [],
  };
}

function result(value: unknown): LookupResult | null {
  const item = record(value);
  if (!Object.keys(item).length) {
    return null;
  }

  return {
    phoneDisplay: string(item.phoneDisplay, 'Number unavailable'),
    carrier: nullableString(item.carrier),
    lineType: nullableString(item.lineType),
    region: nullableString(item.region),
    checkedAt: string(item.checkedAt),
    confidenceScore: number(item.confidenceScore),
    confidenceLabel: confidenceLabel(item.confidenceLabel),
    primaryCandidateId: nullableString(item.primaryCandidateId),
    candidates: Array.isArray(item.candidates)
      ? item.candidates.map(candidate)
      : [],
    sources: Array.isArray(item.sources) ? item.sources.map(source) : [],
    spamSources: Array.isArray(item.spamSources)
      ? item.spamSources.map(source)
      : [],
    searchAttributions: Array.isArray(item.searchAttributions)
      ? item.searchAttributions
          .map(searchAttribution)
          .filter(
            (attribution): attribution is NonNullable<typeof attribution> =>
              attribution !== null,
          )
      : [],
    isPartial: item.isPartial === true,
  };
}

function stages(value: unknown): LookupDetail['stages'] {
  const values = record(value);
  const stageFor = (
    key: LookupStageKey,
  ): LookupDetail['stages'][LookupStageKey] => {
    const stage = record(values[key]);
    const stageStatus = stage.status;
    return {
      status:
        stageStatus === 'PENDING' ||
        stageStatus === 'RUNNING' ||
        stageStatus === 'COMPLETE' ||
        stageStatus === 'FAILED' ||
        stageStatus === 'SKIPPED'
          ? stageStatus
          : 'PENDING',
      detail: string(stage.detail),
    };
  };
  return {
    validation: stageFor('validation'),
    identity: stageFor('identity'),
    web: stageFor('web'),
    reputation: stageFor('reputation'),
    confidence: stageFor('confidence'),
  };
}

export function lookupDetailFromDocument(
  id: string,
  value: unknown,
): LookupDetail {
  const item = record(value);
  return {
    id,
    status: status(item.status),
    phoneDisplay: string(item.phoneDisplay, 'Number unavailable'),
    numberKey: string(item.numberKey),
    stages: stages(item.stages),
    result: result(item.result),
    errorMessage: nullableString(item.errorMessage),
  };
}

export function observeLookup(
  uid: string,
  lookupId: string,
  listener: (lookup: LookupDetail | null) => void,
  onError: () => void,
): () => void {
  return onSnapshot(
    doc(getFirestore(getApp()), 'users', uid, 'lookups', lookupId),
    snapshot =>
      listener(
        snapshot.exists()
          ? lookupDetailFromDocument(snapshot.id, snapshot.data())
          : null,
      ),
    onError,
  );
}
