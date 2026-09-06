import { carrierIdentity, normalizeIdentity } from '../src/components/VisualIdentity';

describe('visual identity registry', () => {
  it('normalizes familiar carrier aliases to a bundled mark', () => {
    expect(carrierIdentity('Verizon')).toMatchObject({ label: 'Verizon', mark: 'V' });
    expect(carrierIdentity('T Mobile')).toMatchObject({ label: 'T-Mobile', mark: 'T' });
    expect(carrierIdentity('AT&T')).toMatchObject({ label: 'AT&T', mark: 'AT&T' });
  });

  it('keeps unknown carrier values on the illustrated fallback path', () => {
    expect(carrierIdentity('A future carrier')).toBeNull();
    expect(normalizeIdentity('  T-Mobile, Inc. ')).toBe('tmobileinc');
  });
});
