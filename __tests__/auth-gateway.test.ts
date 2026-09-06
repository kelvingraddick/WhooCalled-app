import {
  AppleAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
} from '@react-native-firebase/auth';
import appleAuth from '@invertase/react-native-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { authGateway } from '../src/services/authGateway';

const mockAppleCredential = AppleAuthProvider.credential as jest.Mock;
const mockPerformAppleRequest = appleAuth.performRequest as jest.Mock;
const mockSignInWithCredential = signInWithCredential as jest.Mock;
const mockGoogleConfigure = GoogleSignin.configure as jest.Mock;
const mockGoogleSignIn = GoogleSignin.signIn as jest.Mock;
const mockGoogleCredential = GoogleAuthProvider.credential as jest.Mock;

describe('authGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes Apple's nonce and first-time name to Firebase", async () => {
    const fullName = {
      namePrefix: null,
      givenName: 'Kelvin',
      middleName: null,
      familyName: 'Graddick',
      nameSuffix: null,
      nickname: null,
    };
    mockPerformAppleRequest.mockResolvedValue({
      identityToken: 'apple-identity-token',
      nonce: 'unhashed-nonce',
      fullName,
    });
    mockAppleCredential.mockReturnValue('apple-credential');
    mockSignInWithCredential.mockResolvedValue({
      user: {
        uid: 'apple-user',
        displayName: 'Kelvin Graddick',
        email: 'kelvin@example.com',
        providerData: [{ providerId: 'apple.com' }],
      },
    });

    await expect(authGateway.signInWithApple()).resolves.toEqual({
      uid: 'apple-user',
      displayName: 'Kelvin Graddick',
      email: 'kelvin@example.com',
      provider: 'apple',
    });

    expect(mockAppleCredential).toHaveBeenCalledWith(
      'apple-identity-token',
      'unhashed-nonce',
      fullName,
    );
  });

  it('configures Google Sign-In with the iOS OAuth client', async () => {
    mockGoogleSignIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-id-token' },
    });
    mockGoogleCredential.mockReturnValue('google-credential');
    mockSignInWithCredential.mockResolvedValue({
      user: {
        uid: 'google-user',
        displayName: 'Kelvin Graddick',
        email: 'kelvin@example.com',
        providerData: [{ providerId: 'google.com' }],
      },
    });

    await authGateway.signInWithGoogle();

    expect(mockGoogleConfigure).toHaveBeenCalledWith({
      iosClientId:
        '1046838355041-v32svr9ppbbo8utc417cq5o7nibki31u.apps.googleusercontent.com',
      webClientId:
        '1046838355041-pn3bqgmvta70te5vn7tmpgs97u5v3b81.apps.googleusercontent.com',
      scopes: ['email', 'profile'],
    });
  });
});
