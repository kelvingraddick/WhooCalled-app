import type { EvidenceSource } from './lookupTypes';

export function sourceOrigin(
  domain: string | null,
  candidateName: string | null,
  kind: EvidenceSource['kind'],
): EvidenceSource['origin'] {
  if (!domain || !candidateName || kind !== 'WEB') {
    return 'INDEPENDENT';
  }
  const normalizedCandidate = candidateName
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const normalizedDomain = domain
    .toLocaleLowerCase()
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/[^a-z0-9]/g, '');
  return normalizedCandidate &&
    normalizedDomain &&
    (normalizedDomain.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedDomain))
    ? 'FIRST_PARTY'
    : 'INDEPENDENT';
}
