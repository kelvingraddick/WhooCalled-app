import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyConfidenceFactors, scoreCandidates } from './lookupScoring';
import type { CallerCandidate, EvidenceSource } from './lookupTypes';

const candidate: CallerCandidate = {
  id: 'candidate-a',
  name: 'Johnson HVAC',
  kind: 'BUSINESS',
  region: 'GA',
  score: 0,
  confidenceLabel: 'LOW',
  confidenceFactors: emptyConfidenceFactors(),
};

const twoExactSources: EvidenceSource[] = [
  {
    id: 'web-a',
    title: 'Contact',
    description: 'Exact number match',
    domain: 'johnsonhvac.example',
    url: 'https://johnsonhvac.example/contact',
    score: 96,
    kind: 'WEB',
    candidateId: 'candidate-a',
    origin: 'FIRST_PARTY',
    retrievalProvider: 'GOOGLE_GROUNDING',
    retrievedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'web-b',
    title: 'Directory',
    description: 'Exact number match',
    domain: 'directory.example',
    url: 'https://directory.example/johnson-hvac',
    score: 91,
    kind: 'DIRECTORY',
    candidateId: 'candidate-a',
    origin: 'INDEPENDENT',
    retrievalProvider: 'GOOGLE_GROUNDING',
    retrievedAt: '2026-09-01T00:00:00.000Z',
  },
];

test('very high confidence requires identity plus two independent exact sources', () => {
  const scored = scoreCandidates(
    [candidate],
    [{ name: 'Johnson HVAC', kind: 'BUSINESS', region: 'GA' }],
    twoExactSources,
    {
      valid: true,
      phoneDisplay: '(404) 555-1212',
      carrier: 'Verizon',
      lineType: 'mobile',
      callerName: 'Johnson HVAC',
    },
  );
  assert.equal(scored[0].confidenceLabel, 'VERY HIGH');
  assert.deepEqual(scored[0].confidenceFactors, {
    BASE_CONFIDENCE: 40,
    IDENTITY_ASSOCIATION: 20,
    CROSS_SOURCE_CORROBORATION: 30,
    CALLER_NAME_MATCH: 5,
    NUMBER_VALIDATION: 5,
  });
});

test('two sources without identity remain below the very-high evidence band', () => {
  const scored = scoreCandidates([candidate], [], twoExactSources, {
    valid: true,
    phoneDisplay: '(404) 555-1212',
    carrier: 'Verizon',
    lineType: 'mobile',
    callerName: 'Johnson HVAC',
  });
  assert.notEqual(scored[0].confidenceLabel, 'VERY HIGH');
});
