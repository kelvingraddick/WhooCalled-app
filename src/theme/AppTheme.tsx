import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { useAppPreferences } from '../preferences/AppPreferences';
import { resolveTheme, type AppTheme } from './tokens';

const AppThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const { preferences } = useAppPreferences();
  const theme = useMemo(
    () => resolveTheme(scheme, preferences.appearance),
    [preferences.appearance, scheme],
  );

  return (
    <AppThemeContext.Provider value={theme}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const theme = useContext(AppThemeContext);

  if (!theme) {
    throw new Error('useAppTheme must be used within AppThemeProvider.');
  }

  return theme;
}
