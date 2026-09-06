export type SpamRiskLabel =
  | 'NO SIGNAL'
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'VERY HIGH';

export type SpamRisk = Readonly<{
  score: number;
  label: SpamRiskLabel;
  publicSourceCount: number;
  communityReportCount: number;
}>;

export function spamRiskFor(
  publicSourceCount: number,
  communityReportCount: number,
): SpamRisk {
  const safePublicCount = Math.max(0, Math.floor(publicSourceCount));
  const safeCommunityCount = Math.max(0, Math.floor(communityReportCount));
  const score = Math.min(100, (safePublicCount + safeCommunityCount) * 20);

  return {
    score,
    label:
      score >= 80
        ? 'VERY HIGH'
        : score >= 60
        ? 'HIGH'
        : score >= 40
        ? 'MODERATE'
        : score >= 20
        ? 'LOW'
        : 'NO SIGNAL',
    publicSourceCount: safePublicCount,
    communityReportCount: safeCommunityCount,
  };
}
