import { AppleButton } from '@invertase/react-native-apple-authentication';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BrandOwl } from '../../components/BrandOwl';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { UtilityIcon } from '../../components/VisualIdentity';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';

type ActivationScreenProps = Readonly<{
  isSigningIn: boolean;
  message: string | null;
  onClose: () => void;
  onSignInWithApple: () => void;
  onSignInWithGoogle: () => void;
}>;

const benefits = [
  { icon: 'sparkles-outline' as const, label: 'Full results, every source and confidence score' },
  { icon: 'time-outline' as const, label: 'Unlimited history, reopening a number is free' },
  { icon: 'people-outline' as const, label: 'Community reports and comments' },
] as const;

export function ActivationScreen({
  isSigningIn,
  message,
  onClose,
  onSignInWithApple,
  onSignInWithGoogle,
}: ActivationScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityLabel="Close activation"
        accessibilityRole="button"
        disabled={isSigningIn}
        hitSlop={16}
        onPress={onClose}
        testID="close-activation"
        style={styles.closeButton}
      >
        <Text style={styles.closeGlyph}>×</Text>
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <BrandOwl framed={false} size={128} />
        <Text style={styles.title}>Start with 3 free{`\n`}lookups a month</Text>
        <Text style={styles.description}>
          Sign in once so your lookups, history and credits stay with you. No
          password, no card.
        </Text>

        <View style={styles.benefits}>
          {benefits.map(benefit => (
            <View key={benefit.label} style={styles.benefitRow}>
              <View style={styles.checkCircle}>
                <UtilityIcon name={benefit.icon} size={17} />
              </View>
              <Text style={styles.benefitText}>{benefit.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionArea}>
          {isSigningIn ? (
            <ActivityIndicator
              color={theme.accent}
              style={styles.signingIndicator}
            />
          ) : null}
          <View
            pointerEvents={isSigningIn ? 'none' : 'auto'}
            style={isSigningIn ? styles.dimmed : undefined}
          >
            <AppleButton
              buttonStyle={
                theme.mode === 'light'
                  ? AppleButton.Style.BLACK
                  : AppleButton.Style.WHITE
              }
              buttonType={AppleButton.Type.CONTINUE}
              cornerRadius={radii.control}
              onPress={onSignInWithApple}
              style={styles.appleButton}
              testID="continue-with-apple"
            />
          </View>
          <View
            pointerEvents={isSigningIn ? 'none' : 'auto'}
            style={isSigningIn ? styles.dimmed : undefined}
          >
            <GoogleSignInButton
              disabled={isSigningIn}
              onPress={onSignInWithGoogle}
              style={styles.googleButton}
              testID="continue-with-google"
            />
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Text style={styles.identityNote}>
            Your Apple or Google identity is never shown publicly.
          </Text>
          <View style={styles.legalRow}>
            <Text style={styles.legalText}>Terms</Text>
            <Text style={styles.legalDot}>·</Text>
            <Text style={styles.legalText}>Privacy</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { backgroundColor: theme.background, flex: 1 },
    closeButton: {
      alignItems: 'center',
      height: 48,
      justifyContent: 'center',
      position: 'absolute',
      right: 24,
      top: 22,
      width: 48,
      zIndex: 2,
    },
    closeGlyph: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 30,
      lineHeight: 32,
    },
    content: {
      alignItems: 'center',
      flexGrow: 1,
      paddingBottom: 28,
      paddingHorizontal: 26,
      paddingTop: 88,
    },
    title: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 29,
      letterSpacing: -1.55,
      lineHeight: 34,
      marginTop: 31,
      textAlign: 'center',
    },
    description: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 16,
      letterSpacing: -0.55,
      lineHeight: 24,
      marginTop: 20,
      maxWidth: 360,
      textAlign: 'center',
    },
    benefits: { alignSelf: 'stretch', gap: 16, marginTop: 34 },
    benefitRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
    checkCircle: {
      alignItems: 'center',
      backgroundColor: theme.accentMuted,
      borderRadius: radii.pill,
      height: 29,
      justifyContent: 'center',
      width: 29,
    },
    checkGlyph: {
      color: theme.accent,
      fontFamily: fonts.bold,
      fontSize: 17,
      lineHeight: 19,
    },
    benefitText: {
      color: theme.bodyText,
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.48,
      lineHeight: 21,
    },
    actionArea: { alignSelf: 'stretch', marginTop: 'auto', paddingTop: 44 },
    signingIndicator: { marginBottom: 16 },
    appleButton: { alignSelf: 'stretch', height: 58, width: '100%' },
    googleButton: { marginTop: 14 },
    dimmed: { opacity: 0.55 },
    message: {
      color: theme.danger,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 14,
      textAlign: 'center',
    },
    identityNote: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 26,
      textAlign: 'center',
    },
    legalRow: {
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      marginTop: 4,
    },
    legalText: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    legalDot: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
  });
