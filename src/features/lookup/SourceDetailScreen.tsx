import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '../../theme/AppTheme';
import { ProviderMark, SourceMark } from '../../components/VisualIdentity';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type {
  CallerCandidate,
  ConfidenceFactorKey,
  EvidenceSource,
  LookupDetail,
} from '../../types/lookup';

type SourceDetailScreenProps = Readonly<{
  lookup: LookupDetail;
  source: EvidenceSource;
  candidate: CallerCandidate;
  onBack: () => void;
  onReport: () => void;
  onMessage: (message: string) => void;
}>;

const factorDetails: ReadonlyArray<
  Readonly<{ key: ConfidenceFactorKey; label: string; maximum: number }>
> = [
  { key: 'BASE_CONFIDENCE', label: 'Base confidence', maximum: 40 },
  { key: 'IDENTITY_ASSOCIATION', label: 'Identity association', maximum: 20 },
  {
    key: 'CROSS_SOURCE_CORROBORATION',
    label: 'Cross-source corroboration',
    maximum: 30,
  },
  { key: 'CALLER_NAME_MATCH', label: 'Caller name match', maximum: 5 },
  { key: 'NUMBER_VALIDATION', label: 'Number validation', maximum: 5 },
];

function formattedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Retrieval date unavailable'
    : `Retrieved ${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
}

export function SourceDetailScreen({
  lookup,
  source,
  candidate,
  onBack,
  onReport,
  onMessage,
}: SourceDetailScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasUrl = Boolean(source.url);
  const sourceLabel =
    source.origin === 'FIRST_PARTY' ? 'FIRST-PARTY WEBSITE' : 'INDEPENDENT';
  const linkedCandidates =
    source.kind === 'IDENTITY'
      ? lookup.result?.candidates ?? []
      : (lookup.result?.candidates ?? []).filter(
          item => item.id === source.candidateId,
        );

  const openSource = async () => {
    if (!source.url) {
      return;
    }
    try {
      await Linking.openURL(source.url);
    } catch {
      onMessage('We could not open this source.');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Back to lookup result"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.navButton}
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.navigationTitle}>Source</Text>
        {hasUrl ? (
          <Pressable
            accessibilityLabel="Open source"
            accessibilityRole="link"
            hitSlop={12}
            onPress={() => void openSource()}
            style={styles.navButton}
          >
            <Ionicons color={theme.bodyText} name="open-outline" size={25} />
          </Pressable>
        ) : (
          <View style={styles.navButton} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sourceHeading}>
          <View style={styles.sourceMarks}>
            <SourceMark size={52} source={source} />
            <ProviderMark size={25} source={source} />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceKind}>{sourceLabel}</Text>
            <Text numberOfLines={2} style={styles.title}>
              {source.title}
            </Text>
            <Text style={styles.description}>{source.description}</Text>
          </View>
          <View style={styles.confidenceBlock}>
            <Text style={styles.confidenceScore}>{candidate.score}</Text>
            <Text style={styles.confidenceLabel}>
              {candidate.confidenceLabel}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            WHY {candidate.score} CONFIDENCE
          </Text>
          <Text style={styles.helperText}>For {candidate.name}</Text>
          <View style={styles.factorList}>
            {factorDetails.map(factor => {
              const value = candidate.confidenceFactors[factor.key];
              const width = `${Math.min(100, (value / factor.maximum) * 100)}%`;
              return (
                <View key={factor.key}>
                  <View style={styles.factorHeader}>
                    <Text style={styles.factorLabel}>{factor.label}</Text>
                    <Text style={styles.factorValue}>
                      {value}/{factor.maximum}
                    </Text>
                  </View>
                  <View
                    accessibilityLabel={`${factor.label}: ${value} of ${factor.maximum}`}
                    accessibilityRole="progressbar"
                    accessibilityValue={{
                      max: factor.maximum,
                      min: 0,
                      now: value,
                    }}
                    style={styles.track}
                  >
                    <View
                      style={[
                        styles.fill,
                        factor.key === 'CROSS_SOURCE_CORROBORATION' &&
                          styles.corroborationFill,
                        { width },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>EVIDENCE</Text>
          <Text style={styles.evidence}>{source.description}</Text>
          {linkedCandidates.length > 1 ? (
            <View style={styles.linkedCandidates}>
              <Text style={styles.linkedCandidatesLabel}>CANDIDATE NAMES</Text>
              {linkedCandidates.map(linkedCandidate => (
                <View key={linkedCandidate.id} style={styles.candidateRow}>
                  <View style={styles.candidateCopy}>
                    <Text style={styles.candidateName}>{linkedCandidate.name}</Text>
                    <Text style={styles.candidateMeta}>
                      {linkedCandidate.kind === 'BUSINESS'
                        ? 'Business'
                        : linkedCandidate.kind === 'PERSON'
                        ? 'Person'
                        : 'Caller'}
                      {linkedCandidate.region
                        ? ` · ${linkedCandidate.region}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.candidateConfidence}>
                    {linkedCandidate.score}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.divider} />
          {hasUrl ? (
            <Pressable
              accessibilityLabel={`Open external source: ${source.title}`}
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => {
                openSource().catch(() => undefined);
              }}
              style={({ pressed }) => pressed && styles.urlPressed}
            >
              <View style={styles.urlRow}>
                <Text numberOfLines={1} selectable style={styles.url}>
                  {source.url}
                </Text>
                <Ionicons color={theme.accent} name="open-outline" size={18} />
              </View>
            </Pressable>
          ) : (
            <Text selectable style={styles.url}>
              {source.domain ?? source.kind}
            </Text>
          )}
          <Text style={styles.metadata}>
            {formattedDate(
              source.retrievedAt || lookup.result?.checkedAt || '',
            )}
          </Text>
          {source.retrievalProvider === 'GOOGLE_GROUNDING' ? (
            <Text style={styles.metadata}>Retrieved with Google Search</Text>
          ) : source.retrievalProvider === 'BRAVE' ? (
            <Text style={styles.metadata}>Retrieved with Brave Search</Text>
          ) : null}
          <Text style={styles.metadata}>Source score {source.score}</Text>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {hasUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void openSource()}
            style={styles.primaryAction}
          >
            <Text style={styles.primaryActionText}>View Source</Text>
            <Ionicons color={theme.accentText} name="open-outline" size={20} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onReport}
          style={styles.reportAction}
        >
          <Text style={styles.reportActionText}>Report this as incorrect</Text>
        </Pressable>
      </View>
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
      paddingHorizontal: 24,
    },
    navButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    navigationTitle: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.55,
    },
    content: {
      gap: 28,
      paddingBottom: 30,
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    sourceHeading: { flexDirection: 'row', gap: 14 },
    sourceMarks: { alignItems: 'center', gap: 6, paddingTop: 1 },
    sourceCopy: { flex: 1 },
    sourceKind: {
      alignSelf: 'flex-start',
      backgroundColor: theme.accentMuted,
      borderRadius: radii.control,
      color: theme.accent,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.1,
      overflow: 'hidden',
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    title: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 28,
      letterSpacing: -1.4,
      lineHeight: 34,
      marginTop: 12,
    },
    description: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.5,
      lineHeight: 20,
      marginTop: 5,
    },
    confidenceBlock: { alignItems: 'flex-end', paddingTop: 39 },
    confidenceScore: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 34,
      letterSpacing: -1.8,
      lineHeight: 38,
    },
    confidenceLabel: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 0.65,
      marginTop: 2,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      padding: 22,
    },
    sectionLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 1.45,
    },
    helperText: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      marginTop: 5,
    },
    factorList: { gap: 17, marginTop: 20 },
    factorHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    factorLabel: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 16,
      letterSpacing: -0.55,
    },
    factorValue: {
      color: theme.mutedText,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    track: {
      backgroundColor: theme.divider,
      borderRadius: radii.pill,
      height: 12,
      marginTop: 8,
      overflow: 'hidden',
    },
    fill: {
      backgroundColor: theme.highConfidence,
      borderRadius: radii.pill,
      height: '100%',
    },
    corroborationFill: { backgroundColor: theme.accent },
    evidence: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 18,
      letterSpacing: -0.65,
      lineHeight: 25,
      marginTop: 17,
    },
    linkedCandidates: { gap: 12, marginTop: 22 },
    linkedCandidatesLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.15,
    },
    candidateRow: {
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: radii.control,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 54,
      paddingHorizontal: 14,
    },
    candidateCopy: { flex: 1, paddingRight: 12 },
    candidateName: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.5,
    },
    candidateMeta: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      marginTop: 2,
    },
    candidateConfidence: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.7,
    },
    divider: { backgroundColor: theme.divider, height: 1, marginVertical: 20 },
    url: {
      color: theme.accent,
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: 0.15,
    },
    urlPressed: { opacity: 0.64 },
    urlRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    metadata: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      marginTop: 12,
    },
    actions: {
      backgroundColor: theme.background,
      gap: 10,
      paddingBottom: 28,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    primaryAction: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: radii.control,
      flexDirection: 'row',
      gap: 9,
      height: 52,
      justifyContent: 'center',
    },
    primaryActionText: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 17,
      letterSpacing: -0.8,
    },
    reportAction: {
      alignItems: 'center',
      borderColor: theme.surfaceBorder,
      borderRadius: radii.control,
      borderWidth: 1.5,
      height: 52,
      justifyContent: 'center',
    },
    reportActionText: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.65,
    },
  });
