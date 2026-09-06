jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children, ...props }) =>
      React.createElement('SafeAreaView', props, children),
  };
});

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
  setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/auth', () => ({
  AppleAuthProvider: { credential: jest.fn() },
  GoogleAuthProvider: { credential: jest.fn() },
  getAuth: jest.fn(() => ({})),
  getIdToken: jest.fn(() => Promise.resolve('test-id-token')),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  reauthenticateWithCredential: jest.fn(),
  signOut: jest.fn(),
  signInWithCredential: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  getFirestore: jest.fn(() => ({})),
  limit: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  orderBy: jest.fn(),
  query: jest.fn(),
  startAfter: jest.fn(),
  where: jest.fn(),
}));

jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  getString: jest.fn(() => Promise.resolve('')),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-config', () => ({}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    logIn: jest.fn(() => Promise.resolve()),
    logOut: jest.fn(() => Promise.resolve()),
    purchasePackage: jest.fn(() => Promise.resolve()),
    restorePurchases: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getVersion: jest.fn(() => '1.0'),
    getBuildNumber: jest.fn(() => '1'),
  },
}));

jest.mock('@react-native-vector-icons/ionicons', () => {
  const React = require('react');
  return {
    Ionicons: props => React.createElement('Ionicons', props),
  };
});

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  return {
    WebView: props => React.createElement('WebView', props),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'd33625d3-12d7-4f80-9382-2f6bc0953485'),
}));

jest.mock('@invertase/react-native-apple-authentication', () => {
  const React = require('react');
  const AppleButton = props => React.createElement('AppleButton', props);
  AppleButton.Style = { WHITE: 'White' };
  AppleButton.Type = { CONTINUE: 'Continue' };

  const appleAuth = {
    Error: { CANCELED: '1001' },
    Operation: { LOGIN: 1 },
    Scope: { FULL_NAME: 0, EMAIL: 1 },
    performRequest: jest.fn(),
  };

  return {
    __esModule: true,
    AppleButton,
    appleAuthAndroid: { isSupported: false },
    default: appleAuth,
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  const React = require('react');
  const GoogleSigninButton = props =>
    React.createElement('GoogleSigninButton', props);
  GoogleSigninButton.Size = { Wide: 312 };

  return {
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(),
      signIn: jest.fn(),
    },
    GoogleSigninButton,
    isCancelledResponse: response => response?.type === 'cancelled',
  };
});
