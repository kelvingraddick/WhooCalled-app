import { formatUsPhoneInput, isValidUsPhoneInput } from '../src/utils/phone';

describe('US phone input', () => {
  it('formats a pasted number without retaining non-digit characters', () => {
    expect(formatUsPhoneInput('404.555.1212')).toBe('(404) 555-1212');
  });

  it('formats a pasted US number that includes its country code', () => {
    expect(formatUsPhoneInput('+1 (469) 568-7930')).toBe('(469) 568-7930');
  });

  it('rejects an incomplete number', () => {
    expect(isValidUsPhoneInput('(404) 555-12')).toBe(false);
    expect(isValidUsPhoneInput('(404) 555-1212')).toBe(true);
    expect(isValidUsPhoneInput('+1 (469) 568-7930')).toBe(true);
  });
});
