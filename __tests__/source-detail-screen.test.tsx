import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('../src/theme/AppTheme', () => {
  const { resolveTheme } = require('../src/theme/tokens');
  return { useAppTheme: () => resolveTheme('dark', 'dark') };
});

import { SourceDetailScreen } from '../src/features/lookup/SourceDetailScreen';
import type { LookupDetail } from '../src/types/lookup';

const lookup: LookupDetail = {
  id: 'lookup-a',
  status: 'COMPLETE',
  phoneDisplay: '(404) 555-1212',
  numberKey: 'opaque-key',
  stages: {
    validation: { status: 'COMPLETE', detail: 'Valid' },
    identity: { status: 'COMPLETE', detail: 'Found' },
    web: { status: 'COMPLETE', detail: 'Found' },
    reputation: { status: 'COMPLETE', detail: 'No public spam reports found' },
    confidence: { status: 'COMPLETE', detail: 'Ready' },
  },
  errorMessage: null,
  result: null,
};

const candidate = {
  id: 'candidate-a',
  name: 'Johnson HVAC',
  kind: 'BUSINESS' as const,
  region: 'Georgia',
  score: 95,
  confidenceLabel: 'VERY HIGH' as const,
  confidenceFactors: {
    BASE_CONFIDENCE: 40,
    IDENTITY_ASSOCIATION: 20,
    CROSS_SOURCE_CORROBORATION: 30,
    CALLER_NAME_MATCH: 5,
    NUMBER_VALIDATION: 0,
  },
};

const source = {
  id: 'source-a',
  title: 'Johnson HVAC contact page',
  description: 'Call us at (404) 555-1212 for same-day service.',
  domain: 'johnsonhvac.com',
  url: 'https://johnsonhvac.com/contact',
  score: 96,
  kind: 'WEB' as const,
  candidateId: 'candidate-a',
  origin: 'FIRST_PARTY' as const,
  retrievalProvider: 'GOOGLE_GROUNDING' as const,
  retrievedAt: '2026-09-01T15:00:00.000Z',
};

describe('SourceDetailScreen', () => {
  it('renders server-provided evidence and opens the source', async () => {
    const onBack = jest.fn();
    const onReport = jest.fn();
    const openUrl = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);
    const screen = await render(
      <SourceDetailScreen
        candidate={candidate}
        lookup={lookup}
        onBack={onBack}
        onMessage={jest.fn()}
        onReport={onReport}
        source={source}
      />,
    );

    expect(screen.getByText('FIRST-PARTY WEBSITE')).toBeTruthy();
    expect(screen.getByText('WHY 95 CONFIDENCE')).toBeTruthy();
    expect(screen.getByText('Cross-source corroboration')).toBeTruthy();
    expect(screen.getByText('Retrieved Sep 1, 2026')).toBeTruthy();
    expect(screen.getByText('Retrieved with Google Search')).toBeTruthy();
    expect(screen.getByLabelText('Google Search lookup provider')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('View Source'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Report this as incorrect'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back to lookup result'));
    });

    expect(openUrl).toHaveBeenCalledWith('https://johnsonhvac.com/contact');
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    openUrl.mockRestore();
  });

  it('reports a URL-opening failure', async () => {
    const onMessage = jest.fn();
    const openUrl = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValue(new Error('unavailable'));
    const screen = await render(
      <SourceDetailScreen
        candidate={candidate}
        lookup={lookup}
        onBack={jest.fn()}
        onMessage={onMessage}
        onReport={jest.fn()}
        source={source}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('View Source'));
    });

    expect(onMessage).toHaveBeenCalledWith('We could not open this source.');
    openUrl.mockRestore();
  });
});
