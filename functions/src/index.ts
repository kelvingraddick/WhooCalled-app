import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineBoolean } from 'firebase-functions/params';

export {
  createLookup,
  deleteCommunitySubmission,
  runLookup,
  submitCommunitySubmission,
} from './lookups';

export {
  clearLookupHistory,
  deleteLookupHistoryItem,
  debugClearCompletedLookupHistory,
  debugResetMonthlyLookups,
  deleteAccount,
  getSettingsSnapshot,
  revenueCatWebhook,
  submitDataRequest,
  submitSupportTicket,
  updateDisplayName,
} from './settings';

const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: false });

function requireAuthenticatedUser(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Sign in is required before requesting a lookup.',
    );
  }

  return uid;
}

export const getBackendHealth = onCall(
  { enforceAppCheck, maxInstances: 10, region: 'us-east4' },
  request => {
    requireAuthenticatedUser(request.auth?.uid);

    return {
      service: 'whoo-called-api',
      status: 'ok',
      region: 'us-east4',
      providerPipeline: 'task-queue',
    };
  },
);
