import type { IdentityOwner, PhoneValidation } from './lookupProviders';
import {
  confidenceLabelFor,
  type CallerCandidate,
  type ConfidenceFactors,
  type EvidenceSource,
} from './lookupTypes';

export function emptyConfidenceFactors(): ConfidenceFactors {
  return {
    BASE_CONFIDENCE: 0,
    IDENTITY_ASSOCIATION: 0,
    CROSS_SOURCE_CORROBORATION: 0,
    CALLER_NAME_MATCH: 0,
    NUMBER_VALIDATION: 0,
  };
}

export function scoreCandidates(
  candidates: CallerCandidate[],
  owners: IdentityOwner[],
  sources: EvidenceSource[],
  validation: PhoneValidation | null,
): CallerCandidate[] {
  return candidates
    .map(candidate => {
      const exactWebDomains = new Set(
        sources
          .filter(source => source.candidateId === candidate.id && source.url)
          .map(source => source.domain ?? source.url!),
      ).size;
      const hasIdentity = owners.some(owner => owner.name === candidate.name);
      const hasCnam =
        validation?.callerName?.toLocaleLowerCase() ===
        candidate.name.toLocaleLowerCase();
      const confidenceFactors: ConfidenceFactors = {
        BASE_CONFIDENCE: 40,
        IDENTITY_ASSOCIATION: hasIdentity ? 20 : 0,
        CROSS_SOURCE_CORROBORATION: Math.min(30, exactWebDomains * 15),
        CALLER_NAME_MATCH: hasCnam ? 5 : 0,
        NUMBER_VALIDATION: validation?.valid ? 5 : 0,
      };
      const score = Math.min(
        100,
        Object.values(confidenceFactors).reduce(
          (total, value) => total + value,
          0,
        ),
      );
      const hasVeryHighEvidence = hasIdentity && exactWebDomains >= 2;

      return {
        ...candidate,
        score,
        confidenceFactors,
        confidenceLabel:
          score >= 90 && hasVeryHighEvidence
            ? 'VERY HIGH'
            : confidenceLabelFor(Math.min(score, 89)),
      };
    })
    .sort((left, right) => right.score - left.score);
}
