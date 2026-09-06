import { getApp } from '@react-native-firebase/app';
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from '@react-native-firebase/firestore';

import type { LookupHistoryItem, LookupHistoryPage } from '../types/lookup';

const historyPageSize = 20;

function confidenceLabel(value: unknown): LookupHistoryItem['confidenceLabel'] {
  if (
    value === 'VERY HIGH' ||
    value === 'HIGH' ||
    value === 'MEDIUM' ||
    value === 'LOW'
  ) {
    return value;
  }

  return 'LOW';
}

export function observeRecentLookups(
  uid: string,
  listener: (lookups: LookupHistoryItem[]) => void,
  onError: () => void,
): () => void {
  const recentQuery = query(
    collection(getFirestore(getApp()), 'users', uid, 'lookups'),
    where('status', '==', 'COMPLETE'),
    orderBy('lastOpenedAt', 'desc'),
    limit(3),
  );

  return onSnapshot(
    recentQuery,
    snapshot => {
      listener(
        snapshot.docs.map(document => {
          const data = document.data();

          return {
            id: document.id,
            displayName:
              typeof data.displayName === 'string'
                ? data.displayName
                : 'Unknown caller',
            phoneDisplay:
              typeof data.phoneDisplay === 'string'
                ? data.phoneDisplay
                : 'Number unavailable',
            confidenceLabel: confidenceLabel(data.confidenceLabel),
            confidenceScore:
              typeof data.confidenceScore === 'number'
                ? data.confidenceScore
                : 0,
            spamReportCount:
              typeof data.spamReportCount === 'number'
                ? data.spamReportCount
                : 0,
          };
        }),
      );
    },
    onError,
  );
}

function historyItemFromDocument(document: {
  id: string;
  data: () => Record<string, unknown>;
}): LookupHistoryItem {
  const data = document.data();

  return {
    id: document.id,
    displayName:
      typeof data.displayName === 'string'
        ? data.displayName
        : 'Unknown caller',
    phoneDisplay:
      typeof data.phoneDisplay === 'string'
        ? data.phoneDisplay
        : 'Number unavailable',
    confidenceLabel: confidenceLabel(data.confidenceLabel),
    confidenceScore:
      typeof data.confidenceScore === 'number' ? data.confidenceScore : 0,
    spamReportCount:
      typeof data.spamReportCount === 'number' ? data.spamReportCount : 0,
  };
}

export async function getLookupHistoryPage(
  uid: string,
  cursor: unknown | null,
): Promise<LookupHistoryPage> {
  const constraints = [
    where('status', '==', 'COMPLETE'),
    orderBy('lastOpenedAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(historyPageSize + 1),
  ];
  const snapshot = await getDocs(
    query(
      collection(getFirestore(getApp()), 'users', uid, 'lookups'),
      ...constraints,
    ),
  );
  const documents = snapshot.docs.slice(0, historyPageSize);

  return {
    lookups: documents.map(historyItemFromDocument),
    cursor: documents.length ? documents[documents.length - 1] : null,
    hasMore: snapshot.docs.length > historyPageSize,
  };
}
