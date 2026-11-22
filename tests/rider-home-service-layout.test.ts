import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { riderHomeServiceLayout } from '../lib/rider-home-service-layout';

const phone = {
  platform: 'ios', viewportWidth: 430, viewportHeight: 850,
  gridTop: 480, footerHeight: 36, categoryCount: 6,
};
const home = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
const idleHome = home.slice(home.indexOf('  const renderAddressFirstHome = () => ('), home.indexOf('  const canSwipeBookingSheet'));

describe('iOS-only Home service sizing', () => {
  it('uses the otherwise blank phone viewport for the category rows', () => {
    const layout = riderHomeServiceLayout(phone);
    expect(layout.cardMinHeight).toBeGreaterThan(112);
    const contentEnd = phone.gridTop + layout.cardMinHeight * 2 + 8 + phone.footerHeight + 6 + 24;
    expect(contentEnd).toBeCloseTo(phone.viewportHeight);
    expect(layout.artworkWidth).toBeGreaterThan(62);
    expect(layout.artworkHeight).toBeGreaterThan(46);
  });

  it('fills a larger iPhone viewport while keeping three cards on each row', () => {
    const largePhone = { ...phone, viewportWidth: 440, viewportHeight: 900, gridTop: 485 };
    const layout = riderHomeServiceLayout(largePhone);
    expect(layout.cardMinHeight).toBeGreaterThan(riderHomeServiceLayout(phone).cardMinHeight);
    expect(typeof layout.cardWidth).toBe('number');
    expect(Number(layout.cardWidth) * 3 + 8 * 2).toBeLessThanOrEqual(largePhone.viewportWidth - 40);
  });

  it('preserves a usable minimum on small screens instead of shrinking/clipping cards', () => {
    const layout = riderHomeServiceLayout({ ...phone, viewportWidth: 320, viewportHeight: 568 });
    expect(layout.cardMinHeight).toBe(112);
    expect(Number(layout.cardWidth) * 3 + 16).toBeLessThanOrEqual(320 - 40);
    expect(layout.artworkWidth).toBeLessThanOrEqual(Number(layout.cardWidth) - 26);
    expect(idleHome).toContain('<ScrollView');
    expect(idleHome).not.toContain('scrollEnabled={false}');
    expect(idleHome).not.toContain('height: homeServiceLayout.cardMinHeight');
    expect(idleHome).toContain('minHeight: homeServiceLayout.cardMinHeight');
  });

  it('accounts for longer footer text rather than pushing it under the tab bar', () => {
    const longerFooter = { ...phone, footerHeight: 72 };
    const layout = riderHomeServiceLayout(longerFooter);
    expect(layout.cardMinHeight).toBeLessThan(riderHomeServiceLayout(phone).cardMinHeight);
    const end = longerFooter.gridTop + layout.cardMinHeight * 2 + 8 + longerFooter.footerHeight + 6 + 24;
    expect(end).toBeCloseTo(longerFooter.viewportHeight);
  });

  it('recalculates after header/text/saved-place height changes', () => {
    const tallerHeader = { ...phone, gridTop: phone.gridTop + 40 };
    expect(riderHomeServiceLayout(tallerHeader).cardMinHeight).toBeLessThan(riderHomeServiceLayout(phone).cardMinHeight);
  });

  it('keeps natural scrolling for landscape and never uses whole-screen/tab-bar estimates', () => {
    const landscape = { ...phone, viewportWidth: 850, viewportHeight: 350, gridTop: 280 };
    expect(riderHomeServiceLayout(landscape).cardMinHeight).toBe(112);
    expect(idleHome).toContain('setIosHomeViewport');
    expect(idleHome).toContain('setIosHomeGridTop(layout.y)');
    expect(idleHome).toContain('setIosHomeFooterHeight(layout.height)');
    expect(idleHome).not.toContain('SCREEN_HEIGHT');
    expect(idleHome).not.toContain('insets.bottom');
  });

  it('caps iPad card/artwork sizes rather than producing giant stretched cards', () => {
    const layout = riderHomeServiceLayout({ ...phone, viewportWidth: 1024, viewportHeight: 1300 });
    expect(layout.cardMinHeight).toBe(220);
    expect(layout.artworkWidth).toBe(150);
    expect(layout.artworkHeight).toBe(110);
  });

  it('contains artwork in narrow iPad split-screen widths', () => {
    const layout = riderHomeServiceLayout({ ...phone, viewportWidth: 280 });
    expect(layout.artworkWidth).toBeGreaterThan(0);
    expect(layout.artworkWidth).toBeLessThanOrEqual(Number(layout.cardWidth) - 26);
  });

  it.each([
    { viewportHeight: 0 }, { viewportHeight: Number.NaN },
    { gridTop: null }, { gridTop: -1 },
    { footerHeight: null }, { footerHeight: Number.NaN },
  ])('falls back safely before valid layout measurements: %j', (invalid) => {
    expect(riderHomeServiceLayout({ ...phone, ...invalid }).cardMinHeight).toBe(112);
  });

  it('handles category-count changes and an empty list without dividing by zero', () => {
    expect(Number.isFinite(riderHomeServiceLayout({ ...phone, categoryCount: 0 }).cardMinHeight)).toBe(true);
    const moreRows = riderHomeServiceLayout({ ...phone, categoryCount: 9 });
    expect(moreRows.cardMinHeight).toBe(112);
  });

  it('keeps web dimensions untouched', () => {
    expect(riderHomeServiceLayout({ ...phone, platform: 'web' })).toEqual({
      cardWidth: '31%', cardMinHeight: 112, artworkWidth: 62, artworkHeight: 46,
    });
  });

  it('only registers layout measurements on iOS and lets iOS category text grow', () => {
    expect((idleHome.match(/onLayout=\{Platform.OS === "ios"/g) || [])).toHaveLength(3);
    expect(idleHome).toContain('numberOfLines={Platform.OS === "ios" ? undefined : 2}');
    expect(idleHome).toContain('numberOfLines={Platform.OS === "ios" ? undefined : 1}');
    expect(idleHome).toContain('resizeMode="contain"');
  });

  it('preserves automatic system theme colors rather than adding a hardcoded theme', () => {
    expect(home).toContain('const colors = useColors();');
    expect(home).toContain('const BG = colors.background;');
    expect(home).toContain('const CARD = colors.card;');
    expect(idleHome).toContain('backgroundColor: BG');
    expect(idleHome).toContain('color: TEXT');
  });
});
