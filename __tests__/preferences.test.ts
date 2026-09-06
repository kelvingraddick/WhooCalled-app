import {
  __testing,
  defaultLocalPreferences,
} from '../src/preferences/preferencesRepository';
import { resolveTheme, themes } from '../src/theme/tokens';

describe('local preferences', () => {
  it('keeps valid persisted settings and replaces malformed values with defaults', () => {
    expect(
      __testing.parsePreferences({
        appearance: 'light',
        detectClipboardNumbers: false,
        confirmBeforeSpending: true,
      }),
    ).toEqual({
      appearance: 'light',
      detectClipboardNumbers: false,
      confirmBeforeSpending: true,
    });

    expect(__testing.parsePreferences({ appearance: 'sepia' })).toEqual(
      defaultLocalPreferences,
    );
  });

  it('resolves an explicit appearance before the system appearance', () => {
    expect(resolveTheme('dark', 'light')).toBe(themes.light);
    expect(resolveTheme('light', 'dark')).toBe(themes.dark);
    expect(resolveTheme('light', 'system')).toBe(themes.light);
  });
});
