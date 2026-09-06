import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rules = await readFile(
  new URL('../firestore.rules', import.meta.url),
  'utf8',
);
const testEnvironment = await initializeTestEnvironment({
  projectId: 'whoo-called',
  firestore: { rules },
});

test.after(async () => {
  await testEnvironment.cleanup();
});

test('users can read only their own lookup history', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/user-a/lookups/lookup-a'), {
      status: 'COMPLETE',
    });
  });

  await assertSucceeds(
    getDoc(
      doc(
        testEnvironment.authenticatedContext('user-a').firestore(),
        'users/user-a/lookups/lookup-a',
      ),
    ),
  );

  await assertFails(
    getDoc(
      doc(
        testEnvironment.authenticatedContext('user-b').firestore(),
        'users/user-a/lookups/lookup-a',
      ),
    ),
  );
});

test('clients cannot write lookup records or read shared intelligence', async () => {
  const database = testEnvironment.authenticatedContext('user-a').firestore();

  await assertFails(
    setDoc(doc(database, 'users/user-a/lookups/new-lookup'), {
      status: 'PENDING',
    }),
  );
  await assertFails(
    deleteDoc(doc(database, 'users/user-a/lookups/new-lookup')),
  );
  await assertFails(getDoc(doc(database, 'numberIntelligence/opaque-key')));
});

test('signed-in users can read public community content but cannot write it directly', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'communitySummaries/opaque-key'), {
      reportCount: 1,
      commentCount: 2,
    });
    await setDoc(doc(context.firestore(), 'communitySubmissions/comment-a'), {
      numberKey: 'opaque-key',
      kind: 'COMMENT',
      displayName: 'Whoo user',
      note: 'Factual context.',
    });
  });

  const database = testEnvironment.authenticatedContext('user-b').firestore();
  await assertSucceeds(getDoc(doc(database, 'communitySummaries/opaque-key')));
  await assertSucceeds(getDoc(doc(database, 'communitySubmissions/comment-a')));
  await assertFails(
    setDoc(doc(database, 'communitySubmissions/comment-b'), {
      numberKey: 'opaque-key',
      kind: 'COMMENT',
    }),
  );
});

test('only the author can read the private mapping used to delete a contribution', async () => {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(context.firestore(), 'users/user-a/communitySubmissions/comment-a'),
      { submissionId: 'comment-a' },
    );
  });

  await assertSucceeds(
    getDoc(
      doc(
        testEnvironment.authenticatedContext('user-a').firestore(),
        'users/user-a/communitySubmissions/comment-a',
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        testEnvironment.authenticatedContext('user-b').firestore(),
        'users/user-a/communitySubmissions/comment-a',
      ),
    ),
  );
});
