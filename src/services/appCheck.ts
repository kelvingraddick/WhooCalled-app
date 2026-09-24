import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

let initialized = false;

export function initializeWhooCalledAppCheck(): void {
  if (initialized) {
    return;
  }

  const provider = new ReactNativeFirebaseAppCheckProvider({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttest',
    },
  });
  initializeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
}
