export type ServerCategoryQuote = {
  category: string;
};

/**
 * The selected category is the only quote required to make the request action
 * usable. Remaining categories can be loaded without holding that action back.
 */
export function prioritizedQuoteCategories(categories: readonly string[], selectedCategory: string): {
  primary: string[];
  background: string[];
} {
  const uniqueCategories = [...new Set(categories.map((category) => String(category).trim()).filter(Boolean))];
  const selected = String(selectedCategory || '').trim();
  const primaryCategory = uniqueCategories.includes(selected) ? selected : uniqueCategories[0];
  return {
    primary: primaryCategory ? [primaryCategory] : [],
    background: uniqueCategories.filter((category) => category !== primaryCategory),
  };
}

export function quoteRecordByCategory<TQuote extends ServerCategoryQuote>(quotes: readonly TQuote[]): Record<string, TQuote> {
  return Object.fromEntries(
    quotes
      .filter((quote) => Boolean(quote?.category))
      .map((quote) => [String(quote.category), quote]),
  ) as Record<string, TQuote>;
}

/** Never remove a confirmed current-route quote while background choices load. */
export function mergeQuoteRecords<TQuote extends ServerCategoryQuote>(
  current: Record<string, TQuote>,
  incoming: readonly TQuote[],
): Record<string, TQuote> {
  return { ...current, ...quoteRecordByCategory(incoming) };
}
