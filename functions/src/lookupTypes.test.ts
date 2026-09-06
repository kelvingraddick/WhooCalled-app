import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cacheMatchesRetrievalVersion,
  confidenceLabelFor,
  formatUsPhone,
  initialStages,
  normalizeUsPhone,
  numberKeyFor,
  shouldReleaseCreditForPartialResult,
} from './lookupTypes';

test('normalizes valid US numbers and rejects invalid national formats', () => {
  assert.equal(normalizeUsPhone('(404) 555-1212'), '+14045551212');
  assert.equal(formatUsPhone('+14045551212'), '(404) 555-1212');
  assert.throws(() => normalizeUsPhone('004-555-1212'));
});

test('number keys are deterministic but do not expose the phone number', () => {
  const key = numberKeyFor('+14045551212');
  assert.equal(key, numberKeyFor('+14045551212'));
  assert.equal(key.length, 64);
  assert.equal(key.includes('404'), false);
});

test('confidence labels stay conservative at the threshold edges', () => {
  assert.equal(confidenceLabelFor(89), 'HIGH');
  assert.equal(confidenceLabelFor(90), 'VERY HIGH');
  assert.equal(confidenceLabelFor(74), 'MEDIUM');
});

test('a lookup starts with every live stage pending', () => {
  const stages = initialStages();
  assert.deepEqual(
    Object.values(stages).map(stage => stage.status),
    ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
  );
});

test('only caches created by the current retrieval pipeline are reusable', () => {
  assert.equal(
    cacheMatchesRetrievalVersion(
      { retrievalVersion: 'google-grounding-v1' },
      'google-grounding-v1',
    ),
    true,
  );
  assert.equal(cacheMatchesRetrievalVersion({}, 'google-grounding-v1'), false);
  assert.equal(
    cacheMatchesRetrievalVersion(
      { retrievalVersion: 'brave-v1' },
      'google-grounding-v1',
    ),
    false,
  );
});

test('evidence-free partial results return the held credit', () => {
  assert.equal(
    shouldReleaseCreditForPartialResult({
      phoneDisplay: '(404) 555-1212',
      carrier: null,
      lineType: null,
      region: null,
      checkedAt: '2026-09-02T00:00:00.000Z',
      confidenceScore: 0,
      confidenceLabel: 'LOW',
      primaryCandidateId: null,
      candidates: [],
      sources: [],
      spamSources: [],
      searchAttributions: [],
      isPartial: true,
    }),
    true,
  );
  assert.equal(
    shouldReleaseCreditForPartialResult({
      phoneDisplay: '(404) 555-1212',
      carrier: 'Verizon',
      lineType: 'mobile',
      region: null,
      checkedAt: '2026-09-02T00:00:00.000Z',
      confidenceScore: 0,
      confidenceLabel: 'LOW',
      primaryCandidateId: null,
      candidates: [],
      sources: [],
      spamSources: [],
      searchAttributions: [],
      isPartial: true,
    }),
    false,
  );
  assert.equal(
    shouldReleaseCreditForPartialResult({
      phoneDisplay: '(404) 555-1212',
      carrier: null,
      lineType: null,
      region: null,
      checkedAt: '2026-09-02T00:00:00.000Z',
      confidenceScore: 0,
      confidenceLabel: 'LOW',
      primaryCandidateId: null,
      candidates: [],
      sources: [],
      spamSources: [
        {
          id: 'spam-report-1',
          title: 'Spam report',
          description: 'Exact-number report',
          domain: 'reports.example',
          url: 'https://reports.example/404-555-1212',
          score: 0,
          kind: 'SPAM_REPORT',
          candidateId: null,
          origin: 'INDEPENDENT',
          retrievalProvider: 'GOOGLE_GROUNDING',
          retrievedAt: '2026-09-02T00:00:00.000Z',
        },
      ],
      searchAttributions: [],
      isPartial: true,
    }),
    false,
  );
});
