import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import { BrandOwl } from '../../components/BrandOwl';
import { UtilityIcon } from '../../components/VisualIdentity';
import { getPublicReleaseConfig } from '../../config/releaseConfig';
import type { AppUser } from '../../services/authGateway';
import type { SettingsSnapshot } from '../../services/settingsGateway';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type { AppearancePreference } from '../../preferences/preferencesRepository';

type SettingsScreenProps = Readonly<{
  user: AppUser | null;
  snapshot: SettingsSnapshot | null;
  isLoading: boolean;
  appearance: AppearancePreference;
  detectClipboardNumbers: boolean;
  confirmBeforeSpending: boolean;
  onBack: () => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onDetectClipboardChange: (enabled: boolean) => void;
  onConfirmBeforeSpendingChange: (enabled: boolean) => void;
  onAccountPress: () => void;
  onBuyLookupsPress: () => void;
  onLookupHistoryPress: () => void;
  onManageSubscriptionPress: () => void;
  onSupportPress: () => void;
  onDataRequestPress: () => void;
  onLegalPress: (document: 'guidelines' | 'privacy' | 'terms') => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  isDebugActionLoading: boolean;
  onDebugResetMonthlyLookups: () => void;
  onDebugClearLookupHistory: () => void;
  onDebugRefresh: () => void;
  onDebugCopyDiagnostics: () => void;
  message: string | null;
}>;

const appearanceLabels: Readonly<Record<AppearancePreference, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function providerLabel(provider: AppUser['provider']): string {
  if (provider === 'apple') {
    return 'Signed in with Apple';
  }

  if (provider === 'google') {
    return 'Signed in with Google';
  }

  return 'Your account';
}

function Chevron({ color }: { color: string }) {
  return <Ionicons color={color} name="chevron-forward" size={19} />;
}

function settingsIcon(label: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (/lookups remaining|buy more/i.test(label)) return 'sparkles-outline';
  if (/history/i.test(label)) return 'time-outline';
  if (/subscription/i.test(label)) return 'card-outline';
  if (/appearance/i.test(label)) return 'color-palette-outline';
  if (/clipboard/i.test(label)) return 'clipboard-outline';
  if (/spending/i.test(label)) return 'shield-checkmark-outline';
  if (/display name/i.test(label)) return 'person-outline';
  if (/correct data/i.test(label)) return 'create-outline';
  if (/guidelines/i.test(label)) return 'document-text-outline';
  if (/diagnostics/i.test(label)) return 'pulse-outline';
  return 'settings-outline';
}

type RowProps = Readonly<{
  label: string;
  description?: string;
  value?: string;
  disabled?: boolean;
  onPress?: () => void;
}>;

function SettingsRow({
  label,
  description,
  value,
  disabled = false,
  onPress,
}: RowProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && !disabled && styles.pressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowIcon}>
        <UtilityIcon name={settingsIcon(label)} size={19} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? (
          <Text style={styles.rowDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.rowTrailing}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Chevron color={theme.mutedText} />
      </View>
    </Pressable>
  );
}

type ToggleRowProps = Readonly<{
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}>;

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: ToggleRowProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.row, styles.toggleRow]}>
      <View style={styles.rowIcon}>
        <UtilityIcon name={settingsIcon(label)} size={19} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        thumbColor={value ? theme.background : theme.mutedText}
        trackColor={{ false: theme.surfaceBorder, true: theme.accent }}
        value={value}
      />
    </View>
  );
}

export function SettingsScreen({
  user,
  snapshot,
  isLoading,
  appearance,
  detectClipboardNumbers,
  confirmBeforeSpending,
  onBack,
  onAppearanceChange,
  onDetectClipboardChange,
  onConfirmBeforeSpendingChange,
  onAccountPress,
  onBuyLookupsPress,
  onLookupHistoryPress,
  onManageSubscriptionPress,
  onSupportPress,
  onDataRequestPress,
  onLegalPress,
  onSignOut,
  onDeleteAccount,
  isDebugActionLoading,
  onDebugResetMonthlyLookups,
  onDebugClearLookupHistory,
  onDebugRefresh,
  onDebugCopyDiagnostics,
  message,
}: SettingsScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const debugTapCount = useRef(0);
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const releaseConfig = getPublicReleaseConfig();
  const balance = snapshot?.balance;
  const displayName =
    snapshot?.account.displayName ?? user?.displayName ?? 'Whoo User';
  const planName = balance?.planName ?? (user ? 'Free plan' : 'Free');
  const remaining = balance?.monthlyRemaining ?? 3;
  const allowance = balance?.monthlyAllowance ?? 3;
  const resolvedAppearance =
    appearance === 'system'
      ? `System (${theme.mode === 'dark' ? 'Dark' : 'Light'})`
      : appearanceLabels[appearance];
  const version = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;
  const hasLegalDocuments = Object.values(releaseConfig.legalUrls).every(
    Boolean,
  );
  const hasDebugAccess = Boolean(user && snapshot?.debugAccess);

  const unlockDebug = () => {
    if (!hasDebugAccess || debugUnlocked) {
      return;
    }

    debugTapCount.current += 1;
    if (debugTapCount.current === 7) {
      debugTapCount.current = 0;
      setDebugUnlocked(true);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
          testID="close-settings"
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={28} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.navigationSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel={user ? 'Edit account' : 'Activate account'}
          accessibilityRole="button"
          onPress={onAccountPress}
          style={({ pressed }) => [
            styles.accountCard,
            pressed && styles.pressed,
          ]}
        >
          <BrandOwl size={56} />
          <View style={styles.accountCopy}>
            <Text numberOfLines={1} style={styles.accountName}>
              {user ? displayName : 'Whoo Called'}
            </Text>
            <Text numberOfLines={2} style={styles.accountDetails}>
              {user
                ? `${providerLabel(
                    snapshot?.account.provider ?? user.provider,
                  )} · ${planName}`
                : 'Activate to keep your lookups, credits and settings'}
            </Text>
          </View>
          <Text style={styles.accountAction}>{user ? 'Edit' : 'Activate'}</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>LOOKUPS</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Lookups remaining"
            onPress={onBuyLookupsPress}
            value={
              isLoading
                ? 'Loading'
                : `${remaining} of ${allowance}${
                    balance?.purchasedCredits
                      ? ` +${balance.purchasedCredits} extra`
                      : ''
                  }`
            }
          />
          <SettingsRow label="Buy more lookups" onPress={onBuyLookupsPress} />
          <SettingsRow label="Lookup history" onPress={onLookupHistoryPress} />
          <SettingsRow
            label="Manage subscription"
            onPress={onManageSubscriptionPress}
            value={planName === 'Free plan' ? 'Store' : planName}
          />
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Appearance"
            onPress={() => setAppearanceOpen(true)}
            value={resolvedAppearance}
          />
          <ToggleRow
            description="Offer to look up copied numbers"
            label="Detect numbers on clipboard"
            onValueChange={onDetectClipboardChange}
            value={detectClipboardNumbers}
          />
          <ToggleRow
            description="Ask before each lookup or refresh"
            label="Confirm before spending"
            onValueChange={onConfirmBeforeSpendingChange}
            value={confirmBeforeSpending}
          />
        </View>

        <Text style={styles.sectionLabel}>PRIVACY & COMMUNITY</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Display name"
            onPress={onAccountPress}
            value={user ? displayName : 'Sign in'}
          />
          <SettingsRow
            label="Remove or correct data"
            onPress={onDataRequestPress}
          />
          <SettingsRow
            disabled={!hasLegalDocuments}
            label="Guidelines · Privacy · Terms"
            onPress={() => setLegalOpen(true)}
          />
        </View>

        {hasDebugAccess && debugUnlocked ? (
          <>
            <Text style={styles.sectionLabel}>DEBUG</Text>
            <View style={styles.card}>
              <SettingsRow
                description="Restore consumed monthly lookups without changing active holds or purchased credits"
                disabled={isDebugActionLoading}
                label="Reset monthly lookups"
                onPress={onDebugResetMonthlyLookups}
              />
              <SettingsRow
                description="Permanently erase completed lookup history for this account"
                disabled={isDebugActionLoading}
                label="Erase lookup history"
                onPress={onDebugClearLookupHistory}
              />
              <SettingsRow
                disabled={isDebugActionLoading || isLoading}
                label="Refresh account state"
                onPress={onDebugRefresh}
              />
              <SettingsRow
                disabled={isDebugActionLoading}
                label="Copy diagnostics"
                onPress={onDebugCopyDiagnostics}
              />
            </View>
          </>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onSupportPress}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.footerAction}>Support</Text>
          </Pressable>
          {user ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={onSignOut}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.footerAction}>Sign out</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onDeleteAccount}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.deleteAction}>Delete account</Text>
              </Pressable>
            </>
          ) : null}
        </View>
        <Text
          accessibilityLabel={`Whoo Called version ${version}`}
          accessibilityRole="button"
          onPress={unlockDebug}
          style={styles.version}
          testID="settings-version"
        >
          Whoo Called {version}
        </Text>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setAppearanceOpen(false)}
        transparent
        visible={appearanceOpen}
      >
        <Pressable
          accessibilityLabel="Close appearance chooser"
          onPress={() => setAppearanceOpen(false)}
          style={styles.modalScrim}
        >
          <Pressable style={styles.appearanceSheet}>
            <Text style={styles.sheetTitle}>Appearance</Text>
            <Text style={styles.sheetDescription}>
              Choose how Whoo Called looks on this device.
            </Text>
            {(Object.keys(appearanceLabels) as AppearancePreference[]).map(
              option => {
                const isSelected = option === appearance;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    key={option}
                    onPress={() => {
                      onAppearanceChange(option);
                      setAppearanceOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.appearanceOption,
                      isSelected && styles.appearanceOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.appearanceOptionLabel}>
                      {appearanceLabels[option]}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        color={theme.accent}
                        name="checkmark"
                        size={22}
                      />
                    ) : null}
                  </Pressable>
                );
              },
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setLegalOpen(false)}
        transparent
        visible={legalOpen}
      >
        <Pressable
          accessibilityLabel="Close legal documents"
          onPress={() => setLegalOpen(false)}
          style={styles.modalScrim}
        >
          <Pressable style={styles.appearanceSheet}>
            <Text style={styles.sheetTitle}>Legal</Text>
            <Text style={styles.sheetDescription}>
              Choose a document to open in your browser.
            </Text>
            {(['guidelines', 'privacy', 'terms'] as const).map(document => (
              <Pressable
                accessibilityRole="button"
                key={document}
                onPress={() => {
                  setLegalOpen(false);
                  onLegalPress(document);
                }}
                style={({ pressed }) => [
                  styles.appearanceOption,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.appearanceOptionLabel}>
                  {document.charAt(0).toUpperCase() + document.slice(1)}
                </Text>
                <Chevron color={theme.mutedText} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { backgroundColor: theme.background, flex: 1 },
    navigation: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 60,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    navigationSpacer: { width: 44 },
    backButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    title: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.55,
    },
    content: { paddingBottom: 24, paddingHorizontal: 24, paddingTop: 4 },
    accountCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 24,
      flexDirection: 'row',
      minHeight: 88,
      paddingHorizontal: 16,
    },
    accountCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
    accountName: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 21,
      letterSpacing: -0.9,
    },
    accountDetails: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: -0.4,
      lineHeight: 18,
      marginTop: 2,
    },
    accountAction: {
      color: theme.accent,
      fontFamily: fonts.bold,
      fontSize: 16,
      letterSpacing: -0.45,
    },
    sectionLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 2,
      marginBottom: 10,
      marginLeft: 4,
      marginTop: 24,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      overflow: 'hidden',
    },
    row: {
      alignItems: 'center',
      borderBottomColor: theme.divider,
      borderBottomWidth: 1,
      flexDirection: 'row',
      minHeight: 54,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    rowIcon: { alignItems: 'center', justifyContent: 'center', marginRight: 12, width: 22 },
    toggleRow: { minHeight: 66, paddingVertical: 10 },
    rowCopy: { flex: 1, paddingRight: 12 },
    rowLabel: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 17,
      letterSpacing: -0.7,
      lineHeight: 21,
    },
    rowDescription: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      letterSpacing: -0.35,
      lineHeight: 17,
      marginTop: 2,
    },
    rowTrailing: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      maxWidth: '52%',
    },
    rowValue: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: -0.55,
      textAlign: 'right',
    },
    rowDisabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
    message: {
      color: theme.danger,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 18,
      textAlign: 'center',
    },
    footerActions: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 24,
      justifyContent: 'center',
      marginTop: 26,
    },
    footerAction: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.5,
    },
    deleteAction: {
      color: theme.danger,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.5,
    },
    version: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.4,
      marginTop: 18,
      textAlign: 'center',
    },
    modalScrim: {
      backgroundColor: '#00000099',
      flex: 1,
      justifyContent: 'flex-end',
      padding: 14,
    },
    appearanceSheet: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      padding: 22,
    },
    sheetTitle: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 24,
      letterSpacing: -1,
    },
    sheetDescription: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 18,
      marginTop: 5,
    },
    appearanceOption: {
      alignItems: 'center',
      borderColor: theme.surfaceBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
      minHeight: 54,
      paddingHorizontal: 17,
    },
    appearanceOptionSelected: { borderColor: theme.accent, borderWidth: 2 },
    appearanceOptionLabel: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 17,
      letterSpacing: -0.55,
    },
  });
