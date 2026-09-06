import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completedLookupStatus,
  isDebugTesterEmail,
  lookupHistoryCollectionPath,
  normalizeDebugTesterEmail,
  parseDebugTesterEmails,
  requireDebugTesterEmail,
} from './debugToolsContracts';

test('parses comma-separated tester emails without empty or duplicate entries', () => {
  assert.deepEqual(
    parseDebugTesterEmails(
      ' KelvinGraddick@gmail.com, kelvingraddick@kg.codes, KELVINGRADDICK@GMAIL.COM, , ',
    ),
    ['kelvingraddick@gmail.com', 'kelvingraddick@kg.codes'],
  );
  assert.equal(
    normalizeDebugTesterEmail(' Tester@Example.com '),
    'tester@example.com',
  );
  assert.equal(normalizeDebugTesterEmail(null), null);
  assert.equal(
    isDebugTesterEmail(
      'KELVINGRADDiCK@GMAIL.COM',
      'kelvingraddick@gmail.com, kelvingraddick@kg.codes',
    ),
    true,
  );
  assert.equal(
    isDebugTesterEmail('tester@example.com', 'kelvingraddick@gmail.com'),
    false,
  );
});

test('rejects unallowlisted callers from debug actions', () => {
  assert.throws(
    () =>
      requireDebugTesterEmail(
        'user-c@example.com',
        'kelvingraddick@gmail.com, kelvingraddick@kg.codes',
      ),
    error =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'permission-denied',
  );
  assert.equal(
    requireDebugTesterEmail(
      'KELVINGRADDiCK@KG.CODES',
      'kelvingraddick@gmail.com, kelvingraddick@kg.codes',
    ),
    'kelvingraddick@kg.codes',
  );
});

test('scopes history cleanup to the authenticated users completed lookups', () => {
  assert.equal(
    lookupHistoryCollectionPath('tester-a'),
    'users/tester-a/lookups',
  );
  assert.equal(completedLookupStatus, 'COMPLETE');
});
