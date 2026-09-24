import { z } from 'zod';

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .refine(value => !/[\u0000-\u001F\u007F]/.test(value), {
    message: 'Display name contains unsupported characters.',
  });

export const supportTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(3).max(4000),
  })
  .strict();

export const dataRequestSchema = z
  .object({
    requestType: z.enum(['remove', 'correct']),
    phoneInput: z.string().trim().min(10).max(32),
    details: z.string().trim().min(3).max(4000),
  })
  .strict();

export type DataRequest = z.infer<typeof dataRequestSchema>;
export type SupportTicket = z.infer<typeof supportTicketSchema>;

export type CreditBalance = Readonly<{
  monthKey: string;
  monthlyUsed: number;
  heldMonthly: number;
  noResultRefundsUsed: number;
  purchasedCredits: number;
  heldPurchased: number;
  subscriptionAllowance: number | null;
  subscriptionExpiresAt: number | null;
  planName: string | null;
}>;

export const freeMonthlyAllowance = 3;
export const monthlyNoResultRefundLimit = 3;

export function calendarMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

export function normalizeCreditBalance(
  raw: Partial<CreditBalance> | undefined,
  now: Date,
): CreditBalance {
  const candidate = raw ?? {};
  const monthKey = calendarMonthKey(now);
  const isCurrentMonth = candidate.monthKey === monthKey;
  const monthlyUsed =
    isCurrentMonth &&
    typeof candidate.monthlyUsed === 'number' &&
    Number.isInteger(candidate.monthlyUsed) &&
    candidate.monthlyUsed > 0
      ? candidate.monthlyUsed
      : 0;
  const heldMonthly =
    isCurrentMonth &&
    typeof candidate.heldMonthly === 'number' &&
    Number.isInteger(candidate.heldMonthly) &&
    candidate.heldMonthly > 0
      ? candidate.heldMonthly
      : 0;
  const noResultRefundsUsed =
    isCurrentMonth &&
    typeof candidate.noResultRefundsUsed === 'number' &&
    Number.isInteger(candidate.noResultRefundsUsed) &&
    candidate.noResultRefundsUsed > 0
      ? Math.min(candidate.noResultRefundsUsed, monthlyNoResultRefundLimit)
      : 0;
  const purchasedCredits =
    typeof candidate.purchasedCredits === 'number' &&
    Number.isInteger(candidate.purchasedCredits) &&
    candidate.purchasedCredits > 0
      ? candidate.purchasedCredits
      : 0;
  const heldPurchased =
    typeof candidate.heldPurchased === 'number' &&
    Number.isInteger(candidate.heldPurchased) &&
    candidate.heldPurchased > 0
      ? candidate.heldPurchased
      : 0;
  const subscriptionExpiresAt =
    typeof candidate.subscriptionExpiresAt === 'number' &&
    candidate.subscriptionExpiresAt > now.getTime()
      ? candidate.subscriptionExpiresAt
      : null;
  const subscriptionAllowance =
    typeof candidate.subscriptionAllowance === 'number' &&
    Number.isInteger(candidate.subscriptionAllowance) &&
    candidate.subscriptionAllowance > 0 &&
    subscriptionExpiresAt
      ? candidate.subscriptionAllowance
      : null;

  return {
    monthKey,
    monthlyUsed,
    heldMonthly,
    noResultRefundsUsed,
    purchasedCredits,
    heldPurchased,
    subscriptionAllowance,
    subscriptionExpiresAt,
    planName:
      typeof candidate.planName === 'string' && candidate.planName.trim()
        ? candidate.planName.trim()
        : null,
  };
}

export function monthlyAllowance(balance: CreditBalance): number {
  return balance.subscriptionAllowance ?? freeMonthlyAllowance;
}

export function monthlyRemaining(balance: CreditBalance): number {
  return Math.max(
    0,
    monthlyAllowance(balance) - balance.monthlyUsed - balance.heldMonthly,
  );
}

export function purchasedRemaining(balance: CreditBalance): number {
  return Math.max(0, balance.purchasedCredits - balance.heldPurchased);
}

export function noResultRefundsRemaining(balance: CreditBalance): number {
  return Math.max(0, monthlyNoResultRefundLimit - balance.noResultRefundsUsed);
}

export function resetMonthlyUsageForTesting(
  balance: CreditBalance,
): CreditBalance {
  return { ...balance, monthlyUsed: 0, noResultRefundsUsed: 0 };
}

export type CreditSettlementReason =
  | 'CAPTURE'
  | 'TECHNICAL_FAILURE'
  | 'NO_USEFUL_EVIDENCE';

export type CreditSettlementOutcome =
  | 'CAPTURED'
  | 'RETURNED_TECHNICAL'
  | 'RETURNED_NO_RESULT'
  | 'CAPTURED_REFUND_LIMIT';

export function settleReservedCredit(
  balance: CreditBalance,
  source: 'monthly' | 'purchased',
  reason: CreditSettlementReason,
  noResultRefundsEnabled: boolean,
): { balance: CreditBalance; outcome: CreditSettlementOutcome } {
  if (reason === 'TECHNICAL_FAILURE') {
    return {
      balance: releaseCredit(balance, source),
      outcome: 'RETURNED_TECHNICAL',
    };
  }

  if (
    reason === 'NO_USEFUL_EVIDENCE' &&
    noResultRefundsEnabled &&
    noResultRefundsRemaining(balance) > 0
  ) {
    return {
      balance: {
        ...releaseCredit(balance, source),
        noResultRefundsUsed: balance.noResultRefundsUsed + 1,
      },
      outcome: 'RETURNED_NO_RESULT',
    };
  }

  return {
    balance: captureCredit(balance, source),
    outcome:
      reason === 'NO_USEFUL_EVIDENCE' && noResultRefundsEnabled
        ? 'CAPTURED_REFUND_LIMIT'
        : 'CAPTURED',
  };
}

export function reserveCredit(
  balance: CreditBalance,
): { balance: CreditBalance; source: 'monthly' | 'purchased' } | null {
  if (monthlyRemaining(balance) > 0) {
    return {
      balance: { ...balance, heldMonthly: balance.heldMonthly + 1 },
      source: 'monthly',
    };
  }

  if (purchasedRemaining(balance) > 0) {
    return {
      balance: {
        ...balance,
        heldPurchased: balance.heldPurchased + 1,
      },
      source: 'purchased',
    };
  }

  return null;
}

export function captureCredit(
  balance: CreditBalance,
  source: 'monthly' | 'purchased',
): CreditBalance {
  if (source === 'monthly') {
    return {
      ...balance,
      heldMonthly: Math.max(0, balance.heldMonthly - 1),
      monthlyUsed: balance.monthlyUsed + 1,
    };
  }

  return {
    ...balance,
    heldPurchased: Math.max(0, balance.heldPurchased - 1),
    purchasedCredits: Math.max(0, balance.purchasedCredits - 1),
  };
}

export function releaseCredit(
  balance: CreditBalance,
  source: 'monthly' | 'purchased',
): CreditBalance {
  return source === 'monthly'
    ? { ...balance, heldMonthly: Math.max(0, balance.heldMonthly - 1) }
    : { ...balance, heldPurchased: Math.max(0, balance.heldPurchased - 1) };
}

export type CreditProduct = Readonly<{
  credits?: number;
  monthlyAllowance?: number;
  planName?: string;
}>;

export const revenueCatProductMap = {
  'com.wavelinkllc.whoocalled.plus.monthly': {
    monthlyAllowance: 15,
    planName: 'Plus',
  },
  // Annual products stay recognized for existing subscribers but are hidden
  // from the client storefront until retention and cost data justify them.
  'com.wavelinkllc.whoocalled.plus.annual': {
    monthlyAllowance: 15,
    planName: 'Plus',
  },
  'com.wavelinkllc.whoocalled.pro.monthly': {
    monthlyAllowance: 35,
    planName: 'Pro',
  },
  'com.wavelinkllc.whoocalled.pro.annual': {
    monthlyAllowance: 35,
    planName: 'Pro',
  },
  'com.wavelinkllc.whoocalled.power.monthly': {
    monthlyAllowance: 60,
    planName: 'Power',
  },
  'com.wavelinkllc.whoocalled.power.annual': {
    monthlyAllowance: 60,
    planName: 'Power',
  },
  // Legacy packs remain recognized to reconcile purchases from older builds.
  'com.wavelinkllc.whoocalled.credits.5': { credits: 5 },
  'com.wavelinkllc.whoocalled.credits.20': { credits: 20 },
  'com.wavelinkllc.whoocalled.credits.10': { credits: 10 },
  'com.wavelinkllc.whoocalled.credits.25': { credits: 25 },
  'com.wavelinkllc.whoocalled.credits.50': { credits: 50 },
} as const satisfies Record<string, CreditProduct>;

export type RevenueCatWebhookEvent = Readonly<{
  id: string;
  type: string;
  productId: string | null;
  expirationAtMs: number | null;
}>;

export function parseCreditProductMap(
  value: string,
): Record<string, CreditProduct> {
  const parsed: unknown = JSON.parse(value);
  const schema = z.record(
    z.string().min(1),
    z
      .object({
        credits: z.number().int().positive().optional(),
        monthlyAllowance: z.number().int().positive().optional(),
        planName: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .refine(product => product.credits || product.monthlyAllowance, {
        message: 'A product must grant credits or a monthly allowance.',
      }),
  );

  return schema.parse(parsed);
}

export function applyRevenueCatWebhookEvent({
  alreadyProcessed,
  balance,
  event,
  productMap,
  now,
}: Readonly<{
  alreadyProcessed: boolean;
  balance: Partial<CreditBalance> | undefined;
  event: RevenueCatWebhookEvent;
  productMap: Record<string, CreditProduct>;
  now: Date;
}>): CreditBalance | null {
  if (alreadyProcessed || !event.productId) {
    return null;
  }

  const product = productMap[event.productId];
  if (!product) {
    return null;
  }

  const current = normalizeCreditBalance(balance, now);
  let updated = current;

  if (
    product.credits &&
    ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(event.type)
  ) {
    updated = {
      ...updated,
      purchasedCredits: updated.purchasedCredits + product.credits,
    };
  }

  if (product.monthlyAllowance) {
    const isExpiration = event.type === 'EXPIRATION';
    updated = {
      ...updated,
      subscriptionAllowance: isExpiration ? null : product.monthlyAllowance,
      subscriptionExpiresAt: isExpiration
        ? null
        : event.expirationAtMs ?? current.subscriptionExpiresAt,
      planName: isExpiration ? null : product.planName ?? 'Subscription',
    };
  }

  return updated;
}
