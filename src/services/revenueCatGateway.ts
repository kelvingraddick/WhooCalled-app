import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { getPublicReleaseConfig } from '../config/releaseConfig';

let configuredUserId: string | null = null;
let identityOperation: Promise<void> = Promise.resolve();

function serializeIdentityOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = identityOperation.then(operation, operation);
  identityOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export type RevenueCatPackage = Readonly<{
  identifier: string;
  productIdentifier: string;
  title: string;
  description: string;
  price: string;
  priceAmount: number;
  package: PurchasesPackage;
}>;

function toPackage(value: PurchasesPackage): RevenueCatPackage {
  return {
    identifier: value.identifier,
    productIdentifier: value.product.identifier,
    title: value.product.title,
    description: value.product.description,
    price: value.product.priceString,
    priceAmount: value.product.price,
    package: value,
  };
}

export const revenueCatGateway = {
  async configure(userId: string): Promise<boolean> {
    return serializeIdentityOperation(async () => {
      const { revenueCatApiKey } = getPublicReleaseConfig();
      if (!revenueCatApiKey) {
        return false;
      }

      if (!configuredUserId) {
        Purchases.configure({ apiKey: revenueCatApiKey, appUserID: userId });
        configuredUserId = userId;
        return true;
      }

      if (configuredUserId !== userId) {
        await Purchases.logIn(userId);
        configuredUserId = userId;
      }

      return true;
    });
  },

  async getCurrentOffering(): Promise<RevenueCatPackage[]> {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages.map(toPackage) ?? [];
  },

  async purchase(value: RevenueCatPackage): Promise<void> {
    await Purchases.purchasePackage(value.package);
  },

  async restore(): Promise<void> {
    await Purchases.restorePurchases();
  },

  async signOut(): Promise<void> {
    return serializeIdentityOperation(async () => {
      if (!configuredUserId) {
        return;
      }

      await Purchases.logOut();
      configuredUserId = null;
    });
  },
};
