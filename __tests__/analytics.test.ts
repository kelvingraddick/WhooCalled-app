import {logEvent, setAnalyticsCollectionEnabled} from '@react-native-firebase/analytics';

import {
  configureAnalyticsConsent,
  logSafeAnalyticsEvent,
} from '../src/analytics/analytics';

describe('safe analytics', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await configureAnalyticsConsent(false);
  });

  it('does not emit an event until consent is granted', async () => {
    await logSafeAnalyticsEvent('lookup_flow_opened', {surface: 'home'});

    expect(logEvent).not.toHaveBeenCalled();
  });

  it('emits only the approved surface parameter after consent', async () => {
    await configureAnalyticsConsent(true);
    await logSafeAnalyticsEvent('authentication_started', {surface: 'home'});

    expect(setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(
      expect.anything(),
      true,
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.anything(),
      'authentication_started',
      {surface: 'home'},
    );
  });
});
