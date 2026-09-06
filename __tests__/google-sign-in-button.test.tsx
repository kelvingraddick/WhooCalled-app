import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { GoogleSignInButton } from '../src/components/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  it('renders the accessible, Apple-sized Google sign-in action', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <GoogleSignInButton onPress={onPress} testID="continue-with-google" />,
    );

    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toBe(screen.getByTestId('continue-with-google'));
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      borderColor: '#747775',
      borderRadius: 24,
      borderWidth: 1,
      height: 58,
      width: '100%',
    });

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not invoke sign-in while disabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <GoogleSignInButton
        disabled
        onPress={onPress}
        testID="continue-with-google"
      />,
    );

    const button = screen.getByTestId('continue-with-google');
    expect(button.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
