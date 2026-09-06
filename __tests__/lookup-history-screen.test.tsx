import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { LookupHistoryScreen } from '../src/features/history/LookupHistoryScreen';
import { AppPreferencesProvider } from '../src/preferences/AppPreferences';
import { AppThemeProvider } from '../src/theme/AppTheme';
import type { LookupHistoryItem } from '../src/types/lookup';

const lookup: LookupHistoryItem = {
  id: 'lookup-a',
  displayName: 'Acme Support',
  phoneDisplay: '(212) 555-0100',
  confidenceLabel: 'HIGH',
  confidenceScore: 82,
  spamReportCount: 3,
};

async function renderHistory(
  overrides: Partial<React.ComponentProps<typeof LookupHistoryScreen>> = {},
) {
  return render(
    <AppPreferencesProvider>
      <AppThemeProvider>
        <LookupHistoryScreen
          deletingLookupId={null}
          error={null}
          hasMore={false}
          isClearing={false}
          isLoading={false}
          isLoadingMore={false}
          lookups={[lookup]}
          onBack={jest.fn()}
          onClearPress={jest.fn()}
          onDeletePress={jest.fn()}
          onEndReached={jest.fn()}
          onLookupPress={jest.fn()}
          onRetry={jest.fn()}
          user={{
            uid: 'user-a',
            displayName: 'Kelvin',
            email: 'kelvin@example.com',
            provider: 'apple',
          }}
          {...overrides}
        />
      </AppThemeProvider>
    </AppPreferencesProvider>,
  );
}

describe('LookupHistoryScreen', () => {
  it('opens and removes an individual lookup, and exposes clear all', async () => {
    const onLookupPress = jest.fn();
    const onDeletePress = jest.fn();
    const onClearPress = jest.fn();
    const screen = await renderHistory({
      onClearPress,
      onDeletePress,
      onLookupPress,
    });

    await fireEvent.press(
      screen.getByLabelText('Open lookup for (212) 555-0100'),
    );
    await fireEvent.press(
      screen.getByLabelText('Remove lookup for (212) 555-0100'),
    );
    await fireEvent.press(screen.getByLabelText('Clear lookup history'));

    expect(onLookupPress).toHaveBeenCalledWith(lookup);
    expect(onDeletePress).toHaveBeenCalledWith(lookup);
    expect(onClearPress).toHaveBeenCalledTimes(1);
  });

  it('keeps signed-out history empty without an activation action', async () => {
    const screen = await renderHistory({ lookups: [], user: null });

    expect(screen.getByText('No lookup history')).toBeTruthy();
    expect(
      screen.getByText('Sign in to save and view lookup history.'),
    ).toBeTruthy();
    expect(screen.queryByText('Clear all')).toBeNull();
  });
});
