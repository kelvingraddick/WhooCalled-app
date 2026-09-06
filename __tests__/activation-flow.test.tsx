import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

jest.mock('../src/services/authGateway', () => ({
  authGateway: {
    observe: jest.fn(),
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
  },
}));

jest.mock('../src/services/lookupHistoryRepository', () => ({
  observeRecentLookups: jest.fn(),
}));

jest.mock('../src/services/lookupGateway', () => ({
  lookupGateway: {
    requestInitialLookup: jest.fn(),
    requestRefresh: jest.fn(),
  },
}));

import App from '../App';
import { authGateway } from '../src/services/authGateway';
import { lookupGateway } from '../src/services/lookupGateway';

const mockAuthGateway = authGateway as jest.Mocked<typeof authGateway>;
const mockLookupGateway = lookupGateway as jest.Mocked<typeof lookupGateway>;

describe('activation lookup flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find(button => button.text === 'Use lookup')?.onPress?.();
      });
    mockAuthGateway.observe.mockImplementation(() => jest.fn());
    mockLookupGateway.requestInitialLookup.mockResolvedValue({
      balance: {
        monthlyAllowance: 3,
        monthlyRemaining: 3,
        purchasedCredits: 0,
        planName: 'Free plan',
        subscriptionExpiresAt: null,
      },
      lookupId: null,
      requestId: 'd33625d3-12d7-4f80-9382-2f6bc0953485',
      status: 'PROVIDER_NOT_CONFIGURED',
      message:
        'Lookup providers are not configured. No credit was reserved or consumed.',
    });
  });

  it.each(['apple', 'google'] as const)(
    'returns to Settings after %s activation and opens Profile only when Edit is tapped',
    async provider => {
      const signIn =
        provider === 'apple'
          ? mockAuthGateway.signInWithApple
          : mockAuthGateway.signInWithGoogle;
      signIn.mockResolvedValue({
        uid: 'settings-user',
        displayName: 'Settings User',
        email: 'settings@example.com',
        provider,
      });
      const screen = await render(<App />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('open-settings'));
      });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Activate account'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId(`continue-with-${provider}`));
      });

      expect(screen.getByTestId('close-settings')).toBeTruthy();
      expect(screen.getByLabelText('Edit account')).toBeTruthy();
      expect(screen.queryByLabelText('Activate account')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Edit account'));
      });
      expect(screen.queryByTestId('close-settings')).toBeNull();
      expect(screen.getByText('Profile')).toBeTruthy();
    },
  );

  it('opens activation for a valid signed-out lookup and preserves the number when closed', async () => {
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '4045551212',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });

    expect(screen.getByText(/Start with 3 free/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('close-activation'));
    });

    expect(screen.getByPlaceholderText('Enter a US number').props.value).toBe(
      '(404) 555-1212',
    );
    expect(mockLookupGateway.requestInitialLookup).not.toHaveBeenCalled();
  });

  it('keeps an invalid US number on Home and explains how to correct it', async () => {
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '40455512',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });

    expect(
      screen.getByText('Enter a valid 10-digit US phone number to continue.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Start with 3 free/)).toBeNull();
    expect(mockLookupGateway.requestInitialLookup).not.toHaveBeenCalled();
  });

  it('does not submit a lookup when Apple sign-in is cancelled', async () => {
    mockAuthGateway.signInWithApple.mockResolvedValue(null);
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '4045551212',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('continue-with-apple'));
    });

    expect(screen.getByText(/Start with 3 free/)).toBeTruthy();
    expect(mockLookupGateway.requestInitialLookup).not.toHaveBeenCalled();
  });

  it('submits the preserved request once Apple authentication succeeds', async () => {
    mockAuthGateway.signInWithApple.mockResolvedValue({
      uid: 'user-a',
      displayName: 'Kelvin',
      email: 'kelvin@example.com',
      provider: 'apple',
    });
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '4045551212',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('continue-with-apple'));
    });

    await waitFor(() => {
      expect(mockLookupGateway.requestInitialLookup).toHaveBeenCalledWith({
        countryHint: 'US',
        phoneInput: '(404) 555-1212',
      });
    });

    expect(
      screen.getByText('Lookups are not available yet. No credit was used.'),
    ).toBeTruthy();
  });

  it('uses the full-size branded button to submit once Google authentication succeeds', async () => {
    mockAuthGateway.signInWithGoogle.mockResolvedValue({
      uid: 'user-g',
      displayName: 'Kelvin',
      email: 'kelvin@example.com',
      provider: 'google',
    });
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '4045551212',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });

    const googleButton = screen.getByRole('button', {
      name: 'Continue with Google',
    });
    expect(googleButton).toBeTruthy();
    expect(googleButton).toBe(screen.getByTestId('continue-with-google'));
    expect(StyleSheet.flatten(googleButton.props.style)).toMatchObject({
      borderRadius: 24,
      height: 58,
      width: '100%',
    });

    await act(async () => {
      fireEvent.press(googleButton);
    });

    await waitFor(() => {
      expect(mockLookupGateway.requestInitialLookup).toHaveBeenCalledWith({
        countryHint: 'US',
        phoneInput: '(404) 555-1212',
      });
    });
  });

  it('disables the Google button while Google authentication is in progress', async () => {
    let resolveGoogleSignIn: (user: null) => void = () => undefined;
    mockAuthGateway.signInWithGoogle.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveGoogleSignIn = resolve;
        }),
    );
    const screen = await render(<App />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter a US number'),
        '4045551212',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('lookup-number'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('continue-with-google'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('continue-with-google').props.accessibilityState,
      ).toEqual({
        disabled: true,
      });
    });

    fireEvent.press(screen.getByTestId('continue-with-google'));
    expect(mockAuthGateway.signInWithGoogle).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveGoogleSignIn(null);
    });
  });
});
