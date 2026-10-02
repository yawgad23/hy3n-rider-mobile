import { describe, expect, it } from 'vitest';
import {
  canRequestServerQuotedRide,
  canSelectServerQuotedCategory,
  isServerQuoteCurrent,
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

  it('keeps a current coordinate quote valid when only a pickup label changes', () => {
    const currentRoute = '5.60000,-0.19000|5.70000,-0.18000|';
    expect(isServerQuoteCurrent(currentRoute, currentRoute)).toBe(true);
    expect(isServerQuoteCurrent(currentRoute, '5.60001,-0.19000|5.70000,-0.18000|')).toBe(false);
    expect(isServerQuoteCurrent(currentRoute, null)).toBe(false);
  });
});
