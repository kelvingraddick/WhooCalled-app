import { formatDebugDiagnostics } from '../src/services/debugDiagnostics';

describe('debug diagnostics', () => {
  it('contains only non-secret build, account and balance details', () => {
    expect(
      formatDebugDiagnostics({
        balance: {
          monthlyAllowance: 15,
          monthlyRemaining: 12,
          purchasedCredits: 4,
          planName: 'Plus',
          subscriptionExpiresAt: '2026-09-30T00:00:00.000Z',
        },
        buildNumber: '7',
        platform: 'ios',
        uid: 'tester-a',
        version: '1.0.0',
      }),
    ).toBe(
      [
        'Whoo Called 1.0.0 (7)',
        'Platform: ios',
        'Firebase UID: tester-a',
        'Plan: Plus',
        'Monthly lookups: 12 of 15',
        'Purchased lookups: 4',
      ].join('\n'),
    );
  });
});
