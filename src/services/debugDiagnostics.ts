import type { SettingsSnapshot } from './settingsGateway';

type DebugDiagnosticsInput = Readonly<{
  version: string;
  buildNumber: string;
  platform: string;
  uid: string;
  balance: SettingsSnapshot['balance'];
}>;

export function formatDebugDiagnostics({
  version,
  buildNumber,
  platform,
  uid,
  balance,
}: DebugDiagnosticsInput): string {
  return [
    `Whoo Called ${version} (${buildNumber})`,
    `Platform: ${platform}`,
    `Firebase UID: ${uid}`,
    `Plan: ${balance.planName}`,
    `Monthly lookups: ${balance.monthlyRemaining} of ${balance.monthlyAllowance}`,
    `Purchased lookups: ${balance.purchasedCredits}`,
  ].join('\n');
}
