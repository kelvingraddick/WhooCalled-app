import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('../src/theme/AppTheme', () => {
  const { resolveTheme } = require('../src/theme/tokens');
  return { useAppTheme: () => resolveTheme('dark', 'dark') };
});

import { LookupProgressScreen } from '../src/features/lookup/LookupProgressScreen';
import { LookupResultScreen } from '../src/features/lookup/LookupResultScreen';
import type { LookupDetail } from '../src/types/lookup';

const lookup: LookupDetail = {
  id: 'lookup-a',
  status: 'COMPLETE',
  phoneDisplay: '(404) 555-1212',
  numberKey: 'opaque-number-key',
  stages: {
    validation: { status: 'COMPLETE', detail: 'Verizon · Mobile' },
    identity: { status: 'COMPLETE', detail: '2 candidate names found' },
    web: { status: 'COMPLETE', detail: '2 matching public pages found' },
    reputation: { status: 'COMPLETE', detail: 'No public spam reports found' },
    confidence: { status: 'COMPLETE', detail: 'Confidence is ready.' },
  },
  errorMessage: null,
  result: {
    phoneDisplay: '(404) 555-1212',
    carrier: 'Verizon',
    lineType: 'nonFixedVoip',
    region: 'Georgia',
    checkedAt: '2026-09-01T00:00:00.000Z',
    confidenceScore: 94,
    confidenceLabel: 'VERY HIGH',
    primaryCandidateId: 'candidate-1',
    candidates: [
      {
        id: 'candidate-1',
        name: 'Johnson HVAC',
        kind: 'BUSINESS',
        region: 'Georgia',
        score: 94,
        confidenceLabel: 'VERY HIGH',
        confidenceFactors: {
          BASE_CONFIDENCE: 40,
          IDENTITY_ASSOCIATION: 20,
          CROSS_SOURCE_CORROBORATION: 25,
          CALLER_NAME_MATCH: 5,
          NUMBER_VALIDATION: 4,
        },
      },
      {
        id: 'candidate-2',
        name: 'Johnson Heating',
        kind: 'BUSINESS',
        region: 'Georgia',
        score: 76,
        confidenceLabel: 'HIGH',
        confidenceFactors: {
          BASE_CONFIDENCE: 40,
          IDENTITY_ASSOCIATION: 20,
          CROSS_SOURCE_CORROBORATION: 15,
          CALLER_NAME_MATCH: 0,
          NUMBER_VALIDATION: 1,
        },
      },
    ],
    sources: [
      {
        id: 'source-a',
        title: 'Johnson HVAC contact page',
        description: 'Exact number appears on the contact page.',
        domain: 'johnsonhvac.com',
        url: 'https://johnsonhvac.com/contact',
        score: 96,
        kind: 'WEB',
        candidateId: 'candidate-1',
        origin: 'FIRST_PARTY',
        retrievalProvider: 'GOOGLE_GROUNDING',
        retrievedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    spamSources: [
      {
        id: 'spam-a',
        title: 'Spam reports for 404-555-1212',
        description: 'Users describe robocalls from this number.',
        domain: 'reports.example',
        url: 'https://reports.example/404-555-1212',
        score: 0,
        kind: 'SPAM_REPORT',
        candidateId: null,
        origin: 'INDEPENDENT',
        retrievalProvider: 'GOOGLE_GROUNDING',
        retrievedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    searchAttributions: [
      {
        stage: 'web',
        provider: 'GOOGLE_GROUNDING',
        renderedContent:
          '<a href="https://google.com/search?q=4045551212">Search</a>',
        webSearchQueries: ['4045551212 Johnson HVAC'],
      },
      {
        stage: 'reputation',
        provider: 'GOOGLE_GROUNDING',
        renderedContent:
          '<a href="https://google.com/search?q=4045551212+spam">Search</a>',
        webSearchQueries: ['4045551212 spam'],
      },
    ],
    isPartial: false,
  },
};

async function renderWithTheme(children: React.ReactElement) {
  return render(children);
}

describe('lookup screens', () => {
  it('shows each completed progress stage and keeps cancel available', async () => {
    const onCancel = jest.fn();
    const screen = await renderWithTheme(
      <LookupProgressScreen
        lookup={lookup}
        onCancel={onCancel}
        phoneDisplay={lookup.phoneDisplay}
      />,
    );

    expect(screen.getByText('Number validated')).toBeTruthy();
    expect(screen.getByText('Google web evidence')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel lookup'));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders result controls for refresh, candidates, and community', async () => {
    const onRefresh = jest.fn();
    const onCandidates = jest.fn();
    const onComments = jest.fn();
    const onReport = jest.fn();
    const onSource = jest.fn();
    const openUrl = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);
    const screen = await renderWithTheme(
      <LookupResultScreen
        lookup={lookup}
        onBack={jest.fn()}
        onCandidates={onCandidates}
        onComments={onComments}
        onCorrectData={jest.fn()}
        onDeleteReport={jest.fn()}
        onMessage={jest.fn()}
        onSource={onSource}
        onRefresh={onRefresh}
        onReport={onReport}
        hasOwnReport={false}
        isRefreshing={false}
        reportSummary={{
          total: 3,
          counts: {
            SPAM: 0,
            SCAM_FRAUD: 2,
            TELEMARKETING: 0,
            ROBOCALL: 1,
            DEBT_COLLECTION: 0,
            POLITICAL: 0,
            SURVEY: 0,
            OTHER: 0,
          },
        }}
        selectedCandidateId={null}
        summary={{ reportCount: 0, commentCount: 7 }}
      />,
    );

    expect(screen.getByText('Johnson HVAC')).toBeTruthy();
    expect(screen.getByText('Network / provider')).toBeTruthy();
    expect(screen.getByText('Non-fixed VoIP')).toBeTruthy();
    expect(screen.getByText('Comments · 7')).toBeTruthy();
    expect(screen.getByText('COMMUNITY REPORTS')).toBeTruthy();
    expect(screen.getByText('Scam/Fraud')).toBeTruthy();
    expect(screen.getByText('SPAM RISK')).toBeTruthy();
    expect(screen.getAllByText('VERY HIGH')).toHaveLength(2);
    expect(screen.getByText('PUBLIC WEB REPORTS · 1')).toBeTruthy();
    expect(
      screen.getAllByLabelText('Google Search lookup provider'),
    ).toHaveLength(2);
    expect(screen.getAllByLabelText('Google Search suggestions')).toHaveLength(
      2,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Refresh'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('1 other possible match'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Report'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Comments · 7'));
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText(
          'Open external source: Johnson HVAC contact page',
        ),
      );
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText(
          'Open public spam report: Spam reports for 404-555-1212',
        ),
      );
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('View details for Johnson HVAC contact page'),
      );
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onCandidates).toHaveBeenCalledTimes(1);
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onComments).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith('https://johnsonhvac.com/contact');
    expect(openUrl).toHaveBeenCalledWith(
      'https://reports.example/404-555-1212',
    );
    expect(onSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'source-a' }),
    );
    openUrl.mockRestore();
  });

  it('offers deletion instead of replacement for an existing report', async () => {
    const onDeleteReport = jest.fn();
    const screen = await renderWithTheme(
      <LookupResultScreen
        lookup={lookup}
        onBack={jest.fn()}
        onCandidates={jest.fn()}
        onComments={jest.fn()}
        onCorrectData={jest.fn()}
        onDeleteReport={onDeleteReport}
        onMessage={jest.fn()}
        onRefresh={jest.fn()}
        onReport={jest.fn()}
        onSource={jest.fn()}
        hasOwnReport
        isRefreshing={false}
        reportSummary={{
          total: 1,
          counts: {
            SPAM: 1,
            SCAM_FRAUD: 0,
            TELEMARKETING: 0,
            ROBOCALL: 0,
            DEBT_COLLECTION: 0,
            POLITICAL: 0,
            SURVEY: 0,
            OTHER: 0,
          },
        }}
        selectedCandidateId={null}
        summary={{ reportCount: 1, commentCount: 0 }}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Delete report'));
    });

    expect(onDeleteReport).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled loading control while a refresh is being started', async () => {
    const onRefresh = jest.fn();
    const screen = await renderWithTheme(
      <LookupResultScreen
        lookup={lookup}
        onBack={jest.fn()}
        onCandidates={jest.fn()}
        onComments={jest.fn()}
        onCorrectData={jest.fn()}
        onDeleteReport={jest.fn()}
        onMessage={jest.fn()}
        onRefresh={onRefresh}
        onReport={jest.fn()}
        onSource={jest.fn()}
        hasOwnReport={false}
        isRefreshing
        reportSummary={{
          total: 0,
          counts: {
            SPAM: 0,
            SCAM_FRAUD: 0,
            TELEMARKETING: 0,
            ROBOCALL: 0,
            DEBT_COLLECTION: 0,
            POLITICAL: 0,
            SURVEY: 0,
            OTHER: 0,
          },
        }}
        selectedCandidateId={null}
        summary={{ reportCount: 0, commentCount: 0 }}
      />,
    );

    expect(screen.getByLabelText('Refresh in progress')).toBeTruthy();
    expect(screen.getByLabelText('Refreshing lookup')).toBeDisabled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Refreshing lookup'));
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
