import { getDocs, startAfter } from '@react-native-firebase/firestore';

import { getLookupHistoryPage } from '../src/services/lookupHistoryRepository';

const makeDocument = (id: string) => ({
  data: () => ({
    confidenceLabel: 'HIGH',
    confidenceScore: 80,
    displayName: `Caller ${id}`,
    phoneDisplay: `(212) 555-${id.padStart(4, '0')}`,
    spamReportCount: 0,
  }),
  id,
});

describe('lookup history pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns twenty records and uses the final record as the next cursor', async () => {
    const documents = Array.from({ length: 21 }, (_, index) =>
      makeDocument(String(index + 1)),
    );
    (getDocs as jest.Mock).mockResolvedValue({ docs: documents });

    const page = await getLookupHistoryPage('user-a', null);

    expect(page.lookups).toHaveLength(20);
    expect(page.lookups[0].id).toBe('1');
    expect(page.cursor).toBe(documents[19]);
    expect(page.hasMore).toBe(true);
    expect(startAfter).not.toHaveBeenCalled();
  });

  it('starts the next page after the supplied cursor', async () => {
    const cursor = makeDocument('20');
    (getDocs as jest.Mock).mockResolvedValue({ docs: [makeDocument('21')] });

    await getLookupHistoryPage('user-a', cursor);

    expect(startAfter).toHaveBeenCalledWith(cursor);
  });
});
