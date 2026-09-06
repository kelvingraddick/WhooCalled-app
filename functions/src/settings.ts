import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  HttpsError,
  onCall,
  onRequest,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { ZodError, z } from 'zod';

import { verifyRevenueCatWebhookSignature } from './revenueCatWebhookSignature';
import {
  completedLookupStatus,
  isDebugTesterEmail,
  lookupHistoryCollectionPath,
  requireDebugTesterEmail,
} from './debugToolsContracts';

import {
  applyRevenueCatWebhookEvent,
  dataRequestSchema,
  displayNameSchema,
  monthlyAllowance,
  monthlyRemaining,
  normalizeCreditBalance,
  parseCreditProductMap,
  purchasedRemaining,
  resetMonthlyUsageForTesting,
  captureCredit,
  releaseCredit,
  reserveCredit,
  supportTicketSchema,
  type CreditBalance,
  type RevenueCatWebhookEvent,
} from './settingsContracts';

initializeApp();

const revenueCatApiKey = defineSecret('REVENUECAT_SECRET_API_KEY');
const revenueCatWebhookSecret = defineSecret('REVENUECAT_WEBHOOK_SECRET');
const creditProductMapParameter = defineString('CREDIT_PRODUCT_MAP', {
  default: '{}',
});
const debugTesterEmailsParameter = defineString('DEBUG_TESTER_EMAILS');
const settingsCallableOptions = { region: 'us-east4' } as const;

const recentAuthenticationWindowMs = 5 * 60 * 1000;
// Each community contribution needs three deletes plus, at most, one summary
// update. Keep the total below Firestore's 500-write batch limit.
const communityDeletionPageSize = 100;
const lookupIdSchema = z
  .object({ lookupId: z.string().trim().min(1).max(256) })
  .strict();

type Provider = 'apple' | 'google' | 'unknown';

export type SettingsSnapshot = Readonly<{
  account: Readonly<{
    displayName: string | null;
    email: string | null;
    provider: Provider;
  }>;
  balance: Readonly<{
    monthlyAllowance: number;
    monthlyRemaining: number;
    purchasedCredits: number;
    planName: string;
    subscriptionExpiresAt: string | null;
  }>;
  debugAccess: boolean;
}>;

function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }

  return request.auth.uid;
}

function requireRecentAuthentication(request: CallableRequest<unknown>): void {
  const authTime = request.auth?.token.auth_time;
  const authenticatedAt = typeof authTime === 'number' ? authTime * 1000 : 0;

  if (Date.now() - authenticatedAt > recentAuthenticationWindowMs) {
    throw new HttpsError(
      'failed-precondition',
      'Please sign in again before deleting your account.',
    );
  }
}

function balanceReference(db: Firestore, uid: string): DocumentReference {
  return db.doc(`users/${uid}/private/balance`);
}

function providerFor(user: {
  providerData: Array<{ providerId: string }>;
}): Provider {
  const providerIds = user.providerData.map(provider => provider.providerId);
  if (providerIds.includes('apple.com')) {
    return 'apple';
  }

  if (providerIds.includes('google.com')) {
    return 'google';
  }

  return 'unknown';
}

function toSnapshot(
  user: {
    displayName?: string | null;
    email?: string | null;
    providerData: Array<{ providerId: string }>;
  },
  balance: CreditBalance,
  debugAccess: boolean,
): SettingsSnapshot {
  return {
    account: {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      provider: providerFor(user),
    },
    balance: {
      monthlyAllowance: monthlyAllowance(balance),
      monthlyRemaining: monthlyRemaining(balance),
      purchasedCredits: purchasedRemaining(balance),
      planName: balance.planName ?? 'Free plan',
      subscriptionExpiresAt: balance.subscriptionExpiresAt
        ? new Date(balance.subscriptionExpiresAt).toISOString()
        : null,
    },
    debugAccess,
  };
}

async function getSnapshot(uid: string): Promise<SettingsSnapshot> {
  const db = getFirestore();
  const [user, balanceDocument] = await Promise.all([
    getAuth().getUser(uid),
    balanceReference(db, uid).get(),
  ]);
  const balance = normalizeCreditBalance(
    balanceDocument.data() as Partial<CreditBalance> | undefined,
    new Date(),
  );

  return toSnapshot(
    user,
    balance,
    isDebugTesterEmail(user.email, debugTesterEmailsParameter.value()),
  );
}

async function requireDebugUid(
  request: CallableRequest<unknown>,
): Promise<string> {
  const uid = requireUid(request);
  const user = await getAuth().getUser(uid);
  requireDebugTesterEmail(user.email, debugTesterEmailsParameter.value());
  return uid;
}

export async function getSettingsBalance(
  uid: string,
): Promise<SettingsSnapshot['balance']> {
  return (await getSnapshot(uid)).balance;
}

async function deleteCollectionByOwner(
  db: Firestore,
  collectionName: string,
  uid: string,
): Promise<void> {
  while (true) {
    const documents = await db
      .collection(collectionName)
      .where('authorUid', '==', uid)
      .limit(300)
      .get();

    if (documents.empty) {
      return;
    }

    const batch = db.batch();
    documents.docs.forEach(document => batch.delete(document.ref));
    await batch.commit();
  }
}

async function deleteCommunitySubmissionsByOwner(
  db: Firestore,
  uid: string,
): Promise<void> {
  while (true) {
    const documents = await db
      .collection('communitySubmissionOwners')
      .where('authorUid', '==', uid)
      .limit(communityDeletionPageSize)
      .get();

    if (documents.empty) {
      return;
    }

    const batch = db.batch();
    const summaryDeltas = new Map<
      string,
      { commentCount: number; reportCount: number }
    >();
    documents.docs.forEach(document => {
      const data = document.data();
      const numberKey =
        typeof data.numberKey === 'string' ? data.numberKey : null;
      const kind = data.kind;
      if (numberKey && (kind === 'REPORT' || kind === 'COMMENT')) {
        const delta = summaryDeltas.get(numberKey) ?? {
          commentCount: 0,
          reportCount: 0,
        };
        delta[kind === 'REPORT' ? 'reportCount' : 'commentCount'] -= 1;
        summaryDeltas.set(numberKey, delta);
      }
      batch.delete(db.doc(`communitySubmissions/${document.id}`));
      batch.delete(db.doc(`users/${uid}/communitySubmissions/${document.id}`));
      batch.delete(document.ref);
    });
    summaryDeltas.forEach((delta, numberKey) => {
      batch.set(
        db.doc(`communitySummaries/${numberKey}`),
        {
          ...(delta.reportCount
            ? { reportCount: FieldValue.increment(delta.reportCount) }
            : {}),
          ...(delta.commentCount
            ? { commentCount: FieldValue.increment(delta.commentCount) }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

async function deleteRevenueCatCustomer(uid: string): Promise<void> {
  const apiKey = revenueCatApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Account deletion is not configured. Please contact support.',
    );
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new HttpsError(
      'unavailable',
      'We could not remove your purchase profile. Please try again.',
    );
  }
}

const revenueCatEventSchema = z
  .object({
    event: z
      .object({
        id: z.string().min(1),
        type: z.string().min(1),
        app_user_id: z.string().min(1),
        product_id: z.string().min(1).optional(),
        expiration_at_ms: z.number().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const getSettingsSnapshot = onCall(
  settingsCallableOptions,
  async request => {
    return getSnapshot(requireUid(request));
  },
);

export const debugResetMonthlyLookups = onCall(
  settingsCallableOptions,
  async request => {
    const uid = await requireDebugUid(request);
    const db = getFirestore();
    const reference = balanceReference(db, uid);

    await db.runTransaction(async transaction => {
      const balanceDocument = await transaction.get(reference);
      const balance = normalizeCreditBalance(
        balanceDocument.data() as Partial<CreditBalance> | undefined,
        new Date(),
      );
      transaction.set(reference, resetMonthlyUsageForTesting(balance), {
        merge: true,
      });
    });

    return getSnapshot(uid);
  },
);

export const debugClearCompletedLookupHistory = onCall(
  settingsCallableOptions,
  async request => {
    const uid = await requireDebugUid(request);
    return clearCompletedLookupHistory(uid);
  },
);

async function clearCompletedLookupHistory(
  uid: string,
): Promise<{ deletedCount: number }> {
  const db = getFirestore();
  const lookups = db.collection(lookupHistoryCollectionPath(uid));
  let deletedCount = 0;

  while (true) {
    const completed = await lookups
      .where('status', '==', completedLookupStatus)
      .limit(300)
      .get();

    if (completed.empty) {
      return { deletedCount };
    }

    const batch = db.batch();
    completed.docs.forEach(document => batch.delete(document.ref));
    await batch.commit();
    deletedCount += completed.size;
  }
}

export const clearLookupHistory = onCall(settingsCallableOptions, request =>
  clearCompletedLookupHistory(requireUid(request)),
);

export const deleteLookupHistoryItem = onCall(
  settingsCallableOptions,
  async request => {
    const uid = requireUid(request);

    try {
      const { lookupId } = lookupIdSchema.parse(request.data);
      const reference = getFirestore().doc(
        `${lookupHistoryCollectionPath(uid)}/${lookupId}`,
      );
      const lookup = await reference.get();

      if (!lookup.exists) {
        throw new HttpsError('not-found', 'This lookup no longer exists.');
      }
      if (lookup.data()?.status !== completedLookupStatus) {
        throw new HttpsError(
          'failed-precondition',
          'Only completed lookups can be removed from history.',
        );
      }

      await reference.delete();
      return { lookupId };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError(
          'invalid-argument',
          'This lookup could not be removed.',
        );
      }
      throw error;
    }
  },
);

export const updateDisplayName = onCall(
  settingsCallableOptions,
  async request => {
    const uid = requireUid(request);

    try {
      const displayName = displayNameSchema.parse(
        (request.data as { displayName?: unknown })?.displayName,
      );
      await Promise.all([
        getAuth().updateUser(uid, { displayName }),
        getFirestore().doc(`users/${uid}`).set(
          {
            displayName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      return getSnapshot(uid);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError('invalid-argument', 'Enter a valid display name.');
      }

      throw error;
    }
  },
);

export const submitSupportTicket = onCall(
  settingsCallableOptions,
  async request => {
    const uid = requireUid(request);

    try {
      const input = supportTicketSchema.parse(request.data);
      const ticket = getFirestore().collection('supportTickets').doc();
      await ticket.set({
        ...input,
        authorUid: uid,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ticketId: ticket.id };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError(
          'invalid-argument',
          'Complete your support request.',
        );
      }

      throw error;
    }
  },
);

export const submitDataRequest = onCall(
  settingsCallableOptions,
  async request => {
    const uid = requireUid(request);

    try {
      const input = dataRequestSchema.parse(request.data);
      const ticket = getFirestore().collection('dataRequests').doc();
      await ticket.set({
        ...input,
        authorUid: uid,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ticketId: ticket.id };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpsError('invalid-argument', 'Complete your data request.');
      }

      throw error;
    }
  },
);

export const deleteAccount = onCall(
  { ...settingsCallableOptions, secrets: [revenueCatApiKey] },
  async request => {
    const uid = requireUid(request);
    requireRecentAuthentication(request);

    const db = getFirestore();
    await deleteRevenueCatCustomer(uid);
    await Promise.all([
      deleteCollectionByOwner(db, 'supportTickets', uid),
      deleteCollectionByOwner(db, 'dataRequests', uid),
      deleteCommunitySubmissionsByOwner(db, uid),
    ]);
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await getAuth().deleteUser(uid);
    return null;
  },
);

export const revenueCatWebhook = onRequest(
  {
    region: 'us-east4',
    invoker: 'public',
    secrets: [revenueCatWebhookSecret],
  },
  async (request, response) => {
    const expectedSecret = revenueCatWebhookSecret.value();
    if (
      !expectedSecret ||
      !verifyRevenueCatWebhookSignature({
        header: request.get('x-revenuecat-webhook-signature'),
        rawBody: request.rawBody,
        secret: expectedSecret,
      })
    ) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const { event } = revenueCatEventSchema.parse(request.body);
      const productMap = parseCreditProductMap(
        creditProductMapParameter.value(),
      );
      if (!event.product_id || !productMap[event.product_id]) {
        response.status(200).json({ accepted: true });
        return;
      }

      const db = getFirestore();
      const balanceRef = balanceReference(db, event.app_user_id);
      const eventRef = db.doc(`revenueCatEvents/${event.id}`);
      await db.runTransaction(async transaction => {
        const [eventDocument, balanceDocument] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(balanceRef),
        ]);
        const updated = applyRevenueCatWebhookEvent({
          alreadyProcessed: eventDocument.exists,
          balance: balanceDocument.data() as Partial<CreditBalance> | undefined,
          event: {
            id: event.id,
            type: event.type,
            productId: event.product_id ?? null,
            expirationAtMs: event.expiration_at_ms ?? null,
          } satisfies RevenueCatWebhookEvent,
          productMap,
          now: new Date(),
        });

        if (!updated) {
          return;
        }

        transaction.set(balanceRef, updated, { merge: true });
        transaction.set(eventRef, {
          appUserId: event.app_user_id,
          eventType: event.type,
          productId: event.product_id ?? null,
          processedAt: FieldValue.serverTimestamp(),
        });
      });

      response.status(200).json({ accepted: true });
    } catch {
      response.status(400).json({ error: 'Invalid webhook payload' });
    }
  },
);

function lookupReservationReference(
  db: Firestore,
  uid: string,
  reservationId: string,
): DocumentReference {
  return db.doc(`users/${uid}/lookupReservations/${reservationId}`);
}

export async function reserveLookupCredit(
  uid: string,
  reservationId: string,
): Promise<{
  source: 'monthly' | 'purchased';
  snapshot: SettingsSnapshot;
} | null> {
  const db = getFirestore();
  const balanceRef = balanceReference(db, uid);
  const reservationRef = lookupReservationReference(db, uid, reservationId);
  const result = await db.runTransaction(async transaction => {
    const [balanceDocument, reservationDocument] = await Promise.all([
      transaction.get(balanceRef),
      transaction.get(reservationRef),
    ]);

    if (reservationDocument.exists) {
      const source = reservationDocument.data()?.source;
      if (source === 'monthly' || source === 'purchased') {
        return { source };
      }
      throw new HttpsError(
        'failed-precondition',
        'Lookup credit is unavailable.',
      );
    }

    const balance = normalizeCreditBalance(
      balanceDocument.data() as Partial<CreditBalance> | undefined,
      new Date(),
    );
    const reservation = reserveCredit(balance);

    if (!reservation) {
      return null;
    }

    transaction.set(balanceRef, reservation.balance, { merge: true });
    transaction.set(reservationRef, {
      source: reservation.source,
      status: 'HELD',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { source: reservation.source };
  });

  if (!result) {
    return null;
  }

  return {
    source: result.source,
    snapshot: await getSnapshot(uid),
  };
}

export async function captureLookupCredit(
  uid: string,
  reservationId: string,
): Promise<void> {
  const db = getFirestore();
  const balanceRef = balanceReference(db, uid);
  const reservationRef = lookupReservationReference(db, uid, reservationId);

  await db.runTransaction(async transaction => {
    const [balanceDocument, reservationDocument] = await Promise.all([
      transaction.get(balanceRef),
      transaction.get(reservationRef),
    ]);
    const source = reservationDocument.data()?.source;
    const status = reservationDocument.data()?.status;

    if (status === 'CAPTURED') {
      return;
    }
    if (status !== 'HELD' || (source !== 'monthly' && source !== 'purchased')) {
      throw new HttpsError(
        'failed-precondition',
        'Lookup credit hold is invalid.',
      );
    }

    const balance = normalizeCreditBalance(
      balanceDocument.data() as Partial<CreditBalance> | undefined,
      new Date(),
    );
    const updated = captureCredit(balance, source);
    transaction.set(balanceRef, updated, { merge: true });
    transaction.set(
      reservationRef,
      { status: 'CAPTURED', capturedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}

export async function releaseLookupCredit(
  uid: string,
  reservationId: string,
): Promise<void> {
  const db = getFirestore();
  const balanceRef = balanceReference(db, uid);
  const reservationRef = lookupReservationReference(db, uid, reservationId);

  await db.runTransaction(async transaction => {
    const [balanceDocument, reservationDocument] = await Promise.all([
      transaction.get(balanceRef),
      transaction.get(reservationRef),
    ]);
    const source = reservationDocument.data()?.source;
    const status = reservationDocument.data()?.status;

    if (status === 'RELEASED') {
      return;
    }
    if (status !== 'HELD' || (source !== 'monthly' && source !== 'purchased')) {
      throw new HttpsError(
        'failed-precondition',
        'Lookup credit hold is invalid.',
      );
    }

    const balance = normalizeCreditBalance(
      balanceDocument.data() as Partial<CreditBalance> | undefined,
      new Date(),
    );
    transaction.set(balanceRef, releaseCredit(balance, source), {
      merge: true,
    });
    transaction.set(
      reservationRef,
      { status: 'RELEASED', releasedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}
