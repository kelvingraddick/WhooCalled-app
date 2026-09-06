import { spamRiskFor } from './spamRisk';

describe('spamRiskFor', () => {
  it('uses equal 20-point increments for public sources and reports', () => {
    expect(spamRiskFor(1, 0)).toMatchObject({ score: 20, label: 'LOW' });
    expect(spamRiskFor(0, 2)).toMatchObject({
      score: 40,
      label: 'MODERATE',
    });
    expect(spamRiskFor(2, 1)).toMatchObject({ score: 60, label: 'HIGH' });
  });

  it('has no signal at zero and caps five or more signals at 100', () => {
    expect(spamRiskFor(0, 0)).toMatchObject({
      score: 0,
      label: 'NO SIGNAL',
    });
    expect(spamRiskFor(3, 3)).toMatchObject({
      score: 100,
      label: 'VERY HIGH',
    });
  });
});
