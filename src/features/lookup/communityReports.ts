import {
  spamReportCategories,
  type CommunitySubmission,
  type SpamReportCategory,
} from '../../types/lookup';

export type CommunityReportSummary = Readonly<{
  total: number;
  counts: Readonly<Record<SpamReportCategory, number>>;
}>;

export const spamReportCategoryLabels: Readonly<
  Record<SpamReportCategory, string>
> = {
  SPAM: 'Spam',
  SCAM_FRAUD: 'Scam/Fraud',
  TELEMARKETING: 'Telemarketing',
  ROBOCALL: 'Robocall',
  DEBT_COLLECTION: 'Debt Collection',
  POLITICAL: 'Political',
  SURVEY: 'Survey',
  OTHER: 'Other',
};

export function isSpamReportCategory(
  value: CommunitySubmission['tag'],
): value is SpamReportCategory {
  return (spamReportCategories as readonly string[]).includes(value);
}

function reportCategoryForTag(
  tag: CommunitySubmission['tag'],
): SpamReportCategory {
  if (isSpamReportCategory(tag)) {
    return tag;
  }
  if (tag === 'SCAM') {
    return 'SCAM_FRAUD';
  }
  return 'OTHER';
}

export function summarizeCommunityReports(
  submissions: CommunitySubmission[],
): CommunityReportSummary {
  const counts = Object.fromEntries(
    spamReportCategories.map(category => [category, 0]),
  ) as Record<SpamReportCategory, number>;

  for (const submission of submissions) {
    if (submission.kind === 'REPORT') {
      counts[reportCategoryForTag(submission.tag)] += 1;
    }
  }

  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
  };
}
