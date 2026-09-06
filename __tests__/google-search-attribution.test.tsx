import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { GoogleSearchAttribution } from '../src/features/lookup/GoogleSearchAttribution';

const attribution = {
  stage: 'reputation' as const,
  provider: 'GOOGLE_GROUNDING' as const,
  renderedContent:
    '<a href="https://google.com/search?q=4045551212">Search with Google</a>',
  webSearchQueries: ['4045551212 spam'],
};

describe('GoogleSearchAttribution', () => {
  it('renders returned HTML with scripts disabled and opens HTTPS externally', async () => {
    const openUrl = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);
    const screen = await render(
      <GoogleSearchAttribution
        attribution={attribution}
        onMessage={jest.fn()}
      />,
    );
    expect(
      screen.getByTestId('google-search-attribution-reputation'),
    ).toBeTruthy();
    const webView = screen.getByTestId(
      'google-search-attribution-reputation-webview',
    );

    expect(webView.props.javaScriptEnabled).toBe(false);
    expect(webView.props.source.html).toContain(attribution.renderedContent);
    let allowed = true;
    await act(async () => {
      allowed = webView.props.onShouldStartLoadWithRequest({
        url: 'https://google.com/search?q=4045551212',
      });
    });

    expect(allowed).toBe(false);
    expect(openUrl).toHaveBeenCalledWith(
      'https://google.com/search?q=4045551212',
    );
    openUrl.mockRestore();
  });

  it('rejects non-HTTPS navigation', async () => {
    const openUrl = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);
    const screen = await render(
      <GoogleSearchAttribution
        attribution={attribution}
        onMessage={jest.fn()}
      />,
    );
    const webView = screen.getByTestId(
      'google-search-attribution-reputation-webview',
    );

    expect(
      webView.props.onShouldStartLoadWithRequest({
        url: 'http://unsafe.example',
      }),
    ).toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
    openUrl.mockRestore();
  });

  it('does not render attribution for a legacy lookup', async () => {
    const screen = await render(
      <GoogleSearchAttribution attribution={null} onMessage={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Google Search suggestions')).toBeNull();
  });
});
