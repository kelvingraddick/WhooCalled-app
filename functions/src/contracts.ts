import {z} from 'zod';

export const lookupRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    phoneInput: z.string().trim().min(3).max(64),
    countryHint: z.string().trim().length(2).toUpperCase(),
    mode: z.enum(['INITIAL', 'REFRESH']),
    lookupId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === 'REFRESH' && !value.lookupId) {
      context.addIssue({
        code: 'custom',
        message: 'lookupId is required for refresh requests',
        path: ['lookupId'],
      });
    }
  });

export type LookupRequest = z.infer<typeof lookupRequestSchema>;

export function parseLookupRequest(input: unknown): LookupRequest {
  return lookupRequestSchema.parse(input);
}
