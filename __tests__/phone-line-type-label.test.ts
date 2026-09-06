import { phoneLineTypeLabel } from '../src/features/lookup/phoneLineTypeLabel';

describe('phoneLineTypeLabel', () => {
  it.each([
    ['mobile', 'Mobile'],
    ['landline', 'Landline'],
    ['fixedVoip', 'Fixed VoIP'],
    ['nonFixedVoip', 'Non-fixed VoIP'],
    ['personal', 'Personal'],
    ['tollFree', 'Toll-free'],
    ['premium', 'Premium-rate'],
    ['sharedCost', 'Shared-cost'],
    ['uan', 'Universal Access Number (UAN)'],
    ['voicemail', 'Voicemail'],
    ['pager', 'Pager'],
    ['unknown', 'Unknown'],
  ])('formats %s as %s', (rawValue, label) => {
    expect(phoneLineTypeLabel(rawValue)).toBe(label);
  });

  it('accepts equivalent separators and formats future values safely', () => {
    expect(phoneLineTypeLabel('non_fixed_voip')).toBe('Non-fixed VoIP');
    expect(phoneLineTypeLabel('satellitePhone')).toBe('Satellite Phone');
  });

  it('does not turn missing data into a category', () => {
    expect(phoneLineTypeLabel(null)).toBe('Unavailable');
    expect(phoneLineTypeLabel('   ')).toBe('Unavailable');
  });
});
