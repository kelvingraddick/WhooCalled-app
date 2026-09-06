import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppUser } from '../../services/authGateway';
import { UtilityIcon } from '../../components/VisualIdentity';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type { LookupHistoryItem } from '../../types/lookup';

type LookupHistoryScreenProps = Readonly<{
  user: AppUser | null;
  lookups: LookupHistoryItem[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isClearing: boolean;
  deletingLookupId: string | null;
  error: string | null;
  onBack: () => void;
  onLookupPress: (lookup: LookupHistoryItem) => void;
  onDeletePress: (lookup: LookupHistoryItem) => void;
  onClearPress: () => void;
  onEndReached: () => void;
  onRetry: () => void;
}>;

export function LookupHistoryScreen({
  user,
  lookups,
  hasMore,
  isLoading,
  isLoadingMore,
  isClearing,
  deletingLookupId,
  error,
  onBack,
  onLookupPress,
  onDeletePress,
  onClearPress,
  onEndReached,
  onRetry,
}: LookupHistoryScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const signedOut = !user;
  const showEmpty = !isLoading && !error && lookups.length === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={28} />
        </Pressable>
        <Text style={styles.title}>Lookup History</Text>
        <View style={styles.navigationSpacer} />
      </View>

      {user && lookups.length > 0 ? (
        <View style={styles.actions}>
          <Text style={styles.count}>{lookups.length} loaded</Text>
          <Pressable
            accessibilityLabel="Clear lookup history"
            accessibilityRole="button"
            disabled={isClearing || deletingLookupId !== null}
            onPress={onClearPress}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.pressed,
              (isClearing || deletingLookupId !== null) && styles.disabled,
            ]}
          >
            {isClearing ? (
              <ActivityIndicator color={theme.danger} size="small" />
            ) : (
              <Text style={styles.clearButtonText}>Clear all</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {signedOut || showEmpty ? (
        <View style={styles.centerState}>
          <Text style={styles.historyGlyph}>↺</Text>
          <Text style={styles.stateTitle}>
            {signedOut ? 'No lookup history' : 'No completed lookups yet'}
          </Text>
          <Text style={styles.stateText}>
            {signedOut
              ? 'Sign in to save and view lookup history.'
              : 'Completed lookups will appear here.'}
          </Text>
        </View>
      ) : isLoading && lookups.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.accent} />
          <Text style={styles.stateText}>Loading your lookup history...</Text>
        </View>
      ) : error && lookups.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>History is unavailable</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<LookupHistoryItem>
          contentContainerStyle={styles.listContent}
          data={lookups}
          keyExtractor={lookup => lookup.id}
          onEndReached={() => {
            if (hasMore && !isLoadingMore && !isClearing && !deletingLookupId) {
              onEndReached();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }: { item: LookupHistoryItem }) => (
            <View style={styles.historyItem}>
              <Pressable
                accessibilityLabel={`Open lookup for ${item.phoneDisplay}`}
                accessibilityRole="button"
                disabled={isClearing || deletingLookupId !== null}
                onPress={() => onLookupPress(item)}
                style={({ pressed }) => [
                  styles.historyMain,
                  pressed && styles.pressed,
                ]}
              >
                <UtilityIcon
                  name={item.spamReportCount > 0 ? 'warning-outline' : 'call-outline'}
                  size={23}
                />
                <View style={styles.historyCopy}>
                  <Text numberOfLines={1} style={styles.historyName}>
                    {item.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.historyPhone,
                      item.spamReportCount > 0 && styles.spamPhone,
                    ]}
                  >
                    {item.phoneDisplay}
                    {item.spamReportCount
                      ? `  ·  ${item.spamReportCount} spam reports`
                      : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.confidencePill,
                    item.confidenceLabel === 'LOW' && styles.lowConfidencePill,
                  ]}
                >
                  <Text
                    style={[
                      styles.confidenceLabel,
                      item.confidenceLabel === 'LOW' &&
                        styles.lowConfidenceText,
                    ]}
                  >
                    {item.confidenceLabel}
                  </Text>
                  <Text
                    style={[
                      styles.confidenceScore,
                      item.confidenceLabel === 'LOW' &&
                        styles.lowConfidenceText,
                    ]}
                  >
                    {item.confidenceScore}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`Remove lookup for ${item.phoneDisplay}`}
                accessibilityRole="button"
                disabled={isClearing || deletingLookupId !== null}
                hitSlop={8}
                onPress={() => onDeletePress(item)}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.deletePressed,
                  (isClearing || deletingLookupId !== null) && styles.disabled,
                ]}
              >
                {deletingLookupId === item.id ? (
                  <ActivityIndicator color={theme.danger} size="small" />
                ) : (
                  <Ionicons
                    color={theme.danger}
                    name="trash-outline"
                    size={20}
                  />
                )}
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={theme.accent} size="small" />
              </View>
            ) : error ? (
              <View style={styles.footer}>
                <Text style={styles.footerError}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={onRetry}>
                  <Text style={styles.footerRetry}>Try again</Text>
                </Pressable>
              </View>
            ) : !hasMore ? (
              <Text style={styles.endLabel}>You are all caught up.</Text>
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 24 },
    navigation: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 62,
    },
    backButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    navigationSpacer: { width: 44 },
    title: {
      color: theme.text,
      fontFamily: fonts.semibold,
      fontSize: 17,
      letterSpacing: 0.2,
    },
    actions: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    count: {
      color: theme.mutedText,
      fontFamily: fonts.semibold,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    clearButton: {
      alignItems: 'center',
      borderColor: theme.danger,
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 34,
      minWidth: 78,
      paddingHorizontal: 12,
    },
    clearButtonText: {
      color: theme.danger,
      fontFamily: fonts.semibold,
      fontSize: 13,
    },
    listContent: { paddingBottom: 30 },
    historyItem: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      flexDirection: 'row',
      marginBottom: 10,
      minHeight: 82,
    },
    historyMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 80,
      paddingHorizontal: 16,
    },
    historyCopy: { flex: 1, gap: 4 },
    historyName: {
      color: theme.text,
      fontFamily: fonts.semibold,
      fontSize: 15,
    },
    historyPhone: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 13,
    },
    spamPhone: { color: theme.danger },
    confidencePill: {
      alignItems: 'center',
      backgroundColor: theme.highConfidenceSurface,
      borderRadius: radii.pill,
      minWidth: 60,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    lowConfidencePill: { backgroundColor: theme.lowConfidenceSurface },
    confidenceLabel: {
      color: theme.highConfidence,
      fontFamily: fonts.semibold,
      fontSize: 9,
      letterSpacing: 0.7,
    },
    confidenceScore: {
      color: theme.highConfidence,
      fontFamily: fonts.semibold,
      fontSize: 14,
      marginTop: 1,
    },
    lowConfidenceText: { color: theme.lowConfidence },
    deleteButton: {
      alignItems: 'center',
      alignSelf: 'stretch',
      borderLeftColor: theme.surfaceBorder,
      borderLeftWidth: 1,
      justifyContent: 'center',
      width: 52,
    },
    centerState: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    historyGlyph: {
      color: theme.accent,
      fontFamily: fonts.regular,
      fontSize: 42,
      marginBottom: 10,
    },
    stateTitle: {
      color: theme.text,
      fontFamily: fonts.semibold,
      fontSize: 18,
      textAlign: 'center',
    },
    stateText: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      textAlign: 'center',
    },
    retryButton: {
      backgroundColor: theme.accent,
      borderRadius: radii.pill,
      marginTop: 18,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    retryButtonText: {
      color: theme.accentText,
      fontFamily: fonts.semibold,
      fontSize: 14,
    },
    footer: { alignItems: 'center', gap: 8, paddingVertical: 18 },
    footerError: {
      color: theme.danger,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
    },
    footerRetry: { color: theme.accentMuted, fontFamily: fonts.semibold },
    endLabel: {
      color: theme.mutedText,
      fontFamily: fonts.regular,
      fontSize: 13,
      paddingVertical: 18,
      textAlign: 'center',
    },
    pressed: { opacity: 0.7 },
    deletePressed: { backgroundColor: theme.lowConfidenceSurface },
    disabled: { opacity: 0.5 },
  });
