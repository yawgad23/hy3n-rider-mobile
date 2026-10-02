import { describe, expect, it } from 'vitest';
import {
  canRequestServerQuotedRide,
  canSelectServerQuotedCategory,
} from '../lib/rider-quote-selection';

describe('Rider server quote selection', () => {
  it('moves visual selection immediately for an available category while its quote refreshes', () => {
    const quote = { available: true, quoteId: 'quote-comfort-123' };

    expect(canSelectServerQuotedCategory(quote)).toBe(true);
    expect(canRequestServerQuotedRide(quote, true)).toBe(false);
  });

  it('does not allow unavailable categories to be selected', () => {
    expect(canSelectServerQuotedCategory({ available: false, quoteId: 'quote-unavailable' })).toBe(false);
    expect(canSelectServerQuotedCategory(undefined)).toBe(false);
  });

  it('only enables requesting when a non-empty authoritative quote is ready', () => {
    expect(canRequestServerQuotedRide({ available: true, quoteId: 'quote-ready' }, false)).toBe(true);
    expect(canRequestServerQuotedRide({ available: true, quoteId: '' }, false)).toBe(false);
    expect(canRequestServerQuotedRide({ available: true }, false)).toBe(false);
    expect(canRequestServerQuotedRide({ available: false, quoteId: 'quote-unavailable' }, false)).toBe(false);
  });
});
