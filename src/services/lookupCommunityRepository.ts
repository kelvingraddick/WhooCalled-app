import { getApp } from '@react-native-firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';

import type {
  CommunitySubmission,
  CommunitySubmissionTag,
  CommunitySummary,
} from '../types/lookup';

function tag(value: unknown): CommunitySubmissionTag {
  return value === 'SPAM' ||
    value === 'SCAM' ||
    value === 'SCAM_FRAUD' ||
    value === 'TELEMARKETING' ||
    value === 'ROBOCALL' ||
    value === 'DEBT_COLLECTION' ||
    value === 'POLITICAL' ||
    value === 'SURVEY' ||
    value === 'WRONG_IDENTITY' ||
    value === 'LEGITIMATE_BUSINESS' ||
    value === 'OTHER'
    ? value
    : 'OTHER';
}

function timestamp(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') {
      // Firestore Timestamp#toDate relies on its instance as `this`.
      const date = toDate.call(value);
      return date instanceof Date && !Number.isNaN(date.getTime())
        ? date.toISOString()
        : null;
    }
  }
  return typeof value === 'string' ? value : null;
}

export function communitySubmissionFromDocument(
  id: string,
  data: Record<string, unknown>,
): CommunitySubmission {
  return {
    id,
    displayName:
      typeof data.displayName === 'string' ? data.displayName : 'Whoo user',
    kind: data.kind === 'REPORT' ? 'REPORT' : 'COMMENT',
    tag: tag(data.tag),
    note: typeof data.note === 'string' ? data.note : null,
    createdAt: timestamp(data.createdAt),
  };
}

export function observeOwnCommunitySubmissionIds(
  uid: string,
  listener: (ids: string[]) => void,
  onError: () => void,
): () => void {
  return onSnapshot(
    collection(getFirestore(getApp()), 'users', uid, 'communitySubmissions'),
    snapshot => listener(snapshot.docs.map(item => item.id)),
    onError,
  );
}

export function observeCommunity(
  numberKey: string,
  listener: (items: CommunitySubmission[]) => void,
  onError: () => void,
): () => void {
  return onSnapshot(
    query(
      collection(getFirestore(getApp()), 'communitySubmissions'),
      where('numberKey', '==', numberKey),
      orderBy('createdAt', 'desc'),
    ),
    snapshot =>
      listener(
        snapshot.docs.map(item =>
          communitySubmissionFromDocument(item.id, item.data()),
        ),
      ),
    onError,
  );
}

export function observeCommunitySummary(
  numberKey: string,
  listener: (summary: CommunitySummary) => void,
  onError: () => void,
): () => void {
  return onSnapshot(
    doc(getFirestore(getApp()), 'communitySummaries', numberKey),
    snapshot => {
      const value = snapshot.data() ?? {};
      listener({
        reportCount:
          typeof value.reportCount === 'number' ? value.reportCount : 0,
        commentCount:
          typeof value.commentCount === 'number' ? value.commentCount : 0,
      });
    },
    onError,
  );
}
