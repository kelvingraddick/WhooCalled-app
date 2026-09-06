import { Platform } from 'react-native';
import Config from 'react-native-config';

export type LegalDocument = 'guidelines' | 'privacy' | 'terms';

type PublicReleaseConfig = Readonly<{
  revenueCatApiKey: string | null;
  legalUrls: Readonly<Record<LegalDocument, string | null>>;
}>;

const readString = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const readUrl = (value: string | undefined): string | null => {
  const normalized = readString(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' ? normalized : null;
  } catch {
    return null;
  }
};

export function getPublicReleaseConfig(): PublicReleaseConfig {
  return {
    revenueCatApiKey: readString(
      Platform.select({
        ios: Config.REVENUECAT_IOS_API_KEY,
        android: Config.REVENUECAT_ANDROID_API_KEY,
        default: undefined,
      }),
    ),
    legalUrls: {
      guidelines: readUrl(Config.GUIDELINES_URL),
      privacy: readUrl(Config.PRIVACY_URL),
      terms: readUrl(Config.TERMS_URL),
    },
  };
}

export function missingPublicReleaseConfig(): string[] {
  const config = getPublicReleaseConfig();
  const missing: string[] = [];

  if (!config.revenueCatApiKey) {
    missing.push(
      Platform.OS === 'android'
        ? 'REVENUECAT_ANDROID_API_KEY'
        : 'REVENUECAT_IOS_API_KEY',
    );
  }

  (Object.keys(config.legalUrls) as LegalDocument[]).forEach(document => {
    if (!config.legalUrls[document]) {
      missing.push(`${document.toUpperCase()}_URL`);
    }
  });

  return missing;
}
