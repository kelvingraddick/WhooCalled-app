import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/theme/AppTheme', () => {
  const { resolveTheme } = require('../src/theme/tokens');
  return { useAppTheme: () => resolveTheme('dark', 'dark') };
});

import { ReportScreen } from '../src/features/lookup/LookupCommunityScreens';

describe('report screen', () => {
  it('submits the selected spam category and optional detail', async () => {
    const onSubmit = jest.fn();
    const screen = await render(
      <ReportScreen
        isSubmitting={false}
        message={null}
        onBack={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Debt Collection'));
    });
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText('Report detail'),
        'Asked for a payment card number.',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Submit report'));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      'DEBT_COLLECTION',
      'Asked for a payment card number.',
    );
  });
});
