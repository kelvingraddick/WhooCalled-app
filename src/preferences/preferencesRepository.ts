import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearancePreference = 'system' | 'light' | 'dark';

export type LocalPreferences = Readonly<{
  appearance: AppearancePreference;
  detectClipboardNumbers: boolean;
  confirmBeforeSpending: boolean;
}>;

export const defaultLocalPreferences: LocalPreferences = {
  appearance: 'system',
  detectClipboardNumbers: true,
  confirmBeforeSpending: true,
};

const storageKey = 'whoo-called.local-preferences.v1';

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function parsePreferences(value: unknown): LocalPreferences {
  if (!value || typeof value !== 'object') {
    return defaultLocalPreferences;
  }

  const candidate = value as Partial<LocalPreferences>;

  return {
    appearance: isAppearancePreference(candidate.appearance)
      ? candidate.appearance
      : defaultLocalPreferences.appearance,
    detectClipboardNumbers:
      typeof candidate.detectClipboardNumbers === 'boolean'
        ? candidate.detectClipboardNumbers
        : defaultLocalPreferences.detectClipboardNumbers,
    confirmBeforeSpending:
      typeof candidate.confirmBeforeSpending === 'boolean'
        ? candidate.confirmBeforeSpending
        : defaultLocalPreferences.confirmBeforeSpending,
  };
}

export async function loadLocalPreferences(): Promise<LocalPreferences> {
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    return stored
      ? parsePreferences(JSON.parse(stored))
      : defaultLocalPreferences;
  } catch {
    return defaultLocalPreferences;
  }
}

export async function saveLocalPreferences(
  preferences: LocalPreferences,
): Promise<void> {
  await AsyncStorage.setItem(storageKey, JSON.stringify(preferences));
}

export const __testing = { parsePreferences, storageKey };
