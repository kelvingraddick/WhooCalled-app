import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import DeviceInfo from 'react-native-device-info';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  configureAnalyticsConsent,
  logSafeAnalyticsEvent,
} from './src/analytics/analytics';
import { ActivationScreen } from './src/features/activation/ActivationScreen';
import { LookupHistoryScreen } from './src/features/history/LookupHistoryScreen';
import { HomeScreen } from './src/features/home/HomeScreen';
import {
  CandidateMatchesScreen,
  CommentsScreen,
  ReportScreen,
} from './src/features/lookup/LookupCommunityScreens';
import { LookupProgressScreen } from './src/features/lookup/LookupProgressScreen';
import { summarizeCommunityReports } from './src/features/lookup/communityReports';
import { LookupResultScreen } from './src/features/lookup/LookupResultScreen';
import { SourceDetailScreen } from './src/features/lookup/SourceDetailScreen';
import {
  DataRequestScreen,
  ProfileScreen,
  PurchaseScreen,
  SupportScreen,
} from './src/features/settings/SettingsDetailScreens';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { getPublicReleaseConfig } from './src/config/releaseConfig';
import { formatDebugDiagnostics } from './src/services/debugDiagnostics';
import {
  useAppPreferences,
  AppPreferencesProvider,
} from './src/preferences/AppPreferences';
import { authGateway, type AppUser } from './src/services/authGateway';
import {
  getLookupHistoryPage,
  observeRecentLookups,
} from './src/services/lookupHistoryRepository';
import {
  observeCommunity,
  observeCommunitySummary,
  observeOwnCommunitySubmissionIds,
} from './src/services/lookupCommunityRepository';
import { communityGateway } from './src/services/communityGateway';
import { lookupGateway } from './src/services/lookupGateway';
import { observeLookup } from './src/services/lookupRepository';
import {
  revenueCatGateway,
  type RevenueCatPackage,
} from './src/services/revenueCatGateway';
import {
  settingsGateway,
  type SettingsSnapshot,
} from './src/services/settingsGateway';
import { AppThemeProvider, useAppTheme } from './src/theme/AppTheme';
import type {
  CommunitySubmission,
  CommunitySummary,
  CommunityTag,
  LookupDetail,
  LookupHistoryItem,
  LookupRequestState,
  PendingLookup,
  SpamReportCategory,
} from './src/types/lookup';
import { formatUsPhoneInput, isValidUsPhoneInput } from './src/utils/phone';

type Screen =
  | 'home'
  | 'lookup-history'
  | 'activation'
  | 'settings'
  | 'profile'
  | 'purchase'
  | 'support'
  | 'data-request'
  | 'lookup-progress'
  | 'lookup-result'
  | 'source-detail'
  | 'candidate-matches'
  | 'lookup-report'
  | 'lookup-comments';

function AppContent() {
  const theme = useAppTheme();
  const {
    preferences,
    setAppearance,
    setConfirmBeforeSpending,
    setDetectClipboardNumbers,
  } = useAppPreferences();
  const [screen, setScreen] = useState<Screen>('home');
  const [activationReturn, setActivationReturn] =
    useState<Exclude<Screen, 'activation'>>('home');
  const [user, setUser] = useState<AppUser | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [pendingLookup, setPendingLookup] = useState<PendingLookup | null>(
    null,
  );
  const [lookupState, setLookupState] = useState<LookupRequestState>({
    kind: 'idle',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentLookups, setRecentLookups] = useState<LookupHistoryItem[]>([]);
  const [historyLookups, setHistoryLookups] = useState<LookupHistoryItem[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyDeletingLookupId, setHistoryDeletingLookupId] = useState<
    string | null
  >(null);
  const [isHistoryClearing, setIsHistoryClearing] = useState(false);
  const [historyReturn, setHistoryReturn] = useState<'home' | 'settings'>(
    'home',
  );
  const [lookupResultReturn, setLookupResultReturn] = useState<
    'home' | 'lookup-history'
  >('home');
  const historyCursor = useRef<unknown | null>(null);
  const historyLoading = useRef(false);
  const historyOwnerUid = useRef<string | null>(null);
  const [activeLookupId, setActiveLookupId] = useState<string | null>(null);
  const [activeLookup, setActiveLookup] = useState<LookupDetail | null>(null);
  const [lookupObserverKey, setLookupObserverKey] = useState(0);
  const [lookupOpenError, setLookupOpenError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [reportReturn, setReportReturn] = useState<
    'lookup-result' | 'source-detail'
  >('lookup-result');
  const [communitySummary, setCommunitySummary] = useState<CommunitySummary>({
    reportCount: 0,
    commentCount: 0,
  });
  const [communitySubmissions, setCommunitySubmissions] = useState<
    CommunitySubmission[]
  >([]);
  const [ownCommunitySubmissionIds, setOwnCommunitySubmissionIds] = useState<
    string[]
  >([]);
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);
  const [isCommunitySubmitting, setIsCommunitySubmitting] = useState(false);
  const communityReportSummary = useMemo(
    () => summarizeCommunityReports(communitySubmissions),
    [communitySubmissions],
  );
  const ownReport = useMemo(
    () =>
      communitySubmissions.find(
        submission =>
          submission.kind === 'REPORT' &&
          ownCommunitySubmissionIds.includes(submission.id),
      ) ?? null,
    [communitySubmissions, ownCommunitySubmissionIds],
  );
  const [dataRequestReturn, setDataRequestReturn] = useState<
    'settings' | 'lookup-result'
  >('settings');
  const [dataRequestPhoneInput, setDataRequestPhoneInput] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(
    null,
  );
  const [settingsSnapshot, setSettingsSnapshot] =
    useState<SettingsSnapshot | null>(null);
  const profileProvider =
    settingsSnapshot?.account.provider ?? user?.provider ?? 'unknown';
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isDebugActionLoading, setIsDebugActionLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [isDetailSaving, setIsDetailSaving] = useState(false);
  const [purchasePackages, setPurchasePackages] = useState<RevenueCatPackage[]>(
    [],
  );
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(false);
  const offeredClipboardNumber = useRef<string | null>(null);
  const didCheckInitialHomeClipboard = useRef(false);

  useEffect(() => {
    configureAnalyticsConsent(false).catch(() => undefined);
    return authGateway.observe(setUser);
  }, []);

  useEffect(() => {
    historyOwnerUid.current = user?.uid ?? null;
    if (!user) {
      setRecentLookups([]);
      historyCursor.current = null;
      setHistoryLookups([]);
      setHistoryHasMore(false);
      setHistoryError(null);
      return undefined;
    }

    return observeRecentLookups(user.uid, setRecentLookups, () =>
      setRecentLookups([]),
    );
  }, [user]);

  const loadLookupHistoryPage = useCallback(
    async (reset: boolean) => {
      if (!user || historyLoading.current || (!reset && !historyHasMore)) {
        return;
      }

      const uid = user.uid;
      const cursor = reset ? null : historyCursor.current;
      historyLoading.current = true;
      setHistoryError(null);
      if (reset) {
        setIsHistoryLoading(true);
      } else {
        setIsHistoryLoadingMore(true);
      }

      try {
        const page = await getLookupHistoryPage(uid, cursor);
        if (historyOwnerUid.current !== uid) {
          return;
        }

        setHistoryLookups(current =>
          reset
            ? page.lookups
            : [
                ...current,
                ...page.lookups.filter(
                  lookup =>
                    !current.some(existing => existing.id === lookup.id),
                ),
              ],
        );
        historyCursor.current = page.cursor;
        setHistoryHasMore(page.hasMore);
      } catch {
        if (historyOwnerUid.current === uid) {
          setHistoryError('We could not load your lookup history.');
        }
      } finally {
        historyLoading.current = false;
        if (historyOwnerUid.current === uid) {
          setIsHistoryLoading(false);
          setIsHistoryLoadingMore(false);
        }
      }
    },
    [historyHasMore, user],
  );

  const openLookupHistory = (returnTo: 'home' | 'settings') => {
    historyOwnerUid.current = user?.uid ?? null;
    setHistoryReturn(returnTo);
    setHistoryLookups([]);
    historyCursor.current = null;
    setHistoryHasMore(Boolean(user));
    setHistoryError(null);
    setScreen('lookup-history');
    void loadLookupHistoryPage(true);
  };

  useEffect(() => {
    if (!user || !activeLookupId) {
      setActiveLookup(null);
      return undefined;
    }

    return observeLookup(
      user.uid,
      activeLookupId,
      lookup => {
        setActiveLookup(lookup);
        if (lookup) {
          setLookupOpenError(null);
        }
        if (!lookup) {
          setLookupOpenError('This lookup is no longer available.');
          return;
        }
        if (lookup.status === 'COMPLETE') {
          void settingsGateway
            .getSettingsSnapshot()
            .then(setSettingsSnapshot)
            .catch(() => undefined);
          setScreen(current =>
            current === 'lookup-progress' ? 'lookup-result' : current,
          );
        }
        if (lookup.status === 'FAILED') {
          setLookupState({
            kind: 'message',
            tone: 'error',
            message:
              lookup.errorMessage ??
              'We could not complete that lookup. Your credit was not used.',
          });
          setScreen(current =>
            current === 'lookup-progress' ? 'home' : current,
          );
        }
      },
      () => {
        setLookupOpenError(
          'We could not receive this lookup. Check your connection and try again.',
        );
      },
    );
  }, [activeLookupId, lookupObserverKey, user]);

  useEffect(() => {
    if (screen !== 'lookup-result' || activeLookup || !activeLookupId) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setLookupOpenError(
        'This lookup is taking longer than expected. Please try again.',
      );
    }, 12000);
    return () => clearTimeout(timeout);
  }, [activeLookup, activeLookupId, lookupObserverKey, screen]);

  useEffect(() => {
    if (!user || !activeLookup?.numberKey) {
      setCommunitySummary({ reportCount: 0, commentCount: 0 });
      setCommunitySubmissions([]);
      setOwnCommunitySubmissionIds([]);
      return undefined;
    }

    const stopCommunity = observeCommunity(
      activeLookup.numberKey,
      setCommunitySubmissions,
      () => setCommunitySubmissions([]),
    );
    const stopSummary = observeCommunitySummary(
      activeLookup.numberKey,
      setCommunitySummary,
      () => setCommunitySummary({ reportCount: 0, commentCount: 0 }),
    );
    const stopOwnSubmissions = observeOwnCommunitySubmissionIds(
      user.uid,
      setOwnCommunitySubmissionIds,
      () => setOwnCommunitySubmissionIds([]),
    );
    return () => {
      stopCommunity();
      stopSummary();
      stopOwnSubmissions();
    };
  }, [activeLookup?.numberKey, user]);

  const refreshSettings = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setSettingsSnapshot(null);
      return false;
    }

    setIsSettingsLoading(true);
    try {
      setSettingsSnapshot(await settingsGateway.getSettingsSnapshot());
      return true;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : null;
      if (code === 'unauthenticated' || code === 'UNAUTHENTICATED') {
        setSettingsSnapshot(null);
        setSettingsMessage(null);
        try {
          await Promise.all([
            authGateway.signOut(),
            revenueCatGateway.signOut(),
          ]);
          setScreen('home');
        } catch {
          setSettingsMessage(
            'We could not securely end the expired sign-in session.',
          );
        }
        return false;
      }

      setSettingsMessage('We could not refresh your account settings.');
      return false;
    } finally {
      setIsSettingsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSettingsSnapshot(null);
      void revenueCatGateway.signOut().catch(() => undefined);
      return;
    }

    void revenueCatGateway.configure(user.uid).catch(() => undefined);
    void refreshSettings();
  }, [refreshSettings, user]);

  const submitLookup = useCallback(async (lookup: PendingLookup) => {
    setLookupState({ kind: 'loading' });

    try {
      const result = await lookupGateway.requestInitialLookup(lookup);
      setSettingsSnapshot(current =>
        current ? { ...current, balance: result.balance } : current,
      );
      if (
        result.lookupId &&
        (result.status === 'ACCEPTED' || result.status === 'COMPLETE')
      ) {
        setActiveLookup(null);
        setActiveLookupId(result.lookupId);
        setSelectedCandidateId(null);
        setLookupState({ kind: 'idle' });
        setScreen('lookup-progress');
        return;
      }

      setLookupState({
        kind: 'message',
        tone: result.status === 'PROVIDER_NOT_CONFIGURED' ? 'neutral' : 'error',
        message:
          result.status === 'PROVIDER_NOT_CONFIGURED'
            ? 'Lookups are not available yet. No credit was used.'
            : result.message,
      });
    } catch {
      setLookupState({
        kind: 'message',
        tone: 'error',
        message: 'We could not start that lookup. Your credit was not used.',
      });
    }
  }, []);

  const submitRefresh = useCallback(async () => {
    if (!activeLookup || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setLookupState({ kind: 'loading' });
    try {
      const result = await lookupGateway.requestRefresh(activeLookup);
      setSettingsSnapshot(current =>
        current ? { ...current, balance: result.balance } : current,
      );
      if (
        result.lookupId &&
        (result.status === 'ACCEPTED' || result.status === 'COMPLETE')
      ) {
        setActiveLookup(null);
        setActiveLookupId(result.lookupId);
        setSelectedCandidateId(null);
        setLookupState({ kind: 'idle' });
        setScreen('lookup-progress');
        return;
      }
      setLookupState({
        kind: 'message',
        tone: 'error',
        message: result.message,
      });
      Alert.alert('Unable to refresh', result.message);
    } catch {
      const message = 'We could not start a refresh. Your credit was not used.';
      setLookupState({ kind: 'message', tone: 'error', message });
      Alert.alert('Unable to refresh', message);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeLookup, isRefreshing]);

  const beginRefresh = useCallback(() => {
    if (!activeLookup) {
      return;
    }
    if (!preferences.confirmBeforeSpending) {
      void submitRefresh();
      return;
    }

    Alert.alert(
      'Use 1 lookup?',
      'Refresh checks this number again and uses one remaining lookup.',
      [
        { style: 'cancel', text: 'Not now' },
        {
          onPress: () => void submitRefresh(),
          style: 'default',
          text: 'Refresh',
        },
      ],
    );
  }, [activeLookup, preferences.confirmBeforeSpending, submitRefresh]);

  const submitConfirmedLookup = useCallback(
    (lookup: PendingLookup) => {
      if (!preferences.confirmBeforeSpending) {
        void submitLookup(lookup);
        return;
      }

      Alert.alert(
        'Use 1 lookup?',
        'This will use one of your remaining lookups. You can change this in Settings.',
        [
          { style: 'cancel', text: 'Not now' },
          {
            onPress: () => void submitLookup(lookup),
            style: 'default',
            text: 'Use lookup',
          },
        ],
      );
    },
    [preferences.confirmBeforeSpending, submitLookup],
  );

  const beginLookupFor = useCallback(
    (candidate: string) => {
      if (!isValidUsPhoneInput(candidate)) {
        setLookupState({
          kind: 'message',
          tone: 'error',
          message: 'Enter a valid 10-digit US phone number to continue.',
        });
        return;
      }

      const lookup: PendingLookup = {
        phoneInput: candidate,
        countryHint: 'US',
      };
      setLookupResultReturn('home');

      if (user) {
        submitConfirmedLookup(lookup);
        return;
      }

      setPendingLookup(lookup);
      setActivationMessage(null);
      setActivationReturn('home');
      setScreen('activation');
      void logSafeAnalyticsEvent('authentication_started', { surface: 'home' });
    },
    [submitConfirmedLookup, user],
  );

  const beginLookup = useCallback(
    () => beginLookupFor(phoneInput),
    [beginLookupFor, phoneInput],
  );

  const openSavedLookup = useCallback(
    (lookupId: string, returnTo: 'home' | 'lookup-history') => {
      setActiveLookup(null);
      setLookupOpenError(null);
      setActiveLookupId(lookupId);
      // Reopening the same item does not change lookupId, so restart its listener.
      setLookupObserverKey(current => current + 1);
      setSelectedCandidateId(null);
      setLookupResultReturn(returnTo);
      setScreen('lookup-result');
    },
    [],
  );

  const signIn = async (provider: 'apple' | 'google') => {
    setActivationMessage(null);
    setIsSigningIn(true);

    try {
      const signedInUser =
        provider === 'apple'
          ? await authGateway.signInWithApple()
          : await authGateway.signInWithGoogle();

      if (!signedInUser) {
        return;
      }

      setUser(signedInUser);
      setScreen(activationReturn);
      if (pendingLookup) {
        submitConfirmedLookup(pendingLookup);
        setPendingLookup(null);
      }
    } catch (error) {
      setActivationMessage(
        error instanceof Error
          ? error.message
          : 'We could not complete sign-in. Please try again.',
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (!preferences.detectClipboardNumbers || screen !== 'home') {
      return undefined;
    }

    const checkClipboard = async () => {
      try {
        const formatted = formatUsPhoneInput(await Clipboard.getString());
        if (
          !isValidUsPhoneInput(formatted) ||
          formatted === phoneInput ||
          offeredClipboardNumber.current === formatted
        ) {
          return;
        }

        offeredClipboardNumber.current = formatted;
        Alert.alert('Number copied', `Look up ${formatted}?`, [
          { style: 'cancel', text: 'Not now' },
          {
            onPress: () => {
              setPhoneInput(formatted);
              beginLookupFor(formatted);
            },
            text: 'Look up',
          },
        ]);
      } catch {
        // Clipboard reads are best effort and must never block the app.
      }
    };

    if (!didCheckInitialHomeClipboard.current) {
      didCheckInitialHomeClipboard.current = true;
      void checkClipboard();
    }

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && screen === 'home') {
        void checkClipboard();
      }
    });
    return () => subscription.remove();
  }, [beginLookupFor, phoneInput, preferences.detectClipboardNumbers, screen]);

  const openAccount = (
    destination: Exclude<Screen, 'activation'> = 'profile',
  ) => {
    if (user) {
      setDetailMessage(null);
      setScreen(destination);
      return;
    }

    setActivationReturn(destination);
    setActivationMessage(null);
    setScreen('activation');
  };

  const openPurchase = async () => {
    if (!user) {
      openAccount('purchase');
      return;
    }

    setDetailMessage(null);
    setScreen('purchase');
    setIsPurchaseLoading(true);
    try {
      const configured = await revenueCatGateway.configure(user.uid);
      if (!configured) {
        setDetailMessage('Purchases are not configured for this build yet.');
        return;
      }

      setPurchasePackages(await revenueCatGateway.getCurrentOffering());
    } catch {
      setDetailMessage(
        'We could not load the store catalog. Please try again.',
      );
    } finally {
      setIsPurchaseLoading(false);
    }
  };

  const openSubscriptionManagement = async () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?package=com.wavelinkllc.whoocalled';
    try {
      await Linking.openURL(url);
    } catch {
      setSettingsMessage('We could not open your subscription settings.');
    }
  };

  const openLegal = async (document: 'guidelines' | 'privacy' | 'terms') => {
    const url = getPublicReleaseConfig().legalUrls[document];
    if (!url) {
      setSettingsMessage('This document is not configured in this build yet.');
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      setSettingsMessage('We could not open this document.');
    }
  };

  const handleSignOut = async () => {
    try {
      await Promise.all([authGateway.signOut(), revenueCatGateway.signOut()]);
      setSettingsMessage(null);
      setActiveLookupId(null);
      setSelectedCandidateId(null);
      setScreen('home');
    } catch {
      setSettingsMessage('We could not sign you out. Please try again.');
    }
  };

  const submitCommunity = useCallback(
    async (
      kind: 'REPORT' | 'COMMENT',
      tag: CommunityTag | SpamReportCategory,
      note: string,
    ) => {
      if (!activeLookup) {
        return;
      }
      setIsCommunitySubmitting(true);
      setCommunityMessage(null);
      try {
        await communityGateway.submit({
          lookupId: activeLookup.id,
          kind,
          tag,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        setCommunityMessage(
          kind === 'REPORT'
            ? 'Your report was posted.'
            : 'Your comment was posted.',
        );
        void logSafeAnalyticsEvent(
          kind === 'REPORT' ? 'spam_reported' : 'comment_added',
        ).catch(() => undefined);
        if (kind === 'REPORT') {
          setScreen(reportReturn);
        }
      } catch {
        setCommunityMessage(
          'We could not post that contribution. Please try again.',
        );
      } finally {
        setIsCommunitySubmitting(false);
      }
    },
    [activeLookup, reportReturn],
  );

  const deleteCommunity = useCallback(async (submissionId: string) => {
    setIsCommunitySubmitting(true);
    setCommunityMessage(null);
    try {
      await communityGateway.delete(submissionId);
    } catch {
      setCommunityMessage('We could not delete that contribution.');
    } finally {
      setIsCommunitySubmitting(false);
    }
  }, []);

  const confirmDeleteReport = useCallback(() => {
    if (!ownReport) {
      return;
    }
    Alert.alert(
      'Delete report?',
      'You can submit a new report after deleting this one.',
      [
        { style: 'cancel', text: 'Keep report' },
        {
          style: 'destructive',
          text: 'Delete report',
          onPress: () => void deleteCommunity(ownReport.id),
        },
      ],
    );
  }, [deleteCommunity, ownReport]);

  const handleDeleteAccount = () => {
    if (!user) {
      return;
    }

    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, tickets, lookups and community contributions. This cannot be undone.',
      [
        { style: 'cancel', text: 'Keep account' },
        {
          style: 'destructive',
          text: 'Delete account',
          onPress: () => {
            void (async () => {
              try {
                const reauthenticated = await authGateway.reauthenticate(
                  user.provider,
                );
                if (!reauthenticated) {
                  setSettingsMessage('Account deletion was cancelled.');
                  return;
                }

                await settingsGateway.deleteAccount();
                await revenueCatGateway.signOut();
                setScreen('home');
              } catch {
                setSettingsMessage(
                  'We could not delete your account. Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const resetMonthlyLookupsForTesting = async () => {
    setIsDebugActionLoading(true);
    setSettingsMessage(null);
    try {
      setSettingsSnapshot(await settingsGateway.debugResetMonthlyLookups());
      setSettingsMessage('Monthly lookups reset for testing.');
    } catch {
      setSettingsMessage('We could not reset monthly lookups.');
    } finally {
      setIsDebugActionLoading(false);
    }
  };

  const handleDebugResetMonthlyLookups = () => {
    Alert.alert(
      'Reset monthly lookups?',
      'This restores consumed monthly lookups for this account. Active lookup holds, purchased credits and subscription details stay unchanged.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Reset lookups',
          onPress: resetMonthlyLookupsForTesting,
        },
      ],
    );
  };

  const clearLookupHistoryForTesting = async () => {
    setIsDebugActionLoading(true);
    setSettingsMessage(null);
    try {
      const { deletedCount } =
        await settingsGateway.debugClearCompletedLookupHistory();
      setRecentLookups([]);

      try {
        setSettingsSnapshot(await settingsGateway.getSettingsSnapshot());
        setSettingsMessage(
          `${deletedCount} completed lookup${
            deletedCount === 1 ? '' : 's'
          } erased for testing.`,
        );
      } catch {
        setSettingsMessage(
          `${deletedCount} completed lookup${
            deletedCount === 1 ? '' : 's'
          } erased. Account state will refresh next time.`,
        );
      }
    } catch {
      setSettingsMessage('We could not erase lookup history.');
    } finally {
      setIsDebugActionLoading(false);
    }
  };

  const handleDebugClearLookupHistory = () => {
    Alert.alert(
      'Erase lookup history?',
      'This permanently erases your completed lookup history. Active lookups and community contributions stay unchanged.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Erase history',
          onPress: clearLookupHistoryForTesting,
        },
      ],
    );
  };

  const handleDebugRefresh = async () => {
    setSettingsMessage(null);
    if (await refreshSettings()) {
      setSettingsMessage('Account state refreshed.');
    }
  };

  const handleHistoryDelete = (lookup: LookupHistoryItem) => {
    if (!user || historyDeletingLookupId || isHistoryClearing) {
      return;
    }

    Alert.alert(
      'Remove lookup?',
      `Remove ${lookup.phoneDisplay} from your lookup history? This cannot be undone.`,
      [
        { style: 'cancel', text: 'Keep lookup' },
        {
          style: 'destructive',
          text: 'Remove',
          onPress: () => {
            void (async () => {
              setHistoryDeletingLookupId(lookup.id);
              setHistoryError(null);
              try {
                await settingsGateway.deleteLookupHistoryItem(lookup.id);
                await loadLookupHistoryPage(true);
              } catch {
                setHistoryError('We could not remove this lookup.');
              } finally {
                setHistoryDeletingLookupId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleHistoryClear = () => {
    if (!user || historyDeletingLookupId || isHistoryClearing) {
      return;
    }

    Alert.alert(
      'Clear lookup history?',
      'This permanently removes every completed lookup from your history. This cannot be undone.',
      [
        { style: 'cancel', text: 'Keep history' },
        {
          style: 'destructive',
          text: 'Clear all',
          onPress: () => {
            void (async () => {
              setIsHistoryClearing(true);
              setHistoryError(null);
              try {
                await settingsGateway.clearLookupHistory();
                historyCursor.current = null;
                setHistoryLookups([]);
                setHistoryHasMore(false);
              } catch {
                setHistoryError('We could not clear your lookup history.');
              } finally {
                setIsHistoryClearing(false);
              }
            })();
          },
        },
      ],
    );
  };

  const handleDebugCopyDiagnostics = () => {
    if (!user || !settingsSnapshot) {
      return;
    }

    Clipboard.setString(
      formatDebugDiagnostics({
        balance: settingsSnapshot.balance,
        buildNumber: DeviceInfo.getBuildNumber(),
        platform: Platform.OS,
        uid: user.uid,
        version: DeviceInfo.getVersion(),
      }),
    );
    setSettingsMessage('Diagnostics copied.');
  };

  return (
    <>
      <StatusBar barStyle={theme.statusBarStyle} />
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <View style={styles.screen}>
          {screen === 'home' ? (
            <HomeScreen
              balance={settingsSnapshot?.balance ?? null}
              lookupState={lookupState}
              onLookupFlowOpen={() =>
                void logSafeAnalyticsEvent('lookup_flow_opened', {
                  surface: 'home',
                })
              }
              onLookupPress={beginLookup}
              onHistoryPress={() => openLookupHistory('home')}
              onMoreLookupsPress={() => void openPurchase()}
              onMenuPress={() => {
                setSettingsMessage(null);
                setScreen('settings');
                void refreshSettings();
              }}
              onRecentLookupPress={lookup => {
                openSavedLookup(lookup.id, 'home');
              }}
              onPhoneInputChange={value => {
                setPhoneInput(value);
                if (lookupState.kind === 'message') {
                  setLookupState({ kind: 'idle' });
                }
              }}
              phoneInput={phoneInput}
              recentLookups={recentLookups}
              user={user}
            />
          ) : null}
          {screen === 'lookup-history' ? (
            <LookupHistoryScreen
              deletingLookupId={historyDeletingLookupId}
              error={historyError}
              hasMore={historyHasMore}
              isClearing={isHistoryClearing}
              isLoading={isHistoryLoading}
              isLoadingMore={isHistoryLoadingMore}
              lookups={historyLookups}
              onBack={() => setScreen(historyReturn)}
              onClearPress={handleHistoryClear}
              onDeletePress={handleHistoryDelete}
              onEndReached={() => void loadLookupHistoryPage(false)}
              onLookupPress={lookup => {
                openSavedLookup(lookup.id, 'lookup-history');
              }}
              onRetry={() =>
                void loadLookupHistoryPage(historyLookups.length === 0)
              }
              user={user}
            />
          ) : null}
          {screen === 'activation' ? (
            <ActivationScreen
              isSigningIn={isSigningIn}
              message={activationMessage}
              onClose={() => {
                setActivationMessage(null);
                setScreen(activationReturn);
              }}
              onSignInWithApple={() => void signIn('apple')}
              onSignInWithGoogle={() => void signIn('google')}
            />
          ) : null}
          {screen === 'settings' ? (
            <SettingsScreen
              appearance={preferences.appearance}
              confirmBeforeSpending={preferences.confirmBeforeSpending}
              detectClipboardNumbers={preferences.detectClipboardNumbers}
              isLoading={isSettingsLoading}
              message={settingsMessage}
              key={user?.uid ?? 'signed-out'}
              onAccountPress={() => openAccount(user ? 'profile' : 'settings')}
              onAppearanceChange={setAppearance}
              onBack={() => setScreen('home')}
              onBuyLookupsPress={() => void openPurchase()}
              onConfirmBeforeSpendingChange={setConfirmBeforeSpending}
              onDataRequestPress={() => {
                setDataRequestReturn('settings');
                setDataRequestPhoneInput('');
                openAccount('data-request');
              }}
              isDebugActionLoading={isDebugActionLoading}
              onDeleteAccount={handleDeleteAccount}
              onDebugClearLookupHistory={handleDebugClearLookupHistory}
              onDebugCopyDiagnostics={handleDebugCopyDiagnostics}
              onDebugRefresh={handleDebugRefresh}
              onDebugResetMonthlyLookups={handleDebugResetMonthlyLookups}
              onDetectClipboardChange={setDetectClipboardNumbers}
              onLegalPress={document => void openLegal(document)}
              onLookupHistoryPress={() => openLookupHistory('settings')}
              onManageSubscriptionPress={() =>
                void openSubscriptionManagement()
              }
              onSignOut={() => void handleSignOut()}
              onSupportPress={() => openAccount('support')}
              snapshot={settingsSnapshot}
              user={user}
            />
          ) : null}
          {screen === 'profile' && user ? (
            <ProfileScreen
              displayName={
                settingsSnapshot?.account.displayName ?? user.displayName ?? ''
              }
              email={settingsSnapshot?.account.email ?? user.email}
              isSaving={isDetailSaving}
              message={detailMessage}
              onBack={() => setScreen('settings')}
              onSave={displayName => {
                void (async () => {
                  setIsDetailSaving(true);
                  setDetailMessage(null);
                  try {
                    setSettingsSnapshot(
                      await settingsGateway.updateDisplayName(displayName),
                    );
                    setDetailMessage('Your display name was updated.');
                  } catch {
                    setDetailMessage('We could not save that display name.');
                  } finally {
                    setIsDetailSaving(false);
                  }
                })();
              }}
              provider={
                profileProvider === 'apple'
                  ? 'Apple'
                  : profileProvider === 'google'
                  ? 'Google'
                  : 'Unknown'
              }
            />
          ) : null}
          {screen === 'purchase' ? (
            <PurchaseScreen
              currentPlanName={
                settingsSnapshot?.balance.planName ?? 'Free plan'
              }
              hasPaidSubscription={Boolean(
                settingsSnapshot?.balance.subscriptionExpiresAt,
              )}
              isLoading={isPurchaseLoading}
              message={detailMessage}
              onBack={() => setScreen('settings')}
              onBuy={value => {
                void (async () => {
                  setIsPurchaseLoading(true);
                  setDetailMessage(null);
                  try {
                    await revenueCatGateway.purchase(value);
                    await refreshSettings();
                    setDetailMessage(
                      'Purchase complete. Your balance is updating.',
                    );
                  } catch {
                    setDetailMessage(
                      'The purchase did not complete. No credit was added.',
                    );
                  } finally {
                    setIsPurchaseLoading(false);
                  }
                })();
              }}
              onRestore={() => {
                void (async () => {
                  setIsPurchaseLoading(true);
                  setDetailMessage(null);
                  try {
                    await revenueCatGateway.restore();
                    await refreshSettings();
                    setDetailMessage('Your purchases were restored.');
                  } catch {
                    setDetailMessage(
                      'We could not restore purchases right now.',
                    );
                  } finally {
                    setIsPurchaseLoading(false);
                  }
                })();
              }}
              packages={purchasePackages}
            />
          ) : null}
          {screen === 'support' ? (
            <SupportScreen
              isSubmitting={isDetailSaving}
              message={detailMessage}
              onBack={() => setScreen('settings')}
              onSubmit={(subject, message) => {
                void (async () => {
                  setIsDetailSaving(true);
                  setDetailMessage(null);
                  try {
                    await settingsGateway.submitSupportTicket({
                      message,
                      subject,
                    });
                    setDetailMessage('Thanks. Your support request was sent.');
                  } catch {
                    setDetailMessage('We could not send your support request.');
                  } finally {
                    setIsDetailSaving(false);
                  }
                })();
              }}
            />
          ) : null}
          {screen === 'data-request' ? (
            <DataRequestScreen
              initialPhoneInput={dataRequestPhoneInput}
              isSubmitting={isDetailSaving}
              message={detailMessage}
              onBack={() => setScreen(dataRequestReturn)}
              onSubmit={(requestType, dataPhoneInput, details) => {
                void (async () => {
                  setIsDetailSaving(true);
                  setDetailMessage(null);
                  try {
                    await settingsGateway.submitDataRequest({
                      details,
                      phoneInput: dataPhoneInput,
                      requestType,
                    });
                    setDetailMessage('Thanks. Your data request was sent.');
                  } catch {
                    setDetailMessage('We could not send your data request.');
                  } finally {
                    setIsDetailSaving(false);
                  }
                })();
              }}
            />
          ) : null}
          {screen === 'lookup-progress' ? (
            <LookupProgressScreen
              lookup={activeLookup}
              onCancel={() => setScreen(lookupResultReturn)}
              phoneDisplay={activeLookup?.phoneDisplay ?? phoneInput}
            />
          ) : null}
          {screen === 'lookup-result' && !activeLookup ? (
            <View style={styles.resultLoading}>
              {lookupOpenError ? null : (
                <ActivityIndicator color={theme.accent} />
              )}
              <Text
                style={[styles.resultLoadingText, { color: theme.bodyText }]}
              >
                {lookupOpenError ?? 'Opening lookup...'}
              </Text>
              {lookupOpenError ? (
                <Pressable
                  accessibilityLabel="Retry opening lookup"
                  accessibilityRole="button"
                  onPress={() => {
                    setLookupOpenError(null);
                    setLookupObserverKey(current => current + 1);
                  }}
                  style={({ pressed }) => [
                    styles.resultLoadingBack,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.resultLoadingBackText,
                      { color: theme.accentMuted },
                    ]}
                  >
                    Try again
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Back"
                accessibilityRole="button"
                onPress={() => setScreen(lookupResultReturn)}
                style={({ pressed }) => [
                  styles.resultLoadingBack,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.resultLoadingBackText,
                    { color: theme.accentMuted },
                  ]}
                >
                  Back
                </Text>
              </Pressable>
            </View>
          ) : null}
          {screen === 'lookup-result' && activeLookup ? (
            <LookupResultScreen
              lookup={activeLookup}
              onBack={() => setScreen(lookupResultReturn)}
              onCandidates={() => setScreen('candidate-matches')}
              onComments={() => {
                setCommunityMessage(null);
                setScreen('lookup-comments');
              }}
              onCorrectData={() => {
                setDataRequestReturn('lookup-result');
                setDataRequestPhoneInput(activeLookup.phoneDisplay);
                setDetailMessage(null);
                setScreen('data-request');
              }}
              onDeleteReport={confirmDeleteReport}
              onMessage={message => Alert.alert('Whoo Called', message)}
              onSource={source => {
                setSelectedSourceId(source.id);
                setScreen('source-detail');
              }}
              onRefresh={beginRefresh}
              onReport={() => {
                setCommunityMessage(null);
                setReportReturn('lookup-result');
                setScreen('lookup-report');
              }}
              hasOwnReport={Boolean(ownReport)}
              isRefreshing={isRefreshing}
              reportSummary={communityReportSummary}
              selectedCandidateId={selectedCandidateId}
              summary={communitySummary}
            />
          ) : null}
          {screen === 'source-detail' && activeLookup
            ? (() => {
                const result = activeLookup.result;
                const candidate =
                  result?.candidates.find(
                    item => item.id === selectedCandidateId,
                  ) ??
                  result?.candidates.find(
                    item => item.id === result.primaryCandidateId,
                  ) ??
                  result?.candidates[0];
                const source = result?.sources.find(
                  item => item.id === selectedSourceId,
                );
                return source && candidate ? (
                  <SourceDetailScreen
                    candidate={candidate}
                    lookup={activeLookup}
                    onBack={() => setScreen('lookup-result')}
                    onMessage={message => Alert.alert('Whoo Called', message)}
                    onReport={() => {
                      setCommunityMessage(null);
                      setReportReturn('source-detail');
                      setScreen('lookup-report');
                    }}
                    source={source}
                  />
                ) : null;
              })()
            : null}
          {screen === 'candidate-matches' && activeLookup ? (
            <CandidateMatchesScreen
              lookup={activeLookup}
              onBack={() => setScreen('lookup-result')}
              onSelect={candidate => {
                setSelectedCandidateId(candidate.id);
                setScreen('lookup-result');
              }}
              selectedCandidateId={selectedCandidateId}
            />
          ) : null}
          {screen === 'lookup-report' && activeLookup ? (
            <ReportScreen
              isSubmitting={isCommunitySubmitting}
              message={communityMessage}
              onBack={() => setScreen(reportReturn)}
              onSubmit={(tag, note) =>
                void submitCommunity('REPORT', tag, note)
              }
            />
          ) : null}
          {screen === 'lookup-comments' && activeLookup && user ? (
            <CommentsScreen
              isSubmitting={isCommunitySubmitting}
              message={communityMessage}
              onBack={() => setScreen('lookup-result')}
              onDelete={submissionId => void deleteCommunity(submissionId)}
              onSubmit={(tag, note) =>
                void submitCommunity('COMMENT', tag, note)
              }
              ownSubmissionIds={ownCommunitySubmissionIds}
              submissions={communitySubmissions}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppPreferencesProvider>
        <AppThemeProvider>
          <AppContent />
        </AppThemeProvider>
      </AppPreferencesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  screen: { flex: 1 },
  resultLoading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  resultLoadingText: { fontSize: 15, marginTop: 14 },
  resultLoadingBack: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultLoadingBackText: { fontSize: 14 },
  pressed: { opacity: 0.7 },
});

export default App;
