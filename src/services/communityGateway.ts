import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import type { CommunityTag, SpamReportCategory } from '../types/lookup';

export type CommunitySubmissionInput = Readonly<{
  lookupId: string;
  kind: 'REPORT' | 'COMMENT';
  tag: CommunityTag | SpamReportCategory;
  note?: string;
}>;

const call = <Input, Output>(name: string, input: Input) =>
  httpsCallable<Input, Output>(
    getFunctions(getApp(), 'us-east4'),
    name,
  )(input).then(result => result.data);

export const communityGateway = {
  submit: (input: CommunitySubmissionInput) =>
    call<
      CommunitySubmissionInput,
      { submissionId: string; reportCount: number; commentCount: number }
    >('submitCommunitySubmission', input),
  delete: (submissionId: string) =>
    call<{ submissionId: string }, void>('deleteCommunitySubmission', {
      submissionId,
    }),
};
