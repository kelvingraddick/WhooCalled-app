import { summarizeCommunityReports } from '../src/features/lookup/communityReports';
import { communitySubmissionFromDocument } from '../src/services/lookupCommunityRepository';
import type { CommunitySubmission } from '../src/types/lookup';

const report = (
  id: string,
  tag: CommunitySubmission['tag'],
): CommunitySubmission => ({
  id,
  displayName: 'Whoo user',
  kind: 'REPORT',
  tag,
  note: null,
  createdAt: null,
});

describe('community report summaries', () => {
  it('maps a Firestore timestamp without losing its instance context', () => {
    const firestoreTimestamp = {
      milliseconds: Date.UTC(2026, 8, 5, 20),
      toDate(this: { milliseconds: number }) {
        return new Date(this.milliseconds);
      },
    };

    expect(
      communitySubmissionFromDocument('comment-1', {
        createdAt: firestoreTimestamp,
      }),
    ).toEqual(
      expect.objectContaining({ createdAt: '2026-09-05T20:00:00.000Z' }),
    );
  });

  it('counts only report submissions in each current category', () => {
    const summary = summarizeCommunityReports([
      report('report-1', 'SCAM_FRAUD'),
      report('report-2', 'SCAM_FRAUD'),
      report('report-3', 'ROBOCALL'),
      report('legacy-report', 'SCAM'),
      {
        id: 'comment-1',
        displayName: 'Whoo user',
        kind: 'COMMENT',
        tag: 'SPAM',
        note: 'This was a recording.',
        createdAt: null,
      },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.counts.SCAM_FRAUD).toBe(3);
    expect(summary.counts.ROBOCALL).toBe(1);
    expect(summary.counts.SPAM).toBe(0);
  });
});
