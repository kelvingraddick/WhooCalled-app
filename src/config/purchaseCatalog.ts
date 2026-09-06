export type PurchaseKind = 'subscription' | 'credit-pack';
export type BillingPeriod = 'monthly' | 'annual';
export type PlanKey = 'plus' | 'pro' | 'power';

export type SubscriptionCatalogProduct = Readonly<{
  productIdentifier: string;
  kind: 'subscription';
  title: string;
  monthlyAllowance: number;
  plan: PlanKey;
  billingPeriod: BillingPeriod;
}>;

export type CreditPackCatalogProduct = Readonly<{
  productIdentifier: string;
  kind: 'credit-pack';
  title: string;
  credits: number;
}>;

export type CatalogProduct =
  | SubscriptionCatalogProduct
  | CreditPackCatalogProduct;

export const purchaseCatalog = [
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.plus.monthly',
    kind: 'subscription',
    title: 'Plus',
    plan: 'plus',
    billingPeriod: 'monthly',
    monthlyAllowance: 15,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.plus.annual',
    kind: 'subscription',
    title: 'Plus',
    plan: 'plus',
    billingPeriod: 'annual',
    monthlyAllowance: 15,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.pro.monthly',
    kind: 'subscription',
    title: 'Pro',
    plan: 'pro',
    billingPeriod: 'monthly',
    monthlyAllowance: 35,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.pro.annual',
    kind: 'subscription',
    title: 'Pro',
    plan: 'pro',
    billingPeriod: 'annual',
    monthlyAllowance: 35,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.power.monthly',
    kind: 'subscription',
    title: 'Power',
    plan: 'power',
    billingPeriod: 'monthly',
    monthlyAllowance: 60,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.power.annual',
    kind: 'subscription',
    title: 'Power',
    plan: 'power',
    billingPeriod: 'annual',
    monthlyAllowance: 60,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.credits.10',
    kind: 'credit-pack',
    title: '10',
    credits: 10,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.credits.25',
    kind: 'credit-pack',
    title: '25',
    credits: 25,
  },
  {
    productIdentifier: 'com.wavelinkllc.whoocalled.credits.50',
    kind: 'credit-pack',
    title: '50',
    credits: 50,
  },
] as const satisfies readonly CatalogProduct[];

export const planKeys: readonly PlanKey[] = ['plus', 'pro', 'power'];

export function catalogProductFor(
  productIdentifier: string,
): CatalogProduct | undefined {
  return purchaseCatalog.find(
    product => product.productIdentifier === productIdentifier,
  );
}

export function planKeyForName(planName: string): PlanKey | null {
  const normalized = planName.trim().toLowerCase();
  return planKeys.find(plan => plan === normalized) ?? null;
}
