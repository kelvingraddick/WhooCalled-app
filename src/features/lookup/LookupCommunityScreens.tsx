import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppTheme } from '../../theme/AppTheme';
import { UtilityIcon } from '../../components/VisualIdentity';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import { spamReportCategories } from '../../types/lookup';
import type {
  CallerCandidate,
  CommunitySubmission,
  CommunitySubmissionTag,
  CommunityTag,
  LookupDetail,
  SpamReportCategory,
} from '../../types/lookup';
import { spamReportCategoryLabels } from './communityReports';

const tags: CommunityTag[] = [
  'SPAM',
  'SCAM',
  'WRONG_IDENTITY',
  'LEGITIMATE_BUSINESS',
  'OTHER',
];

function tagLabel(value: CommunitySubmissionTag): string {
  return value
    .replace(/_/g, ' ')
    .toLocaleLowerCase()
    .replace(/\b\w/g, letter => letter.toLocaleUpperCase());
}

function reportIcon(category: SpamReportCategory): React.ComponentProps<typeof Ionicons>['name'] {
  if (category === 'SCAM_FRAUD') return 'shield-outline';
  if (category === 'TELEMARKETING') return 'megaphone-outline';
  if (category === 'ROBOCALL') return 'hardware-chip-outline';
  if (category === 'DEBT_COLLECTION') return 'cash-outline';
  if (category === 'POLITICAL') return 'flag-outline';
  if (category === 'SURVEY') return 'clipboard-outline';
  if (category === 'SPAM') return 'warning-outline';
  return 'ellipsis-horizontal-circle-outline';
}

function relativeTime(value: string | null): string {
  if (!value) {
    return 'Just now';
  }
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) {
    return 'Just now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays === 1 ? 'Yesterday' : `${elapsedDays}d ago`;
}

function ScreenHeader({
  title,
  onBack,
}: Readonly<{ title: string; onBack: () => void }>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
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
      <Text style={styles.navigationTitle}>{title}</Text>
      <View style={styles.backButton} />
    </View>
  );
}

export function CandidateMatchesScreen({
  lookup,
  selectedCandidateId,
  onBack,
  onSelect,
}: Readonly<{
  lookup: LookupDetail;
  selectedCandidateId: string | null;
  onBack: () => void;
  onSelect: (candidate: CallerCandidate) => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const candidates = lookup.result?.candidates ?? [];

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={onBack} title="Possible matches" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Possible callers</Text>
        <Text style={styles.description}>
          Each match has its own supporting evidence and confidence score.
        </Text>
        <View style={styles.list}>
          {candidates.map(candidate => (
            <Pressable
              accessibilityRole="button"
              key={candidate.id}
              onPress={() => onSelect(candidate)}
              style={({ pressed }) => [
                styles.candidateCard,
                candidate.id === selectedCandidateId &&
                  styles.candidateSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.candidateCopy}>
                <Text style={styles.candidateName}>{candidate.name}</Text>
                <Text style={styles.candidateMeta}>
                  {candidate.kind.toLocaleLowerCase()} ·{' '}
                  {candidate.region ?? 'Region unavailable'}
                </Text>
              </View>
              <View style={styles.candidateScore}>
                <Text style={styles.candidateScoreValue}>
                  {candidate.score}
                </Text>
                <Text style={styles.candidateScoreLabel}>
                  {candidate.confidenceLabel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

type ReportScreenProps = Readonly<{
  isSubmitting: boolean;
  message: string | null;
  onBack: () => void;
  onSubmit: (tag: SpamReportCategory, note: string) => void;
}>;

export function ReportScreen({
  isSubmitting,
  message,
  onBack,
  onSubmit,
}: ReportScreenProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedCategory, setSelectedCategory] =
    useState<SpamReportCategory>('SPAM');
  const [note, setNote] = useState('');

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={onBack} title="Report caller" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Report this caller</Text>
        <Text style={styles.description}>
          Choose the category that best describes the call. Reports are
          community-generated and should be factual.
        </Text>
        <Text style={styles.sectionLabel}>REPORT TYPE</Text>
        <View style={styles.reportCategoryList}>
          {spamReportCategories.map(category => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedCategory === category }}
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={({ pressed }) => [
                styles.reportCategory,
                selectedCategory === category && styles.reportCategorySelected,
                pressed && styles.pressed,
              ]}
            >
              <UtilityIcon name={reportIcon(category)} size={20} />
              <Text
                style={[
                  styles.reportCategoryText,
                  selectedCategory === category &&
                    styles.reportCategoryTextSelected,
                ]}
              >
                {spamReportCategoryLabels[category]}
              </Text>
              {selectedCategory === category ? (
                <Ionicons color={theme.accentText} name="checkmark" size={20} />
              ) : null}
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionLabel}>DETAIL (OPTIONAL)</Text>
        <TextInput
          accessibilityLabel="Report detail"
          maxLength={500}
          multiline
          onChangeText={setNote}
          placeholder="Add helpful context"
          placeholderTextColor={theme.mutedText}
          selectionColor={theme.accent}
          style={styles.noteInput}
          textAlignVertical="top"
          value={note}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => onSubmit(selectedCategory, note)}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isSubmitting) && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Sending…' : 'Submit report'}
          </Text>
        </Pressable>
        <Text style={styles.reportPrivacyNote}>
          Your identity stays private. Reports are shown as aggregate counts.
        </Text>
      </ScrollView>
    </View>
  );
}

export function CommentsScreen({
  ownSubmissionIds,
  submissions,
  isSubmitting,
  message,
  onBack,
  onDelete,
  onSubmit,
}: Readonly<{
  ownSubmissionIds: string[];
  submissions: CommunitySubmission[];
  isSubmitting: boolean;
  message: string | null;
  onBack: () => void;
  onDelete: (submissionId: string) => void;
  onSubmit: (tag: CommunityTag, note: string) => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [tag, setTag] = useState<CommunityTag>('SPAM');
  const [note, setNote] = useState('');
  const comments = submissions.filter(
    submission => submission.kind === 'COMMENT',
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={onBack} title="Comments" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Community comments</Text>
        <Text style={styles.description}>
          Posts appear immediately. Share only your own calling experience.
        </Text>
        <View style={styles.list}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentCard}>
              <View style={styles.commentTopRow}>
                <View>
                  <Text style={styles.commentName}>{comment.displayName}</Text>
                  <Text style={styles.commentMeta}>
                    {tagLabel(comment.tag)} · {relativeTime(comment.createdAt)}
                  </Text>
                </View>
                {ownSubmissionIds.includes(comment.id) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onDelete(comment.id)}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.commentBody}>{comment.note}</Text>
            </View>
          ))}
          {!comments.length ? (
            <Text style={styles.emptyText}>
              No comments yet. Be the first to share a factual experience.
            </Text>
          ) : null}
        </View>
        <Text style={styles.sectionLabel}>YOUR COMMENT</Text>
        <View style={styles.tagList}>
          {tags.map(value => (
            <Pressable
              key={value}
              onPress={() => setTag(value)}
              style={[styles.tag, tag === value && styles.tagSelected]}
            >
              <Text
                style={[
                  styles.tagText,
                  tag === value && styles.tagTextSelected,
                ]}
              >
                {tagLabel(value)}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="New comment"
          maxLength={500}
          multiline
          onChangeText={setNote}
          placeholder="Share what happened"
          placeholderTextColor={theme.mutedText}
          selectionColor={theme.accent}
          style={styles.noteInput}
          textAlignVertical="top"
          value={note}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || !note.trim()}
          onPress={() => onSubmit(tag, note)}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isSubmitting || !note.trim()) && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Sending…' : 'Post comment'}
          </Text>
        </Pressable>
      </ScrollView>
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
    content: { paddingBottom: 32, paddingHorizontal: 24, paddingTop: 6 },
    heading: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 26,
      letterSpacing: -1.15,
    },
    description: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.45,
      lineHeight: 21,
      marginTop: 7,
    },
    list: { gap: 10, marginTop: 22 },
    candidateCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: 'transparent',
      borderRadius: radii.card,
      borderWidth: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 92,
      padding: 18,
    },
    candidateSelected: { borderColor: theme.accent },
    candidateCopy: { flex: 1, paddingRight: 12 },
    candidateName: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 18,
      letterSpacing: -0.75,
    },
    candidateMeta: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      marginTop: 5,
    },
    candidateScore: { alignItems: 'flex-end' },
    candidateScoreValue: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 26,
      letterSpacing: -1.2,
    },
    candidateScoreLabel: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.45,
    },
    sectionLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.2,
      marginTop: 26,
    },
    tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    tag: {
      borderColor: theme.surfaceBorder,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tagSelected: { backgroundColor: theme.accent, borderColor: theme.accent },
    tagText: { color: theme.bodyText, fontFamily: fonts.bold, fontSize: 12 },
    tagTextSelected: { color: theme.accentText },
    reportCategoryList: { gap: 8, marginTop: 10 },
    reportCategory: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: 'transparent',
      borderRadius: radii.control,
      borderWidth: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: 16,
    },
    reportCategorySelected: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    reportCategoryText: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 16,
      letterSpacing: -0.45,
    },
    reportCategoryTextSelected: { color: theme.accentText },
    noteInput: {
      backgroundColor: theme.surface,
      borderColor: theme.surfaceBorder,
      borderRadius: radii.card,
      borderWidth: 1,
      color: theme.text,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 10,
      minHeight: 116,
      padding: 16,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: radii.control,
      height: 52,
      justifyContent: 'center',
      marginTop: 18,
    },
    primaryButtonText: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 16,
    },
    message: {
      color: theme.danger,
      fontFamily: fonts.medium,
      fontSize: 14,
      marginTop: 14,
      textAlign: 'center',
    },
    reportPrivacyNote: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      marginHorizontal: 18,
      marginTop: 14,
      textAlign: 'center',
    },
    pressed: { opacity: 0.66 },
    commentCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      padding: 18,
    },
    commentTopRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    commentName: { color: theme.text, fontFamily: fonts.bold, fontSize: 15 },
    commentMeta: {
      color: theme.highConfidence,
      fontFamily: fonts.extraBold,
      fontSize: 11,
      marginTop: 2,
    },
    commentBody: {
      color: theme.bodyText,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 12,
    },
    deleteText: { color: theme.danger, fontFamily: fonts.bold, fontSize: 13 },
    emptyText: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
  });
