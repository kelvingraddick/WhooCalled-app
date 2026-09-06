import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

export type SettingsSnapshot = Readonly<{
  account: Readonly<{
    displayName: string | null;
    email: string | null;
    provider: 'apple' | 'google' | 'unknown';
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

export type SupportTicketInput = Readonly<{
  subject: string;
  message: string;
}>;

export type DataRequestInput = Readonly<{
  requestType: 'remove' | 'correct';
  phoneInput: string;
  details: string;
}>;

type CallableSettingsGateway = Readonly<{
  getSettingsSnapshot: () => Promise<SettingsSnapshot>;
  updateDisplayName: (displayName: string) => Promise<SettingsSnapshot>;
  submitSupportTicket: (
    input: SupportTicketInput,
  ) => Promise<{ ticketId: string }>;
  submitDataRequest: (input: DataRequestInput) => Promise<{ ticketId: string }>;
  debugResetMonthlyLookups: () => Promise<SettingsSnapshot>;
  debugClearCompletedLookupHistory: () => Promise<{ deletedCount: number }>;
  clearLookupHistory: () => Promise<{ deletedCount: number }>;
  deleteLookupHistoryItem: (lookupId: string) => Promise<{ lookupId: string }>;
  deleteAccount: () => Promise<void>;
}>;

const call = <Input, Output>(name: string, input?: Input) =>
  httpsCallable<Input, Output>(
    getFunctions(getApp(), 'us-east4'),
    name,
  )(input as Input).then(result => result.data);

export const settingsGateway: CallableSettingsGateway = {
  getSettingsSnapshot: () =>
    call<undefined, SettingsSnapshot>('getSettingsSnapshot'),
  updateDisplayName: displayName =>
    call<{ displayName: string }, SettingsSnapshot>('updateDisplayName', {
      displayName,
    }),
  submitSupportTicket: input =>
    call<SupportTicketInput, { ticketId: string }>(
      'submitSupportTicket',
      input,
    ),
  submitDataRequest: input =>
    call<DataRequestInput, { ticketId: string }>('submitDataRequest', input),
  debugResetMonthlyLookups: () =>
    call<undefined, SettingsSnapshot>('debugResetMonthlyLookups'),
  debugClearCompletedLookupHistory: () =>
    call<undefined, { deletedCount: number }>(
      'debugClearCompletedLookupHistory',
    ),
  clearLookupHistory: () =>
    call<undefined, { deletedCount: number }>('clearLookupHistory'),
  deleteLookupHistoryItem: lookupId =>
    call<{ lookupId: string }, { lookupId: string }>(
      'deleteLookupHistoryItem',
      {
        lookupId,
      },
    ),
  deleteAccount: () => call<undefined, void>('deleteAccount'),
};
