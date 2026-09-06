const lineTypeLabels: Readonly<Record<string, string>> = {
  mobile: 'Mobile',
  landline: 'Landline',
  fixedvoip: 'Fixed VoIP',
  nonfixedvoip: 'Non-fixed VoIP',
  personal: 'Personal',
  tollfree: 'Toll-free',
  premium: 'Premium-rate',
  sharedcost: 'Shared-cost',
  uan: 'Universal Access Number (UAN)',
  voicemail: 'Voicemail',
  pager: 'Pager',
  unknown: 'Unknown',
};

function normalizedLineType(value: string): string {
  return value.replace(/[\s_-]/g, '').toLowerCase();
}

function readableFallback(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function phoneLineTypeLabel(
  lineType: string | null | undefined,
): string {
  if (!lineType?.trim()) {
    return 'Unavailable';
  }

  const value = lineType.trim();
  return lineTypeLabels[normalizedLineType(value)] ?? readableFallback(value);
}
