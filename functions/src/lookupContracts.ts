import { z } from 'zod';

export const communityTags = [
  'SPAM',
  'SCAM',
  'WRONG_IDENTITY',
  'LEGITIMATE_BUSINESS',
  'OTHER',
] as const;

export const spamReportCategories = [
  'SPAM',
  'SCAM_FRAUD',
  'TELEMARKETING',
  'ROBOCALL',
  'DEBT_COLLECTION',
  'POLITICAL',
  'SURVEY',
  'OTHER',
] as const;

export const communitySubmissionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        lookupId: z.string().trim().min(1).max(128),
        kind: z.literal('REPORT'),
        tag: z.enum(spamReportCategories),
        note: z.string().trim().max(500).optional(),
      })
      .strict(),
    z
      .object({
        lookupId: z.string().trim().min(1).max(128),
        kind: z.literal('COMMENT'),
        tag: z.enum(communityTags),
        note: z.string().trim().max(500).optional(),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.kind === 'COMMENT' && !value.note) {
      context.addIssue({
        code: 'custom',
        message: 'A comment needs a short note.',
        path: ['note'],
      });
    }
  });

export const deleteCommunitySubmissionSchema = z
  .object({ submissionId: z.string().trim().min(1).max(256) })
  .strict();

export type CommunitySubmissionInput = z.infer<
  typeof communitySubmissionSchema
>;
