import {
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import { fonts } from '../theme/fonts';
import { radii } from '../theme/tokens';

const googleLogo = require('../../assets/branding/google-signin/google-g.png');

type GoogleSignInButtonProps = Readonly<{
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function GoogleSignInButton({
  disabled = false,
  onPress,
  style,
  testID,
}: GoogleSignInButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Continue with Google"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, style]}
      testID={testID}
    >
      <Image accessible={false} source={googleLogo} style={styles.logo} />
      <Text style={styles.label}>Continue with Google</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#747775',
    borderRadius: radii.control,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  label: {
    color: '#1F1F1F',
    fontFamily: fonts.googleSansMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  logo: {
    height: 20,
    left: 16,
    position: 'absolute',
    resizeMode: 'contain',
    width: 20,
  },
});
