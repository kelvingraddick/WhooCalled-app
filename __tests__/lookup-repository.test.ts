jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn() }));
jest.mock('@react-native-firebase/firestore', () => ({
  doc: jest.fn(),
  getFirestore: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { lookupDetailFromDocument } from '../src/services/lookupRepository';

const stages = {
  validation: { status: 'COMPLETE', detail: 'Valid' },
  identity: { status: 'COMPLETE', detail: 'Found' },
  web: { status: 'COMPLETE', detail: 'Found' },
  confidence: { status: 'COMPLETE', detail: 'Ready' },
};

describe('lookupDetailFromDocument', () => {
  it('preserves source metadata and confidence factors from cached results', () => {
    const detail = lookupDetailFromDocument('lookup-a', {
      status: 'COMPLETE',
      phoneDisplay: '(404) 555-1212',
      numberKey: 'opaque-key',
      stages,
      result: {
        phoneDisplay: '(404) 555-1212',
        carrier: null,
        lineType: null,
        region: null,
        checkedAt: '2026-09-01T15:00:00.000Z',
        confidenceScore: 95,
        confidenceLabel: 'VERY HIGH',
        primaryCandidateId: 'candidate-a',
        candidates: [
          {
            id: 'candidate-a',
            name: 'Johnson HVAC',
            kind: 'BUSINESS',
            region: 'Georgia',
            score: 95,
            confidenceLabel: 'VERY HIGH',
            confidenceFactors: {
              BASE_CONFIDENCE: 40,
              IDENTITY_ASSOCIATION: 20,
              CROSS_SOURCE_CORROBORATION: 30,
              CALLER_NAME_MATCH: 5,
              NUMBER_VALIDATION: 0,
            },
          },
        ],
        sources: [
          {
            id: 'source-a',
            title: 'Johnson HVAC contact',
            description: 'Exact number match',
            domain: 'johnsonhvac.com',
            url: 'https://johnsonhvac.com/contact',
            score: 96,
            kind: 'WEB',
            candidateId: 'candidate-a',
            origin: 'FIRST_PARTY',
            retrievalProvider: 'GOOGLE_GROUNDING',
            retrievedAt: '2026-09-01T15:00:00.000Z',
          },
        ],
        spamSources: [],
        searchAttributions: [
          {
            stage: 'web',
            provider: 'GOOGLE_GROUNDING',
            renderedContent: '<a>Search</a>',
            webSearchQueries: ['4045551212 Johnson HVAC'],
          },
        ],
        isPartial: false,
      },
    });

    expect(detail.result?.candidates[0].confidenceFactors).toEqual({
      BASE_CONFIDENCE: 40,
      IDENTITY_ASSOCIATION: 20,
      CROSS_SOURCE_CORROBORATION: 30,
      CALLER_NAME_MATCH: 5,
      NUMBER_VALIDATION: 0,
    });
    expect(detail.result?.sources[0]).toEqual(
      expect.objectContaining({
        origin: 'FIRST_PARTY',
        retrievalProvider: 'GOOGLE_GROUNDING',
        retrievedAt: '2026-09-01T15:00:00.000Z',
      }),
    );
    expect(detail.result?.spamSources).toEqual([]);
    expect(detail.result?.searchAttributions).toEqual([
      expect.objectContaining({ stage: 'web', provider: 'GOOGLE_GROUNDING' }),
    ]);
  });

  it('defaults malformed factor fields without rejecting the lookup', () => {
    const detail = lookupDetailFromDocument('lookup-a', {
      status: 'COMPLETE',
      phoneDisplay: '(404) 555-1212',
      numberKey: 'opaque-key',
      stages,
      result: {
        phoneDisplay: '(404) 555-1212',
        candidates: [
          {
            id: 'candidate-a',
            name: 'Caller',
            kind: 'UNKNOWN',
            score: 40,
            confidenceLabel: 'LOW',
          },
        ],
        sources: [
          {
            id: 'source-a',
            title: 'Source',
            description: '',
            score: 72,
            kind: 'WEB',
          },
        ],
      },
    });

    expect(detail.result?.candidates[0].confidenceFactors).toEqual({
      BASE_CONFIDENCE: 0,
      IDENTITY_ASSOCIATION: 0,
      CROSS_SOURCE_CORROBORATION: 0,
      CALLER_NAME_MATCH: 0,
      NUMBER_VALIDATION: 0,
    });
    expect(detail.result?.sources[0]).toEqual(
      expect.objectContaining({
        origin: 'INDEPENDENT',
        retrievalProvider: null,
        retrievedAt: '',
      }),
    );
    expect(detail.result?.searchAttributions).toEqual([]);
  });
});
