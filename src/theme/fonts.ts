import { Platform } from 'react-native';

const fontName = (iosName: string, androidName: string): string =>
  Platform.select({ ios: iosName, android: androidName, default: androidName });

export const fonts = {
  regular: fontName('Manrope-Regular', 'Manrope_400Regular'),
  medium: fontName('Manrope-Medium', 'Manrope_500Medium'),
  semibold: fontName('Manrope-SemiBold', 'Manrope_600SemiBold'),
  bold: fontName('Manrope-Bold', 'Manrope_700Bold'),
  extraBold: fontName('Manrope-ExtraBold', 'Manrope_800ExtraBold'),
  googleSansMedium: fontName('GoogleSans-Medium', 'GoogleSans-Medium'),
} as const;
