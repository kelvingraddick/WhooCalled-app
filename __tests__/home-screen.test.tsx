import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { HomeScreen } from '../src/features/home/HomeScreen';
import { themes } from '../src/theme/tokens';

const mockLightTheme = themes.light;

jest.mock('../src/components/BrandOwl', () => ({
  BrandOwl: () => null,
}));

jest.mock('../src/theme/AppTheme', () => ({
  useAppTheme: () => mockLightTheme,
}));

const renderHome = (monthlyRemaining: number) => {
  let screen: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    screen = ReactTestRenderer.create(
      <HomeScreen
        balance={{ monthlyAllowance: 3, monthlyRemaining }}
        lookupState={{ kind: 'idle' }}
        onLookupFlowOpen={jest.fn()}
        onLookupPress={jest.fn()}
        onHistoryPress={jest.fn()}
        onMoreLookupsPress={jest.fn()}
        onMenuPress={jest.fn()}
        onPhoneInputChange={jest.fn()}
        onRecentLookupPress={jest.fn()}
        phoneInput=""
        recentLookups={[]}
        user={null}
      />,
    );
  });

  return screen!;
};

describe('Home lookup balance', () => {
  it('fills all three bars when all free lookups remain', () => {
    const screen = renderHome(3);

    for (const index of [0, 1, 2]) {
      const segment = screen.root.findByProps({
        testID: `credit-segment-${index}`,
      });
      expect(StyleSheet.flatten(segment.props.style).backgroundColor).toBe(
        themes.light.accent,
      );
    }
  });

  it('empties one bar for each lookup used', () => {
    const screen = renderHome(2);
    const firstSegment = screen.root.findByProps({
      testID: 'credit-segment-0',
    });
    const thirdSegment = screen.root.findByProps({
      testID: 'credit-segment-2',
    });

    expect(StyleSheet.flatten(firstSegment.props.style).backgroundColor).toBe(
      themes.light.accent,
    );
    expect(StyleSheet.flatten(thirdSegment.props.style).backgroundColor).toBe(
      themes.light.surfaceBorder,
    );
  });

  it('opens lookup history from the Recent Lookups header', () => {
    const onHistoryPress = jest.fn();
    let screen: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      screen = ReactTestRenderer.create(
        <HomeScreen
          balance={{ monthlyAllowance: 3, monthlyRemaining: 3 }}
          lookupState={{ kind: 'idle' }}
          onHistoryPress={onHistoryPress}
          onLookupFlowOpen={jest.fn()}
          onLookupPress={jest.fn()}
          onMoreLookupsPress={jest.fn()}
          onMenuPress={jest.fn()}
          onPhoneInputChange={jest.fn()}
          onRecentLookupPress={jest.fn()}
          phoneInput=""
          recentLookups={[]}
          user={null}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      screen!.root
        .findByProps({ accessibilityLabel: 'Open lookup history' })
        .props.onPress();
    });

    expect(onHistoryPress).toHaveBeenCalledTimes(1);
  });

  it('opens More lookups from the Need More card', () => {
    const onMoreLookupsPress = jest.fn();
    let screen: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      screen = ReactTestRenderer.create(
        <HomeScreen
          balance={{ monthlyAllowance: 3, monthlyRemaining: 3 }}
          lookupState={{ kind: 'idle' }}
          onHistoryPress={jest.fn()}
          onLookupFlowOpen={jest.fn()}
          onLookupPress={jest.fn()}
          onMenuPress={jest.fn()}
          onMoreLookupsPress={onMoreLookupsPress}
          onPhoneInputChange={jest.fn()}
          onRecentLookupPress={jest.fn()}
          phoneInput=""
          recentLookups={[]}
          user={null}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      screen!.root
        .findByProps({ accessibilityLabel: 'Open More lookups' })
        .props.onPress();
    });

    expect(onMoreLookupsPress).toHaveBeenCalledTimes(1);
  });
});
