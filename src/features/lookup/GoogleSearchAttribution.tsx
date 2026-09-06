import { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { SearchAttribution } from '../../types/lookup';

type Props = Readonly<{
  attribution: SearchAttribution | null;
  onMessage: (message: string) => void;
}>;

function htmlDocument(renderedContent: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${renderedContent}</body></html>`;
}

export function GoogleSearchAttribution({ attribution, onMessage }: Props) {
  const handleNavigation = useCallback(
    (url: string) => {
      if (url === 'about:blank') {
        return true;
      }
      if (!url.startsWith('https://')) {
        return false;
      }
      Linking.openURL(url).catch(() => {
        onMessage('We could not open that Google Search.');
      });
      return false;
    },
    [onMessage],
  );

  if (!attribution?.renderedContent) {
    return null;
  }

  return (
    <View
      accessibilityLabel="Google Search suggestions"
      style={styles.container}
      testID={`google-search-attribution-${attribution.stage}`}
    >
      <WebView
        javaScriptEnabled={false}
        onShouldStartLoadWithRequest={request => handleNavigation(request.url)}
        originWhitelist={['about:blank']}
        scrollEnabled={false}
        source={{ html: htmlDocument(attribution.renderedContent) }}
        style={styles.webView}
        testID={`google-search-attribution-${attribution.stage}-webview`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    marginTop: 8,
    overflow: 'hidden',
    width: '100%',
  },
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});
