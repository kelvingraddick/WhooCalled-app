import { useMemo } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandOwl } from '../../components/BrandOwl';
import { UtilityIcon } from '../../components/VisualIdentity';
import type { AppUser } from '../../services/authGateway';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type { LookupHistoryItem, LookupRequestState } from '../../types/lookup';
import { formatUsPhoneInput } from '../../utils/phone';

const darkWordmark = require('../../../assets/branding/whoo-called-wordmark-transparent.png');
const lightWordmark = require('../../../assets/branding/whoo-called-wordmark-light.png');
const peekingOwl = require('../../../assets/branding/whoo-called-owl-transparent-1024.png');

type HomeScreenProps = Readonly<{
  balance: Readonly<{
    monthlyAllowance: number;
    monthlyRemaining: number;
  }> | null;
  user: AppUser | null;
  phoneInput: string;
  onPhoneInputChange: (value: string) => void;
  onLookupPress: () => void;
  lookupState: LookupRequestState;
  recentLookups: LookupHistoryItem[];
  onRecentLookupPress: (lookup: LookupHistoryItem) => void;
  onHistoryPress: () => void;
  onLookupFlowOpen: () => void;
  onMoreLookupsPress: () => void;
  onMenuPress: () => void;
}>;

export function HomeScreen({
  balance,
  user,
  phoneInput,
  onPhoneInputChange,
  onLookupPress,
  lookupState,
  recentLookups,
  onRecentLookupPress,
  onHistoryPress,
  onLookupFlowOpen,
  onMoreLookupsPress,
  onMenuPress,
}: HomeScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const monthlyAllowance = Math.max(balance?.monthlyAllowance ?? 3, 1);
  const monthlyRemaining = Math.min(
    Math.max(balance?.monthlyRemaining ?? monthlyAllowance, 0),
    monthlyAllowance,
  );
  const filledCreditSegments = Math.ceil(
    (monthlyRemaining / monthlyAllowance) * 3,
  );

  const handlePaste = async () => {
    const value = await Clipboard.getString();
    onPhoneInputChange(formatUsPhoneInput(value));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.brandRow}>
          <BrandOwl framed={false} size={46} />
          <Image
            source={theme.mode === 'light' ? lightWordmark : darkWordmark}
            resizeMode="contain"
            style={styles.wordmark}
          />
        </View>
        <Pressable
          accessibilityLabel="Open menu"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onMenuPress}
          testID="open-settings"
          style={styles.menuButton}
        >
          <View style={styles.menuLines}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </View>
        </Pressable>
      </View>

      <View style={styles.intro}>
        <View pointerEvents="none" style={styles.introOwl}>
          <Image
            source={peekingOwl}
            resizeMode="contain"
            style={styles.introOwlImage}
          />
        </View>
        <Text style={styles.introCopy}>
          Who called?{' '}
          <Text style={styles.introCopyEmphasis}>
            Enter an unknown number below
          </Text>{' '}
          and we’ll check several independent sources to try and find out.
        </Text>
      </View>

      <View style={styles.phoneControl}>
        <TextInput
          accessibilityLabel="US phone number"
          keyboardType="phone-pad"
          maxLength={18}
          onChangeText={value => onPhoneInputChange(formatUsPhoneInput(value))}
          onFocus={onLookupFlowOpen}
          placeholder="Enter a US number"
          placeholderTextColor={theme.mutedText}
          selectionColor={theme.accent}
          style={styles.phoneInput}
          value={phoneInput}
        />
        <Pressable
          accessibilityLabel="Paste phone number"
          accessibilityRole="button"
          hitSlop={10}
          onPress={handlePaste}
        >
          <Text style={styles.pasteText}>PASTE</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={lookupState.kind === 'loading'}
        onPress={onLookupPress}
        testID="lookup-number"
        style={({ pressed }) => [
          styles.lookupButton,
          pressed && styles.pressed,
          lookupState.kind === 'loading' && styles.disabled,
        ]}
      >
        {lookupState.kind === 'loading' ? (
          <ActivityIndicator color={theme.accentText} />
        ) : (
          <>
            <View style={styles.lookupLabelRow}>
              <UtilityIcon name="search-outline" size={20} />
              <Text style={styles.lookupButtonText}>Look up number</Text>
            </View>
            <Text style={styles.lookupCost}>1 LOOKUP</Text>
          </>
        )}
      </Pressable>

      {lookupState.kind === 'message' ? (
        <Text
          style={[
            styles.feedback,
            lookupState.tone === 'error' && styles.errorFeedback,
          ]}
        >
          {lookupState.message}
        </Text>
      ) : null}

      <View style={styles.summaryRow}>
        <View style={styles.creditCard}>
          <View style={styles.cardHeading}>
            <UtilityIcon name="sparkles-outline" size={17} />
            <Text style={styles.cardEyebrow}>YOUR LOOKUPS</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balance}>{monthlyRemaining}</Text>
            <Text style={styles.balanceSuffix}>of {monthlyAllowance}</Text>
          </View>
          <View style={styles.creditTrack}>
            {Array.from({ length: 3 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.creditSegment,
                  index >= filledCreditSegments && styles.creditSegmentEmpty,
                ]}
                testID={`credit-segment-${index}`}
              />
            ))}
          </View>
          <Text style={styles.cardFooter}>
            {user
              ? 'Free plan · resets monthly'
              : 'Activate your free plan to begin'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Open More lookups"
          accessibilityRole="button"
          onPress={onMoreLookupsPress}
          style={({ pressed }) => [
            styles.upgradeCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.upgradeHeading}>
            <UtilityIcon
              color={theme.accentText}
              name="arrow-up-circle-outline"
              size={19}
            />
            <Text style={[styles.cardEyebrow, styles.upgradeEyebrow]}>
              NEED MORE?
            </Text>
          </View>
          <Text style={styles.upgradePrice}>15 / mo{`\n`}for $5.99</Text>
          <Text style={styles.upgradeLink}>Upgrade →</Text>
        </Pressable>
      </View>

      <View style={styles.recentHeader}>
        <Text style={styles.recentTitle}>RECENT LOOKUPS</Text>
        <Pressable
          accessibilityLabel="Open lookup history"
          accessibilityRole="button"
          onPress={onHistoryPress}
          style={({ pressed }) => [
            styles.historyLinkButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.historyLink}>History</Text>
          <UtilityIcon
            color={theme.accentMuted}
            name="arrow-up-right-box-outline"
            size={16}
          />
        </Pressable>
      </View>

      {recentLookups.length ? (
        <View style={styles.historyList}>
          {recentLookups.map(lookup => (
            <Pressable
              accessibilityLabel={`Open lookup for ${lookup.phoneDisplay}`}
              accessibilityRole="button"
              key={lookup.id}
              onPress={() => onRecentLookupPress(lookup)}
              style={({ pressed }) => [
                styles.historyItem,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.historyIcon}>
                <UtilityIcon
                  name={
                    lookup.spamReportCount > 0
                      ? 'warning-outline'
                      : 'call-outline'
                  }
                  size={22}
                />
              </View>
              <View style={styles.historyCopy}>
                <Text numberOfLines={1} style={styles.historyName}>
                  {lookup.displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.historyPhone,
                    lookup.spamReportCount > 0 && styles.spamPhone,
                  ]}
                >
                  {lookup.phoneDisplay}
                  {lookup.spamReportCount
                    ? `  ·  ${lookup.spamReportCount} spam reports`
                    : ''}
                </Text>
              </View>
              <View
                style={[
                  styles.confidencePill,
                  lookup.confidenceLabel === 'LOW' && styles.lowConfidencePill,
                ]}
              >
                <Text
                  style={[
                    styles.confidenceLabel,
                    lookup.confidenceLabel === 'LOW' &&
                      styles.lowConfidenceText,
                  ]}
                >
                  {lookup.confidenceLabel}
                </Text>
                <Text
                  style={[
                    styles.confidenceScore,
                    lookup.confidenceLabel === 'LOW' &&
                      styles.lowConfidenceText,
                  ]}
                >
                  {lookup.confidenceScore}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.emptyHistory}>
          <Text style={styles.historyGlyph}>↺</Text>
          <Text style={styles.emptyHistoryText}>
            Your completed lookups will appear here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: { paddingBottom: 34, paddingHorizontal: 24, paddingTop: 12 },
    headerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    brandRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    wordmark: {
      height: 42,
      transform: [{ translateY: 2 }],
      width: 150,
    },
    menuButton: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 16,
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    menuLines: { gap: 4 },
    menuLine: {
      backgroundColor: theme.bodyText,
      borderRadius: 4,
      height: 3,
      width: 21,
    },
    intro: {
      justifyContent: 'center',
      marginTop: 6,
      minHeight: 120,
      position: 'relative',
    },
    introOwl: {
      height: 256,
      position: 'absolute',
      right: -141,
      top: -40,
      transform: [{ rotate: '-18deg' }],
      width: 256,
    },
    introOwlImage: { height: '100%', width: '100%' },
    introCopy: {
      alignSelf: 'flex-start',
      color: theme.bodyText,
      fontFamily: fonts.regular,
      fontSize: 17,
      letterSpacing: -0.6,
      lineHeight: 24,
      maxWidth: 248,
      width: '70%',
      zIndex: 1,
    },
    introCopyEmphasis: { fontFamily: fonts.extraBold },
    phoneControl: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
      borderRadius: 22,
      borderWidth: 1.5,
      flexDirection: 'row',
      height: 60,
      justifyContent: 'space-between',
      marginTop: 28,
      paddingHorizontal: 18,
    },
    phoneInput: {
      color: theme.text,
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 17,
      letterSpacing: -0.5,
      padding: 0,
    },
    pasteText: {
      color: theme.accentMuted,
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 0.25,
    },
    lookupButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 26,
      flexDirection: 'row',
      height: 60,
      justifyContent: 'center',
      marginTop: 13,
    },
    lookupLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    upgradeHeading: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    lookupButtonText: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 19,
      letterSpacing: -0.9,
    },
    lookupCost: {
      color: theme.accentMuted,
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 0.3,
      marginLeft: 11,
    },
    pressed: { opacity: 0.82 },
    disabled: { opacity: 0.65 },
    feedback: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 12,
      textAlign: 'center',
    },
    errorFeedback: { color: theme.danger },
    summaryRow: { flexDirection: 'row', gap: 12, marginTop: 22 },
    creditCard: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      flex: 1,
      minHeight: 138,
      padding: 17,
    },
    cardEyebrow: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.5,
    },
    balanceRow: { alignItems: 'baseline', flexDirection: 'row', marginTop: 7 },
    balance: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 43,
      letterSpacing: -2.1,
      lineHeight: 48,
    },
    balanceSuffix: {
      color: theme.mutedText,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginLeft: 5,
    },
    creditTrack: { flexDirection: 'row', gap: 6, marginTop: 12 },
    creditSegment: {
      backgroundColor: theme.accent,
      borderRadius: radii.pill,
      flex: 1,
      height: 7,
    },
    creditSegmentEmpty: { backgroundColor: theme.surfaceBorder },
    cardFooter: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 11,
    },
    upgradeCard: {
      backgroundColor: theme.accent,
      borderRadius: 24,
      minHeight: 138,
      padding: 17,
      width: '41%',
    },
    upgradeEyebrow: { color: theme.accentMuted },
    upgradePrice: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 20,
      letterSpacing: -0.85,
      lineHeight: 23,
      marginTop: 19,
    },
    upgradeLink: {
      color: theme.accentMuted,
      fontFamily: fonts.bold,
      fontSize: 15,
      marginTop: 7,
    },
    recentHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 25,
    },
    recentTitle: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 2.3,
    },
    historyLink: {
      color: theme.accentMuted,
      fontFamily: fonts.extraBold,
      fontSize: 16,
    },
    historyLinkButton: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    historyList: { marginTop: 14 },
    historyItem: {
      alignItems: 'center',
      borderBottomColor: theme.divider,
      borderBottomWidth: 1,
      flexDirection: 'row',
      minHeight: 74,
      paddingVertical: 12,
    },
    historyIcon: { marginRight: 10, width: 22 },
    historyCopy: { flex: 1, paddingRight: 14 },
    historyName: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.55,
      lineHeight: 22,
    },
    historyPhone: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 18,
      marginTop: 2,
    },
    spamPhone: { color: theme.danger },
    confidencePill: {
      alignItems: 'center',
      backgroundColor: theme.highConfidenceSurface,
      borderRadius: radii.pill,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    lowConfidencePill: { backgroundColor: theme.lowConfidenceSurface },
    confidenceLabel: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 0.5,
    },
    confidenceScore: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 14,
    },
    lowConfidenceText: { color: theme.lowConfidence },
    emptyHistory: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 24,
      gap: 9,
      marginTop: 15,
      paddingHorizontal: 24,
      paddingVertical: 22,
    },
    historyGlyph: {
      color: theme.accentMuted,
      fontFamily: fonts.bold,
      fontSize: 28,
      lineHeight: 30,
    },
    emptyHistoryText: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      textAlign: 'center',
    },
  });
