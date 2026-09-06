import { getApp } from '@react-native-firebase/app';
import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
} from '@react-native-firebase/analytics';

export type SafeAnalyticsEvent =
  | 'authentication_started'
  | 'lookup_flow_opened'
  | 'lookup_refresh_requested'
  | 'spam_reported'
  | 'comment_added';

type SafeAnalyticsParameters = Readonly<{
  surface?: 'home' | 'history' | 'settings';
}>;

let consentGranted = false;

export async function configureAnalyticsConsent(
  granted: boolean,
): Promise<void> {
  consentGranted = granted;
  await setAnalyticsCollectionEnabled(getAnalytics(getApp()), granted);
}

export async function logSafeAnalyticsEvent(
  name: SafeAnalyticsEvent,
  parameters: SafeAnalyticsParameters = {},
): Promise<void> {
  if (!consentGranted) {
    return;
  }

  await logEvent(getAnalytics(getApp()), name, parameters);
}
