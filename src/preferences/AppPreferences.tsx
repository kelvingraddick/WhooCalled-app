import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  defaultLocalPreferences,
  loadLocalPreferences,
  saveLocalPreferences,
  type AppearancePreference,
  type LocalPreferences,
} from './preferencesRepository';

type AppPreferencesContextValue = Readonly<{
  preferences: LocalPreferences;
  isLoaded: boolean;
  setAppearance: (appearance: AppearancePreference) => void;
  setDetectClipboardNumbers: (enabled: boolean) => void;
  setConfirmBeforeSpending: (enabled: boolean) => void;
}>;

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(
  null,
);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(defaultLocalPreferences);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isActive = true;

    void loadLocalPreferences().then(loaded => {
      if (isActive) {
        setPreferences(loaded);
        setIsLoaded(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const update = useCallback((next: Partial<LocalPreferences>) => {
    setPreferences(current => {
      const updated = { ...current, ...next };
      void saveLocalPreferences(updated).catch(() => undefined);
      return updated;
    });
  }, []);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      preferences,
      isLoaded,
      setAppearance: appearance => update({ appearance }),
      setDetectClipboardNumbers: detectClipboardNumbers =>
        update({ detectClipboardNumbers }),
      setConfirmBeforeSpending: confirmBeforeSpending =>
        update({ confirmBeforeSpending }),
    }),
    [isLoaded, preferences, update],
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferencesContextValue {
  const context = useContext(AppPreferencesContext);

  if (!context) {
    throw new Error(
      'useAppPreferences must be used within AppPreferencesProvider.',
    );
  }

  return context;
}
