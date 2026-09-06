import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandOwl } from '../../components/BrandOwl';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type { LookupDetail, LookupStageKey } from '../../types/lookup';

const stages: ReadonlyArray<Readonly<{ key: LookupStageKey; title: string }>> =
  [
    { key: 'validation', title: 'Number validated' },
    { key: 'identity', title: 'Identity databases' },
    { key: 'web', title: 'Google web evidence' },
    { key: 'reputation', title: 'Google spam reports' },
    { key: 'confidence', title: 'Scoring confidence' },
  ];

const stageIcons: Readonly<
  Record<LookupStageKey, React.ComponentProps<typeof Ionicons>['name']>
> = {
  validation: 'call-outline',
  identity: 'finger-print-outline',
  web: 'globe-outline',
  reputation: 'shield-checkmark-outline',
  confidence: 'sparkles-outline',
};

type LookupProgressScreenProps = Readonly<{
  lookup: LookupDetail | null;
  phoneDisplay: string;
  onCancel: () => void;
}>;

export function LookupProgressScreen({
  lookup,
  phoneDisplay,
  onCancel,
}: LookupProgressScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const completed = stages.filter(
    stage => lookup?.stages[stage.key]?.status === 'COMPLETE',
  ).length;
  const active = stages.find(
    stage => lookup?.stages[stage.key]?.status === 'RUNNING',
  )?.key;

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Cancel lookup"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onCancel}
          style={styles.backButton}
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.navigationTitle}>SEARCHING</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <BrandOwl framed={false} size={122} />
        <Text style={styles.phone}>{lookup?.phoneDisplay ?? phoneDisplay}</Text>
        <Text style={styles.subtitle}>Checking independent sources…</Text>
      </View>

      <View style={styles.stageList}>
        {stages.map((stage, index) => {
          const value = lookup?.stages[stage.key];
          const stageStatus = value?.status ?? 'PENDING';
          const isActive = active === stage.key;
          const isComplete = stageStatus === 'COMPLETE';
          const isFailed = stageStatus === 'FAILED';
          const isPending =
            stageStatus === 'PENDING' || stageStatus === 'SKIPPED';

          return (
            <View
              key={stage.key}
              style={[
                styles.stage,
                isActive && styles.stageActive,
                isPending && styles.stagePending,
              ]}
            >
              <View
                style={[
                  styles.stageIcon,
                  isComplete && styles.stageIconComplete,
                  isActive && styles.stageIconActive,
                  isFailed && styles.stageIconFailed,
                ]}
              >
                {isComplete ? (
                  <Ionicons
                    color={theme.highConfidence}
                    name="checkmark"
                    size={16}
                  />
                ) : isFailed ? (
                  <Ionicons color={theme.danger} name="alert" size={14} />
                ) : isActive ? (
                  <Ionicons
                    color={theme.accent}
                    name="ellipsis-horizontal"
                    size={16}
                  />
                ) : (
                  <Ionicons
                    color={theme.mutedText}
                    name={stageIcons[stage.key]}
                    size={16}
                  />
                )}
              </View>
              <View style={styles.stageCopy}>
                <Text
                  style={[
                    styles.stageTitle,
                    isPending && styles.stageTitlePending,
                  ]}
                >
                  {stage.title}
                </Text>
                {!isPending ? (
                  <Text style={styles.stageDetail}>{value?.detail}</Text>
                ) : null}
                {isActive ? (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        index === 2
                          ? styles.progressFillEvidence
                          : styles.progressFillStandard,
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.footer}>
        {completed === stages.length
          ? 'Your result is ready.'
          : "Usually under 8 seconds. Partial results are shown if a source doesn't answer."}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.background,
      flex: 1,
      paddingHorizontal: 24,
    },
    navigation: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 60,
      justifyContent: 'space-between',
    },
    backButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    navigationTitle: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 16,
      letterSpacing: 1,
    },
    cancelText: {
      color: theme.mutedText,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    pressed: { opacity: 0.68 },
    hero: { alignItems: 'center', marginTop: 20 },
    phone: {
      color: theme.text,
      fontFamily: fonts.medium,
      fontSize: 28,
      letterSpacing: -1.25,
      marginTop: 22,
    },
    subtitle: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.45,
      marginTop: 10,
    },
    stageList: { gap: 12, marginTop: 36 },
    stage: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: 'transparent',
      borderRadius: radii.card,
      borderWidth: 2,
      flexDirection: 'row',
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    stageActive: { borderColor: theme.accent },
    stagePending: { opacity: 0.5 },
    stageIcon: {
      alignItems: 'center',
      borderColor: theme.surfaceBorder,
      borderRadius: 15,
      borderWidth: 1.5,
      height: 30,
      justifyContent: 'center',
      marginRight: 14,
      width: 30,
    },
    stageIconComplete: {
      backgroundColor: theme.highConfidenceSurface,
      borderColor: theme.highConfidenceSurface,
    },
    stageIconActive: { borderColor: theme.accent },
    stageIconFailed: { borderColor: theme.danger },
    stageCopy: { flex: 1 },
    stageTitle: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.7,
    },
    stageTitlePending: { color: theme.mutedText },
    stageDetail: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: -0.4,
      lineHeight: 18,
      marginTop: 2,
    },
    progressTrack: {
      backgroundColor: theme.surfaceBorder,
      borderRadius: 999,
      height: 5,
      marginTop: 10,
      overflow: 'hidden',
      width: '100%',
    },
    progressFill: {
      backgroundColor: theme.accent,
      borderRadius: 999,
      height: '100%',
    },
    progressFillEvidence: { width: '64%' },
    progressFillStandard: { width: '38%' },
    footer: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: -0.45,
      lineHeight: 20,
      marginHorizontal: 24,
      marginTop: 'auto',
      paddingBottom: 28,
      textAlign: 'center',
    },
  });
