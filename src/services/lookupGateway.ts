import 'react-native-get-random-values';

import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { v4 as uuidv4 } from 'uuid';

import type { LookupDetail, PendingLookup } from '../types/lookup';

type CreateLookupResponse = Readonly<{
  balance: Readonly<{
    monthlyAllowance: number;
    monthlyRemaining: number;
    purchasedCredits: number;
    planName: string;
    subscriptionExpiresAt: string | null;
  }>;
  lookupId: string | null;
  requestId: string;
  status:
    | 'ACCEPTED'
    | 'COMPLETE'
    | 'FAILED'
    | 'PROVIDER_NOT_CONFIGURED'
    | 'INSUFFICIENT_CREDITS';
  message: string;
}>;

export type LookupGateway = Readonly<{
  requestInitialLookup: (
    lookup: PendingLookup,
  ) => Promise<CreateLookupResponse>;
  requestRefresh: (lookup: LookupDetail) => Promise<CreateLookupResponse>;
}>;

async function requestLookup(
  lookup: PendingLookup,
  mode: 'INITIAL' | 'REFRESH',
  lookupId?: string,
): Promise<CreateLookupResponse> {
  const createLookup = httpsCallable<
    {
      requestId: string;
      phoneInput: string;
      countryHint: 'US';
      mode: 'INITIAL' | 'REFRESH';
      lookupId?: string;
    },
    CreateLookupResponse
  >(getFunctions(getApp(), 'us-east4'), 'createLookup');

  const result = await createLookup({
    requestId: uuidv4(),
    phoneInput: lookup.phoneInput,
    countryHint: lookup.countryHint,
    mode,
    ...(lookupId ? { lookupId } : {}),
  });

  return result.data;
}

export const lookupGateway: LookupGateway = {
  requestInitialLookup: lookup => requestLookup(lookup, 'INITIAL'),
  requestRefresh: lookup =>
    requestLookup(
      { phoneInput: lookup.phoneDisplay, countryHint: 'US' },
      'REFRESH',
      lookup.id,
    ),
};
