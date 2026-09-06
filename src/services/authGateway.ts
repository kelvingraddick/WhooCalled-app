import { getApp } from '@react-native-firebase/app';
import {
  AppleAuthProvider,
  getAuth,
  GoogleAuthProvider,
  getIdToken,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  signInWithCredential,
  type User,
} from '@react-native-firebase/auth';
import appleAuth, {
  appleAuthAndroid,
} from '@invertase/react-native-apple-authentication';
import {
  GoogleSignin,
  isCancelledResponse,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

export type AppUser = Readonly<{
  uid: string;
  displayName: string | null;
  email: string | null;
  provider: 'apple' | 'google' | 'unknown';
}>;

export type AuthGateway = Readonly<{
  observe: (listener: (user: AppUser | null) => void) => () => void;
  signInWithApple: () => Promise<AppUser | null>;
  signInWithGoogle: () => Promise<AppUser | null>;
  reauthenticate: (provider: AppUser['provider']) => Promise<boolean>;
  signOut: () => Promise<void>;
}>;

export class AuthConfigurationError extends Error {
  constructor() {
    super(
      'This sign-in option is still being configured. Please try again soon.',
    );
    this.name = 'AuthConfigurationError';
  }
}

function toAppUser(user: User): AppUser {
  const providerIds = user.providerData.map(provider => provider.providerId);

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    provider: providerIds.includes('apple.com')
      ? 'apple'
      : providerIds.includes('google.com')
      ? 'google'
      : 'unknown',
  };
}

function isAppleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === appleAuth.Error.CANCELED
  );
}

function describeAuthError(provider: 'Apple' | 'Google', error: unknown): Error {
  if (error instanceof Error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const detail = code ? `${code}: ${error.message}` : error.message;
    return new Error(`${provider} sign-in failed. ${detail}`);
  }

  return new Error(`${provider} sign-in failed. Please try again.`);
}

function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    // Explicitly provide the iOS OAuth client used by this Firebase app.
    // This keeps native configuration deterministic in the Simulator and
    // avoids relying on GoogleService-Info.plist discovery at runtime.
    iosClientId:
      '1046838355041-v32svr9ppbbo8utc417cq5o7nibki31u.apps.googleusercontent.com',
    // Firebase Auth validates the Google ID token against this Web OAuth
    // client, so request the same audience from Google Sign-In.
    webClientId:
      '1046838355041-pn3bqgmvta70te5vn7tmpgs97u5v3b81.apps.googleusercontent.com',
    scopes: ['email', 'profile'],
  });
}

async function getAppleCredential() {
  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  });

  if (!response.identityToken) {
    throw new AuthConfigurationError();
  }

  return AppleAuthProvider.credential(
    response.identityToken,
    response.nonce,
    response.fullName ?? undefined,
  );
}

async function getGoogleCredential() {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (isCancelledResponse(response)) {
    return null;
  }

  if (!response.data.idToken) {
    throw new AuthConfigurationError();
  }

  return GoogleAuthProvider.credential(response.data.idToken);
}

export const authGateway: AuthGateway = {
  observe(listener) {
    return onAuthStateChanged(getAuth(getApp()), user => {
      listener(user ? toAppUser(user) : null);
    });
  },

  async signInWithApple() {
    try {
      if (Platform.OS === 'android') {
        if (!appleAuthAndroid.isSupported) {
          throw new AuthConfigurationError();
        }

        throw new AuthConfigurationError();
      }

      const credential = await getAppleCredential();
      const result = await signInWithCredential(getAuth(getApp()), credential);
      // Ensure the first authenticated callable after OAuth receives the
      // newly signed-in user's token instead of racing Auth persistence.
      await getIdToken(result.user, true);
      return toAppUser(result.user);
    } catch (error) {
      if (isAppleCancellation(error)) {
        return null;
      }

      if (error instanceof AuthConfigurationError) {
        throw error;
      }

      throw describeAuthError('Apple', error);
    }
  },

  async signInWithGoogle() {
    try {
      const credential = await getGoogleCredential();
      if (!credential) {
        return null;
      }
      const result = await signInWithCredential(getAuth(getApp()), credential);
      await getIdToken(result.user, true);
      return toAppUser(result.user);
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        throw error;
      }

      throw describeAuthError('Google', error);
    }
  },

  async reauthenticate(provider) {
    try {
      const user = getAuth(getApp()).currentUser;
      if (!user) {
        throw new AuthConfigurationError();
      }

      if (provider === 'apple') {
        if (Platform.OS === 'android' || !appleAuth) {
          throw new AuthConfigurationError();
        }

        const credential = await getAppleCredential();
        await reauthenticateWithCredential(user, credential);
        return true;
      }

      if (provider === 'google') {
        const credential = await getGoogleCredential();
        if (!credential) {
          return false;
        }

        await reauthenticateWithCredential(user, credential);
        return true;
      }

      throw new AuthConfigurationError();
    } catch (error) {
      if (isAppleCancellation(error)) {
        return false;
      }

      if (error instanceof AuthConfigurationError) {
        throw error;
      }

      throw describeAuthError('Google', error);
    }
  },

  async signOut() {
    await signOut(getAuth(getApp()));
  },
};
