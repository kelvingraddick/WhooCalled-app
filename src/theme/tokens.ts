import type { ColorSchemeName, StatusBarStyle } from 'react-native';

import type { AppearancePreference } from '../preferences/preferencesRepository';

export type ThemeMode = 'light' | 'dark';
type ResolvedColorScheme = ColorSchemeName | null | undefined;

export type AppTheme = Readonly<{
  mode: ThemeMode;
  statusBarStyle: StatusBarStyle;
  background: string;
  surface: string;
  surfaceBorder: string;
  divider: string;
  text: string;
  bodyText: string;
  mutedText: string;
  accent: string;
  accentText: string;
  accentMuted: string;
  danger: string;
  highConfidence: string;
  highConfidenceSurface: string;
  lowConfidence: string;
  lowConfidenceSurface: string;
}>;

export const themes: Readonly<Record<ThemeMode, AppTheme>> = {
  light: {
    mode: 'light',
    statusBarStyle: 'dark-content',
    background: '#F4F1EA',
    surface: '#FFFCF8',
    surfaceBorder: '#D7CFC2',
    divider: '#D9D2C8',
    text: '#12110F',
    bodyText: '#3A342D',
    mutedText: '#685F56',
    accent: '#F1B94A',
    accentText: '#12110F',
    accentMuted: '#5C461E',
    danger: '#B74734',
    highConfidence: '#376438',
    highConfidenceSurface: '#E2ECDD',
    lowConfidence: '#7B3B33',
    lowConfidenceSurface: '#F4E5E2',
  },
  dark: {
    mode: 'dark',
    statusBarStyle: 'light-content',
    background: '#12110F',
    surface: '#1A1816',
    surfaceBorder: '#302B26',
    divider: '#29241F',
    text: '#F4F1EA',
    bodyText: '#D9D2C9',
    mutedText: '#938C84',
    accent: '#F1B94A',
    accentText: '#12110F',
    accentMuted: '#5C461E',
    danger: '#E8755D',
    highConfidence: '#B7CCAD',
    highConfidenceSurface: '#23271F',
    lowConfidence: '#B5ABA5',
    lowConfidenceSurface: '#282321',
  },
} as const;

export const resolveTheme = (
  scheme: ResolvedColorScheme,
  preference: AppearancePreference = 'system',
): AppTheme => {
  const mode = preference === 'system' ? scheme : preference;
  return themes[mode === 'light' ? 'light' : 'dark'];
};

export const radii = {
  screen: 44,
  card: 28,
  control: 24,
  pill: 999,
} as const;
