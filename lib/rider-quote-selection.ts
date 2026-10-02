export type RideQuoteSelectionState = {
  available?: boolean;
  quoteId?: string;
};

/**
 * A category with a server-published availability result should acknowledge a
 * Rider's tap immediately. Refreshing the quote must not keep the previous
 * category visually selected.
 */
export function canSelectServerQuotedCategory(quote?: RideQuoteSelectionState): boolean {
  return quote?.available === true;
}

/**
 * Selection is cosmetic until booking. A request remains blocked while a
 * fresh authoritative quote is loading or when there is no usable quote ID.
 */
export function canRequestServerQuotedRide(
  quote: RideQuoteSelectionState | undefined,
  quoteLoading: boolean,
): boolean {
  return !quoteLoading
    && quote?.available === true
    && typeof quote.quoteId === 'string'
    && quote.quoteId.trim().length > 0;
}
