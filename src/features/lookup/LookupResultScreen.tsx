import Clipboard from '@react-native-clipboard/clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '../../theme/AppTheme';
import {
  CarrierMark,
  ProviderMark,
  SourceMark,
  UtilityIcon,
} from '../../components/VisualIdentity';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import type {
  CommunitySummary,
  EvidenceSource,
  LookupDetail,
} from '../../types/lookup';
import { phoneLineTypeLabel } from './phoneLineTypeLabel';
import {
  spamReportCategoryLabels,
  type CommunityReportSummary,
} from './communityReports';
import { spamRiskFor } from './spamRisk';
import { GoogleSearchAttribution } from './GoogleSearchAttribution';

type LookupResultScreenProps = Readonly<{
  lookup: LookupDetail;
  selectedCandidateId: string | null;
  summary: CommunitySummary;
  reportSummary: CommunityReportSummary;
  hasOwnReport: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onCandidates: () => void;
  onReport: () => void;
  onDeleteReport: () => void;
  onComments: () => void;
  onCorrectData: () => void;
  onSource: (source: EvidenceSource) => void;
  onMessage: (message: string) => void;
}>;

function labelForKind(kind: string): string {
  if (kind === 'BUSINESS') {
    return 'Business';
  }
  if (kind === 'PERSON') {
    return 'Person';
  }
  return 'Caller';
}

export function LookupResultScreen({
  lookup,
  selectedCandidateId,
  summary,
  reportSummary,
  hasOwnReport,
  onBack,
  onRefresh,
  onCandidates,
  onReport,
  onDeleteReport,
  onComments,
  onCorrectData,
  onSource,
  onMessage,
}: LookupResultScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [menuOpen, setMenuOpen] = useState(false);
  const result = lookup.result;
  const candidate =
    result?.candidates.find(item => item.id === selectedCandidateId) ??
    result?.candidates.find(item => item.id === result.primaryCandidateId) ??
    result?.candidates[0] ??
    null;
  const sources =
    result?.sources.filter(
      source => !source.candidateId || source.candidateId === candidate?.id,
    ) ?? [];
  const spamSources = result?.spamSources ?? [];
  const webAttribution =
    result?.searchAttributions.find(item => item.stage === 'web') ?? null;
  const reputationAttribution =
    result?.searchAttributions.find(item => item.stage === 'reputation') ??
    null;
  const reputationUsesGoogle = Boolean(
    reputationAttribution ||
      spamSources.some(
        source => source.retrievalProvider === 'GOOGLE_GROUNDING',
      ),
  );
  const spamRisk = spamRiskFor(spamSources.length, reportSummary.total);
  const spamRiskTone =
    spamRisk.score >= 60
      ? 'high'
      : spamRisk.score >= 20
      ? 'caution'
      : 'neutral';
  const hasCommunityReports = reportSummary.total > 0;

  const copyNumber = async () => {
    await Clipboard.setString(result?.phoneDisplay ?? lookup.phoneDisplay);
    setMenuOpen(false);
    onMessage('Phone number copied.');
  };

  const shareResult = async () => {
    try {
      await Share.share({
        message: `Whoo Called lookup for ${
          result?.phoneDisplay ?? lookup.phoneDisplay
        }`,
      });
    } finally {
      setMenuOpen(false);
    }
  };

  const openSource = async (source: EvidenceSource) => {
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
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.navigationTitle}>
          {result?.phoneDisplay ?? lookup.phoneDisplay}
        </Text>
        <Pressable
          accessibilityLabel="Lookup actions"
          accessibilityRole="button"
          onPress={() => setMenuOpen(true)}
          style={styles.menuButton}
        >
          <Ionicons
            color={theme.bodyText}
            name="ellipsis-horizontal"
            size={24}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.callerCard}>
          <View style={styles.callerHeader}>
            <View style={styles.callerCopy}>
              <Text style={styles.eyebrow}>LIKELY CALLER</Text>
              <Text numberOfLines={2} style={styles.name}>
                {candidate?.name ?? 'Unknown caller'}
              </Text>
              <Text style={styles.kind}>
                {candidate
                  ? labelForKind(candidate.kind)
                  : 'No matching identity'}
              </Text>
            </View>
            <View style={styles.confidenceBlock}>
              <Text style={styles.confidenceScore}>
                {candidate?.score ?? 0}
              </Text>
              <Text style={styles.confidenceLabel}>
                {candidate?.confidenceLabel ?? 'LOW'}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailsGrid}>
            <Detail
              icon="cellular-outline"
              label="Network / provider"
              leading={<CarrierMark carrier={result?.carrier} size={16} />}
              value={result?.carrier ?? 'Unavailable'}
            />
            <Detail
              icon="phone-portrait-outline"
              label="Line type"
              value={phoneLineTypeLabel(result?.lineType)}
            />
            <Detail
              icon="location-outline"
              label="Region"
              value={candidate?.region ?? result?.region ?? 'Unavailable'}
            />
            <Detail
              icon="time-outline"
              label="Last checked"
              value={
                result?.checkedAt
                  ? new Date(result.checkedAt).toLocaleDateString()
                  : 'Just now'
              }
            />
          </View>
        </View>

        {result?.isPartial ? (
          <Text style={styles.partialNotice}>
            Some sources did not answer. These are the available results.
          </Text>
        ) : null}

        <View style={styles.sourcesHeader}>
          <Text style={styles.sourcesTitle}>
            PUBLIC WEB REPORTS · {spamSources.length}
          </Text>
          <Text style={styles.sourcesHint}>Exact-number matches</Text>
        </View>
        <View style={styles.sourcesList}>
          {spamSources.map(source => (
            <View key={source.id} style={styles.sourceCard}>
              <View style={styles.sourceIdentity}>
                <SourceMark source={source} />
                <View style={styles.sourceTitleCopy}>
                  <Text numberOfLines={1} style={styles.sourceTitle}>
                    {source.title}
                  </Text>
                  <View style={styles.sourceMarks}>
                    <ProviderMark size={20} source={source} />
                    <Text numberOfLines={1} style={styles.sourceKindLabel}>
                      {source.retrievalProvider === 'GOOGLE_GROUNDING'
                        ? 'Google Search'
                        : source.domain ?? 'Public web source'}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={styles.sourceDescription}>{source.description}</Text>
              <View style={styles.sourceBottomRow}>
                <Text numberOfLines={1} style={styles.sourceDomain}>
                  {source.domain ?? 'Public web source'}
                </Text>
                {source.url ? (
                  <Pressable
                    accessibilityLabel={`Open public spam report: ${source.title}`}
                    accessibilityRole="link"
                    hitSlop={8}
                    onPress={() => {
                      openSource(source).catch(() => undefined);
                    }}
                    style={({ pressed }) => pressed && styles.sourceLinkPressed}
                  >
                    <View style={styles.sourceLink}>
                      <Text style={styles.viewSource}>OPEN</Text>
                      <Ionicons
                        color={theme.accent}
                        name="open-outline"
                        size={15}
                      />
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {!spamSources.length ? (
            <View style={styles.emptySources}>
              <Text style={styles.emptySourcesTitle}>
                No verified public reports found
              </Text>
              <Text style={styles.emptySourcesBody}>
                {reputationUsesGoogle
                  ? 'Google did not return a page Whoo Called could verify for this exact number. This does not mean the caller is safe.'
                  : 'No public reports were available for this exact number. This does not mean the caller is safe.'}
              </Text>
            </View>
          ) : null}
        </View>
        <GoogleSearchAttribution
          attribution={reputationAttribution}
          onMessage={onMessage}
        />

        <View
          style={[
            styles.spamRiskCard,
            spamRiskTone === 'high'
              ? styles.spamRiskCardHigh
              : spamRiskTone === 'caution'
              ? styles.spamRiskCardCaution
              : styles.spamRiskCardNeutral,
          ]}
        >
          <View style={styles.spamRiskHeader}>
            <View>
              <Text
                style={[
                  styles.spamRiskTitle,
                  spamRiskTone === 'high'
                    ? styles.spamRiskTextHigh
                    : spamRiskTone === 'caution'
                    ? styles.spamRiskTextCaution
                    : styles.spamRiskTextNeutral,
                ]}
              >
                SPAM RISK
              </Text>
              <Text
                style={[
                  styles.spamRiskLabel,
                  spamRiskTone === 'high'
                    ? styles.spamRiskTextHigh
                    : spamRiskTone === 'caution'
                    ? styles.spamRiskTextCaution
                    : styles.spamRiskTextNeutral,
                ]}
              >
                {spamRisk.label}
              </Text>
            </View>
            <Text
              style={[
                styles.spamRiskScore,
                spamRiskTone === 'high'
                  ? styles.spamRiskTextHigh
                  : spamRiskTone === 'caution'
                  ? styles.spamRiskTextCaution
                  : styles.spamRiskTextNeutral,
              ]}
            >
              {spamRisk.score}
            </Text>
          </View>
          <Text style={styles.spamRiskEvidence}>
            {spamRisk.publicSourceCount} public web{' '}
            {spamRisk.publicSourceCount === 1 ? 'source' : 'sources'} ·{' '}
            {spamRisk.communityReportCount} community{' '}
            {spamRisk.communityReportCount === 1 ? 'report' : 'reports'}
          </Text>
          <Text style={styles.spamRiskDisclaimer}>
            Public-web and community signals do not prove a caller's identity or
            safety.
          </Text>
        </View>

        <View
          style={[
            styles.communityCard,
            hasCommunityReports
              ? styles.communityCardReported
              : styles.communityCardEmpty,
          ]}
        >
          <View style={styles.communityHeader}>
            <Text
              style={[
                styles.communityTitle,
                hasCommunityReports
                  ? styles.communityTextReported
                  : styles.communityTextEmpty,
              ]}
            >
              COMMUNITY REPORTS
            </Text>
            <Text
              style={[
                styles.communityCount,
                hasCommunityReports
                  ? styles.communityTextReported
                  : styles.communityTextEmpty,
              ]}
            >
              {reportSummary.total}{' '}
              {reportSummary.total === 1 ? 'report' : 'reports'}
            </Text>
          </View>
          {reportSummary.total ? (
            <View style={styles.communityBreakdown}>
              {Object.entries(reportSummary.counts)
                .filter(([, count]) => count > 0)
                .map(([category, count]) => (
                  <View key={category} style={styles.communityRow}>
                    <Text style={styles.communityCategory}>
                      {
                        spamReportCategoryLabels[
                          category as keyof typeof spamReportCategoryLabels
                        ]
                      }
                    </Text>
                    <Text style={styles.communityCategoryCount}>{count}</Text>
                  </View>
                ))}
            </View>
          ) : (
            <Text style={styles.communityEmpty}>No community reports yet.</Text>
          )}
          <Text style={styles.communityDisclaimer}>
            Community-generated information, not verified by Whoo Called.
          </Text>
        </View>

        <View style={styles.sourcesHeader}>
          <Text style={styles.sourcesTitle}>SOURCES · {sources.length}</Text>
          <Text style={styles.sourcesHint}>Ranked by confidence</Text>
        </View>

        <View style={styles.sourcesList}>
          {sources.map(source => (
            <View key={source.id} style={styles.sourceCard}>
              <View style={styles.sourceTopRow}>
                <View style={styles.sourceIdentity}>
                  <SourceMark source={source} />
                  <View style={styles.sourceTitleCopy}>
                    <Text numberOfLines={1} style={styles.sourceTitle}>
                      {source.title}
                    </Text>
                    <View style={styles.sourceMarks}>
                      <ProviderMark size={20} source={source} />
                      <Text numberOfLines={1} style={styles.sourceKindLabel}>
                        {source.retrievalProvider === 'GOOGLE_GROUNDING'
                          ? `Google Search · ${source.domain ?? source.kind}`
                          : source.domain ?? source.kind}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.sourceScore}>{source.score}</Text>
              </View>
              <Text style={styles.sourceDescription}>{source.description}</Text>
              <View style={styles.sourceBottomRow}>
                <Text numberOfLines={1} style={styles.sourceDomain}>
                  {source.domain ?? source.kind}
                </Text>
                {source.url ? (
                  <Pressable
                    accessibilityLabel={`Open external source: ${source.title}`}
                    accessibilityRole="link"
                    hitSlop={8}
                    onPress={() => {
                      openSource(source).catch(() => undefined);
                    }}
                    style={({ pressed }) => pressed && styles.sourceLinkPressed}
                  >
                    <View style={styles.sourceLink}>
                      <Text style={styles.viewSource}>OPEN</Text>
                      <Ionicons
                        color={theme.accent}
                        name="open-outline"
                        size={15}
                      />
                    </View>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel={`View details for ${source.title}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onSource(source)}
                  style={({ pressed }) => pressed && styles.sourceLinkPressed}
                >
                  <Text style={styles.viewSource}>DETAILS ›</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!sources.length ? (
            <View style={styles.emptySources}>
              <Text style={styles.emptySourcesTitle}>
                No supporting sources yet
              </Text>
              <Text style={styles.emptySourcesBody}>
                Refresh later to check again.
              </Text>
            </View>
          ) : null}
        </View>
        <GoogleSearchAttribution
          attribution={webAttribution}
          onMessage={onMessage}
        />

        {result && result.candidates.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCandidates}
            style={styles.candidatesButton}
          >
            <Text style={styles.candidatesText}>
              {result.candidates.length - 1} other possible{' '}
              {result.candidates.length - 1 === 1 ? 'match' : 'matches'}
            </Text>
            <Ionicons
              color={theme.mutedText}
              name="chevron-forward"
              size={22}
            />
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={hasOwnReport ? onDeleteReport : onReport}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>
            {hasOwnReport ? 'Delete report' : 'Report'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onComments}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>
            Comments · {summary.commentCount}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={styles.refreshAction}
        >
          <Text style={styles.refreshActionText}>Refresh</Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={menuOpen}
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable onPress={() => setMenuOpen(false)} style={styles.menuScrim}>
          <Pressable style={styles.menuSheet}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void copyNumber()}
              style={styles.menuRow}
            >
              <Ionicons color={theme.text} name="copy-outline" size={21} />
              <Text style={styles.menuLabel}>Copy number</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void shareResult()}
              style={styles.menuRow}
            >
              <Ionicons color={theme.text} name="share-outline" size={21} />
              <Text style={styles.menuLabel}>Share lookup</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                onCorrectData();
              }}
              style={styles.menuRow}
            >
              <Ionicons color={theme.text} name="create-outline" size={21} />
              <Text style={styles.menuLabel}>Correct or remove data</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Detail({
  icon,
  label,
  leading,
  value,
}: Readonly<{
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  leading?: React.ReactNode;
  value: string;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeading}>
        {leading ?? <UtilityIcon name={icon} size={16} />}
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text numberOfLines={2} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { backgroundColor: theme.background, flex: 1 },
    navigation: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 56,
      justifyContent: 'space-between',
      paddingHorizontal: 24,
    },
    backButton: {
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
    menuButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    content: { paddingBottom: 86, paddingHorizontal: 20, paddingTop: 4 },
    callerCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      paddingBottom: 12,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    callerHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    callerCopy: { flex: 1, paddingRight: 12 },
    eyebrow: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.3,
    },
    name: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 26,
      letterSpacing: -1.4,
      lineHeight: 31,
      marginTop: 6,
    },
    kind: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 16,
      letterSpacing: -0.55,
      marginTop: 3,
    },
    confidenceBlock: { alignItems: 'flex-end' },
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
      letterSpacing: 0.7,
      marginTop: 1,
    },
    divider: { backgroundColor: theme.divider, height: 1, marginTop: 14 },
    detailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 13,
      rowGap: 8,
    },
    detail: { width: '50%' },
    detailHeading: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    detailLabel: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      letterSpacing: -0.4,
    },
    detailValue: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.6,
      marginTop: 2,
    },
    partialNotice: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 10,
      textAlign: 'center',
    },
    spamRiskCard: {
      backgroundColor: theme.lowConfidenceSurface,
      borderRadius: radii.card,
      borderWidth: 1.5,
      marginTop: 18,
      padding: 16,
    },
    spamRiskCardHigh: {
      backgroundColor: theme.lowConfidenceSurface,
      borderColor: theme.danger,
    },
    spamRiskCardCaution: {
      backgroundColor: theme.surface,
      borderColor: theme.accent,
    },
    spamRiskCardNeutral: {
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
    },
    spamRiskHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    spamRiskTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 1.2,
    },
    spamRiskLabel: {
      fontFamily: fonts.extraBold,
      fontSize: 17,
      letterSpacing: -0.6,
      marginTop: 5,
    },
    spamRiskScore: {
      fontFamily: fonts.extraBold,
      fontSize: 36,
      letterSpacing: -2.1,
    },
    spamRiskEvidence: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: -0.45,
      marginTop: 10,
    },
    spamRiskDisclaimer: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 5,
    },
    spamRiskTextHigh: { color: theme.danger },
    spamRiskTextCaution: { color: theme.accentMuted },
    spamRiskTextNeutral: { color: theme.mutedText },
    communityCard: {
      borderRadius: radii.card,
      borderWidth: 1,
      marginTop: 12,
      padding: 16,
    },
    communityCardReported: {
      backgroundColor: theme.lowConfidenceSurface,
      borderColor: theme.lowConfidence,
    },
    communityCardEmpty: {
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
    },
    communityHeader: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    communityTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 1.15,
    },
    communityCount: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      letterSpacing: -0.5,
    },
    communityTextReported: { color: theme.lowConfidence },
    communityTextEmpty: { color: theme.mutedText },
    communityBreakdown: { gap: 6, marginTop: 10 },
    communityRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    communityCategory: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 14,
    },
    communityCategoryCount: {
      color: theme.bodyText,
      fontFamily: fonts.extraBold,
      fontSize: 16,
    },
    communityEmpty: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      marginTop: 10,
    },
    communityDisclaimer: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
    },
    sourcesHeader: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginHorizontal: 8,
      marginTop: 20,
    },
    sourcesTitle: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 1.2,
    },
    sourcesHint: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      letterSpacing: -0.4,
    },
    sourcesList: { gap: 8, marginTop: 10 },
    sourceCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    sourceLink: { alignItems: 'center', flexDirection: 'row', gap: 5 },
    sourceLinkPressed: { opacity: 0.64 },
    sourceTopRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sourceIdentity: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      minWidth: 0,
    },
    sourceTitleCopy: { flex: 1, minWidth: 0 },
    sourceTitle: {
      color: theme.text,
      flex: 1,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.9,
      paddingRight: 12,
    },
    sourceMarks: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
      marginTop: 3,
    },
    sourceKindLabel: {
      color: theme.mutedText,
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    sourceScore: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 18,
    },
    sourceDescription: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.45,
      lineHeight: 20,
      marginTop: 7,
    },
    sourceBottomRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 'auto',
      paddingTop: 8,
    },
    sourceDomain: {
      color: theme.mutedText,
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: 0.2,
    },
    viewSource: {
      color: theme.accent,
      fontFamily: fonts.extraBold,
      fontSize: 14,
    },
    emptySources: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      padding: 20,
    },
    emptySourcesTitle: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 17,
    },
    emptySourcesBody: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      marginTop: 4,
    },
    candidatesButton: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: radii.control,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 28,
      minHeight: 52,
      paddingHorizontal: 18,
    },
    candidatesText: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 17,
      letterSpacing: -0.65,
    },
    actions: {
      backgroundColor: theme.background,
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 28,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    secondaryAction: {
      alignItems: 'center',
      borderColor: theme.surfaceBorder,
      borderRadius: radii.control,
      borderWidth: 1.5,
      flex: 1,
      height: 52,
      justifyContent: 'center',
    },
    secondaryActionText: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 15,
      letterSpacing: -0.5,
    },
    refreshAction: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: radii.control,
      flex: 0.85,
      height: 52,
      justifyContent: 'center',
    },
    refreshActionText: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 17,
      letterSpacing: -0.7,
    },
    menuScrim: {
      backgroundColor: 'rgba(0,0,0,0.46)',
      flex: 1,
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingBottom: 36,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    menuRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      minHeight: 58,
    },
    menuLabel: { color: theme.text, fontFamily: fonts.bold, fontSize: 17 },
  });
