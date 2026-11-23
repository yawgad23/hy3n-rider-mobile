import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { riderHomeServiceLayout } from '../lib/rider-home-service-layout';

const home = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
const measurements = {
  platform: 'android', viewportWidth: 430, viewportHeight: 850,
  gridTop: 480, footerHeight: 36, categoryCount: 6,
};

describe('Rider Android pre-booking home layout', () => {
  it('keeps the exact compact Android grid and artwork dimensions', () => {
    expect(riderHomeServiceLayout(measurements)).toEqual({
      cardWidth: '31%', cardMinHeight: 92, artworkWidth: 52, artworkHeight: 34,
    });
    expect(home).toContain('flexDirection: "row", flexWrap: "wrap"');
    expect(home).toContain('width: homeServiceLayout.cardWidth');
    expect(home).toContain('minHeight: homeServiceLayout.cardMinHeight');
  });

  it('does not expand Android cards when the viewport gets taller', () => {
    const compact = riderHomeServiceLayout(measurements);
    expect(riderHomeServiceLayout({ ...measurements, viewportHeight: 1500, viewportWidth: 900 })).toEqual(compact);
    expect(riderHomeServiceLayout({ ...measurements, gridTop: null, footerHeight: null })).toEqual(compact);
    expect(home).toContain('Platform.OS === "android" ? 7 : 10');
    expect(home).toContain('Platform.OS === "android" ? 1 : 3');
  });

  it('keeps the destination-first service selection above the booking flow', () => {
    expect(home).toContain('Choose a HY3N service');
    expect(home).toContain('openLocationSearch("destination")');
    expect(home).toContain('live prices and available Drivers');
  });
});
