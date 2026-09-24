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

import { PurchaseScreen } from '../src/features/settings/SettingsDetailScreens';
import type { RevenueCatPackage } from '../src/services/revenueCatGateway';
import { AppPreferencesProvider } from '../src/preferences/AppPreferences';
import { AppThemeProvider } from '../src/theme/AppTheme';

const packages = [
  ['plus.monthly', '$6.99', 6.99],
  ['plus.annual', '$59.99', 59.99],
  ['pro.monthly', '$14.99', 14.99],
  ['pro.annual', '$99.99', 99.99],
  ['power.monthly', '$24.99', 24.99],
  ['power.annual', '$149.99', 149.99],
  ['credits.10', '$2.99', 2.99],
  ['credits.25', '$6.99', 6.99],
  ['credits.50', '$12.99', 12.99],
].map(
  ([suffix, price, priceAmount]) =>
    ({
      identifier: `package-${suffix}`,
      productIdentifier: `com.wavelinkllc.whoocalled.${suffix}`,
      title: suffix,
      description: '',
      price,
      priceAmount,
      package: {},
    } as unknown as RevenueCatPackage),
);

async function renderScreen(hasPaidSubscription = false) {
  const onBuy = jest.fn();
  const screen = await render(
    <AppPreferencesProvider>
      <AppThemeProvider>
        <PurchaseScreen
          currentPlanName={hasPaidSubscription ? 'Plus' : 'Free plan'}
          hasPaidSubscription={hasPaidSubscription}
          isLoading={false}
          message={null}
          noResultRefundsEnabled
          noResultRefundsRemaining={2}
          onBack={jest.fn()}
          onBuy={onBuy}
          onRestore={jest.fn()}
          packages={packages}
        />
      </AppThemeProvider>
    </AppPreferencesProvider>,
  );

  return { onBuy, screen };
}

describe('PurchaseScreen', () => {
  it('defaults Free users to the monthly Pro plan and hides annual plans', async () => {
    const { onBuy, screen } = await renderScreen();

    expect(screen.getByText('Get Pro · $14.99/mo')).toBeTruthy();
    expect(screen.queryByText(/Annual/)).toBeNull();
    expect(screen.getByText('2 of 3 no-result returns remaining')).toBeTruthy();
    await fireEvent.press(screen.getByText('Get Pro · $14.99/mo'));
    expect(onBuy).toHaveBeenCalledWith(
      expect.objectContaining({
        productIdentifier: 'com.wavelinkllc.whoocalled.pro.monthly',
      }),
    );
  });

  it('hides extra packs from Free users', async () => {
    const { screen } = await renderScreen();

    expect(screen.queryByText('Extra lookup packs')).toBeNull();
    expect(screen.queryByLabelText('Buy 10 extra lookups')).toBeNull();
  });

  it('shows packs to paid subscribers and purchases the chosen pack', async () => {
    const { onBuy, screen } = await renderScreen(true);

    expect(screen.getByText('Extra lookup packs')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Buy 25 extra lookups'));
    expect(onBuy).toHaveBeenCalledWith(
      expect.objectContaining({
        productIdentifier: 'com.wavelinkllc.whoocalled.credits.25',
      }),
    );
  });
});
