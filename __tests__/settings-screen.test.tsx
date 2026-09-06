import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/preferences/preferencesRepository', () => ({
  defaultLocalPreferences: {
    appearance: 'system',
    confirmBeforeSpending: true,
    detectClipboardNumbers: true,
  },
  loadLocalPreferences: jest.fn(() => new Promise(() => undefined)),
  saveLocalPreferences: jest.fn(() => Promise.resolve()),
}));

import { AppPreferencesProvider } from '../src/preferences/AppPreferences';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';
import { AppThemeProvider } from '../src/theme/AppTheme';

const renderScreen = async ({
  debugAccess = false,
  isDebugActionLoading = false,
}: {
  debugAccess?: boolean;
  isDebugActionLoading?: boolean;
} = {}) => {
  const onAppearanceChange = jest.fn();
  const onClipboardChange = jest.fn();
  const onConfirmChange = jest.fn();
  const onLookupHistoryPress = jest.fn();
  const onDebugClearLookupHistory = jest.fn();
  const onDebugCopyDiagnostics = jest.fn();
  const onDebugRefresh = jest.fn();
  const onDebugResetMonthlyLookups = jest.fn();

  const screen = await render(
    <AppPreferencesProvider>
      <AppThemeProvider>
        <SettingsScreen
          appearance="system"
          confirmBeforeSpending
          detectClipboardNumbers
          isDebugActionLoading={isDebugActionLoading}
          isLoading={false}
          message={null}
          onAccountPress={jest.fn()}
          onAppearanceChange={onAppearanceChange}
          onBack={jest.fn()}
          onBuyLookupsPress={jest.fn()}
          onConfirmBeforeSpendingChange={onConfirmChange}
          onDataRequestPress={jest.fn()}
          onDeleteAccount={jest.fn()}
          onDebugClearLookupHistory={onDebugClearLookupHistory}
          onDebugCopyDiagnostics={onDebugCopyDiagnostics}
          onDebugRefresh={onDebugRefresh}
          onDebugResetMonthlyLookups={onDebugResetMonthlyLookups}
          onDetectClipboardChange={onClipboardChange}
          onLegalPress={jest.fn()}
          onLookupHistoryPress={onLookupHistoryPress}
          onManageSubscriptionPress={jest.fn()}
          onSignOut={jest.fn()}
          onSupportPress={jest.fn()}
          snapshot={{
            account: {
              displayName: 'Kelvin',
              email: 'kelvin@example.com',
              provider: 'apple',
            },
            balance: {
              monthlyAllowance: 3,
              monthlyRemaining: 2,
              purchasedCredits: 4,
              planName: 'Free plan',
              subscriptionExpiresAt: null,
            },
            debugAccess,
          }}
          user={{
            uid: 'user-a',
            displayName: 'Kelvin',
            email: 'kelvin@example.com',
            provider: 'apple',
          }}
        />
      </AppThemeProvider>
    </AppPreferencesProvider>,
  );

  return {
    onAppearanceChange,
    onClipboardChange,
    onConfirmChange,
    onLookupHistoryPress,
    onDebugClearLookupHistory,
    onDebugCopyDiagnostics,
    onDebugRefresh,
    onDebugResetMonthlyLookups,
    screen,
  };
};

const tapVersion = async (
  screen: Awaited<ReturnType<typeof render>>,
  times: number,
) => {
  for (let tap = 0; tap < times; tap += 1) {
    await fireEvent.press(screen.getByTestId('settings-version'));
  }
};

describe('Settings screen', () => {
  it('shows account, balance, and the resolved system appearance', async () => {
    const { onLookupHistoryPress, screen } = await renderScreen();

    expect(screen.getAllByText('Kelvin')).toHaveLength(2);
    expect(screen.getByText('2 of 3 +4 extra')).toBeTruthy();
    expect(screen.getByText(/System \((Dark|Light)\)/)).toBeTruthy();
    expect(screen.getByText('Remove or correct data')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lookup history'));
    expect(onLookupHistoryPress).toHaveBeenCalledTimes(1);
  });

  it('reveals tester Debug controls only after three version taps', async () => {
    const unallowlisted = await renderScreen();
    await tapVersion(unallowlisted.screen, 3);
    expect(unallowlisted.screen.queryByText('DEBUG')).toBeNull();
    await unallowlisted.screen.unmount();

    const allowed = await renderScreen({ debugAccess: true });
    await tapVersion(allowed.screen, 2);
    expect(allowed.screen.queryByText('DEBUG')).toBeNull();

    await tapVersion(allowed.screen, 1);
    expect(allowed.screen.getByText('DEBUG')).toBeTruthy();

    await fireEvent.press(
      allowed.screen.getByLabelText('Reset monthly lookups'),
    );
    await fireEvent.press(
      allowed.screen.getByLabelText('Erase lookup history'),
    );
    await fireEvent.press(
      allowed.screen.getByLabelText('Refresh account state'),
    );
    await fireEvent.press(allowed.screen.getByLabelText('Copy diagnostics'));

    expect(allowed.onDebugResetMonthlyLookups).toHaveBeenCalledTimes(1);
    expect(allowed.onDebugClearLookupHistory).toHaveBeenCalledTimes(1);
    expect(allowed.onDebugRefresh).toHaveBeenCalledTimes(1);
    expect(allowed.onDebugCopyDiagnostics).toHaveBeenCalledTimes(1);
    await allowed.screen.unmount();
  });

  it('disables Debug actions while a destructive action is running', async () => {
    const rendered = await renderScreen({
      debugAccess: true,
      isDebugActionLoading: true,
    });
    await tapVersion(rendered.screen, 3);

    const reset = rendered.screen.getByLabelText('Reset monthly lookups');
    expect(reset.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(reset);
    expect(rendered.onDebugResetMonthlyLookups).not.toHaveBeenCalled();
    await rendered.screen.unmount();
  });
});
