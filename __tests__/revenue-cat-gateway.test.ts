import Purchases from 'react-native-purchases';

import { revenueCatGateway } from '../src/services/revenueCatGateway';

jest.mock('../src/config/releaseConfig', () => ({
  getPublicReleaseConfig: () => ({ revenueCatApiKey: 'test-key' }),
}));

const mockPurchases = Purchases as jest.Mocked<typeof Purchases>;

describe('revenueCatGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only logs out once when sign-out requests overlap', async () => {
    await revenueCatGateway.configure('user-1');

    const firstSignOut = revenueCatGateway.signOut();
    const secondSignOut = revenueCatGateway.signOut();

    await expect(Promise.all([firstSignOut, secondSignOut])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(mockPurchases.logOut).toHaveBeenCalledTimes(1);
  });
});
