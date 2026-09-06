import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLookupRequest } from './contracts';
import { communitySubmissionSchema } from './lookupContracts';

test('accepts a valid initial lookup request', () => {
  const request = parseLookupRequest({
    requestId: 'f15d2b61-dd80-47ba-94c6-9a066e3bc867',
    phoneInput: '(404) 555-1212',
    countryHint: 'us',
    mode: 'INITIAL',
  });

  assert.equal(request.countryHint, 'US');
});

test('requires an existing lookup identifier when refreshing', () => {
  assert.throws(() =>
    parseLookupRequest({
      requestId: 'f15d2b61-dd80-47ba-94c6-9a066e3bc867',
      phoneInput: '(404) 555-1212',
      countryHint: 'US',
      mode: 'REFRESH',
    }),
  );
});

test('requires a factual note for a public comment but keeps report notes optional', () => {
  assert.throws(() =>
    communitySubmissionSchema.parse({
      lookupId: 'lookup-a',
      kind: 'COMMENT',
      tag: 'SPAM',
    }),
  );
  assert.equal(
    communitySubmissionSchema.parse({
      lookupId: 'lookup-a',
      kind: 'REPORT',
      tag: 'SCAM_FRAUD',
    }).note,
    undefined,
  );
});

test('accepts every spam-report category and rejects comment-only categories', () => {
  for (const tag of [
    'SPAM',
    'SCAM_FRAUD',
    'TELEMARKETING',
    'ROBOCALL',
    'DEBT_COLLECTION',
    'POLITICAL',
    'SURVEY',
    'OTHER',
  ]) {
    assert.equal(
      communitySubmissionSchema.parse({
        lookupId: 'lookup-a',
        kind: 'REPORT',
        tag,
      }).tag,
      tag,
    );
  }

  assert.throws(() =>
    communitySubmissionSchema.parse({
      lookupId: 'lookup-a',
      kind: 'REPORT',
      tag: 'WRONG_IDENTITY',
    }),
  );
});
