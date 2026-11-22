interface RiderHomeServiceLayoutInput {
  platform: string;
  // Measure the Home viewport, not the entire screen: the navigator already
  // excludes the tab bar. gridTop includes the actual safe-area/header layout.
  viewportWidth: number;
  viewportHeight: number;
  gridTop: number | null;
  footerHeight: number | null;
  categoryCount: number;
}

export function riderHomeServiceLayout(input: RiderHomeServiceLayoutInput) {
  // Android keeps its exact existing compact sizes and natural scrolling.
  // Web also retains the original natural layout rather than imitating iOS.
  if (input.platform !== 'ios') {
    const android = input.platform === 'android';
    return {
      cardWidth: '31%' as const,
      cardMinHeight: android ? 92 : 112,
      artworkWidth: android ? 52 : 62,
      artworkHeight: android ? 34 : 46,
    };
  }

  const columns = 3;
  const gap = 8;
  const horizontalPadding = 20;
  const bottomPadding = 24;
  const footerMarginTop = 6;
  const rows = Math.ceil(Math.max(0, input.categoryCount) / columns);
  const measuredWidth = Number.isFinite(input.viewportWidth) && input.viewportWidth > 0;
  const cardWidth = measuredWidth
    ? Math.max(1, Math.floor((input.viewportWidth - horizontalPadding * 2 - gap * (columns - 1)) / columns))
    : '31%' as const;
  const measuredHeight = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0
    && input.gridTop !== null && Number.isFinite(input.gridTop) && input.gridTop >= 0
    && input.footerHeight !== null && Number.isFinite(input.footerHeight) && input.footerHeight >= 0;

  // Expand the two service rows into unused iPhone space, not an empty spacer
  // beneath them. Keep a sensible maximum on iPad/landscape and a minimum for
  // small screens. minHeight (not fixed height) lets larger text grow/scroll.
  const maximumHeight = typeof cardWidth === 'number' ? Math.min(220, Math.max(112, cardWidth * 1.65)) : 112;
  const availableHeight = measuredHeight && rows > 0
    ? (input.viewportHeight - input.gridTop! - input.footerHeight! - footerMarginTop
      - bottomPadding - gap * (rows - 1)) / rows
    : 112;
  const cardMinHeight = Math.max(112, Math.min(maximumHeight, availableHeight));
  const artworkWidth = typeof cardWidth === 'number' ? Math.min(150, Math.max(1, cardWidth - 26)) : 62;
  const artworkHeight = Math.min(110, Math.max(46, cardMinHeight * 0.5));

  return { cardWidth, cardMinHeight, artworkWidth, artworkHeight };
}
