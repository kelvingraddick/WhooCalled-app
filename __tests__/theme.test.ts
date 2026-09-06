import { resolveTheme, themes } from '../src/theme/tokens';

const contrastRatio = (foreground: string, background: string): number => {
  const relativeLuminance = (hex: string): number => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)!
      .map(channel => parseInt(channel, 16) / 255)
      .map(channel =>
        channel <= 0.03928
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4),
      );

    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };

  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
};

describe('app themes', () => {
  it('follows light and dark appearances and defaults to the established dark theme', () => {
    expect(resolveTheme('light')).toBe(themes.light);
    expect(resolveTheme('dark')).toBe(themes.dark);
    expect(resolveTheme(null)).toBe(themes.dark);
    expect(resolveTheme('dark', 'light')).toBe(themes.light);
  });

  it('sets a status bar style and accessible text contrast for each appearance', () => {
    expect(themes.light.statusBarStyle).toBe('dark-content');
    expect(themes.dark.statusBarStyle).toBe('light-content');
    expect(
      contrastRatio(themes.light.bodyText, themes.light.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(themes.dark.bodyText, themes.dark.background),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
