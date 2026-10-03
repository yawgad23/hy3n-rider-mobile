import { describe, expect, it } from 'vitest';
import {
  mergeQuoteRecords,
  prioritizedQuoteCategories,
  quoteRecordByCategory,
} from '../lib/rider-quote-priority';

describe('Rider quote priority', () => {
  it('loads the selected category before background category comparisons', () => {
    expect(prioritizedQuoteCategories(['standard', 'comfort', 'okada'], 'comfort')).toEqual({
      primary: ['comfort'],
      background: ['standard', 'okada'],
    });
  });

  it('uses the first valid category if a stale selection is no longer supported', () => {
    expect(prioritizedQuoteCategories(['standard', 'comfort'], 'missing')).toEqual({
      primary: ['standard'],
      background: ['comfort'],
    });
  });

  it('merges background quotes without replacing a ready selected quote', () => {
    const selected = quoteRecordByCategory([{ category: 'standard', quoteId: 'standard-quote' }]);
    expect(mergeQuoteRecords(selected, [{ category: 'comfort', quoteId: 'comfort-quote' }])).toEqual({
      standard: { category: 'standard', quoteId: 'standard-quote' },
      comfort: { category: 'comfort', quoteId: 'comfort-quote' },
    });
  });
});
