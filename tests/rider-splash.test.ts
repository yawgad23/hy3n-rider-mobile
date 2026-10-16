import { describe, expect, it } from 'vitest';
import {
  RIDER_SPLASH_MINIMUM_VISIBLE_MS,
  riderSplashRemainingMs,
} from '../lib/rider-splash';

describe('Rider native splash presentation', () => {
  it('keeps the HY3N launch artwork visible for the minimum presentation window', () => {
    expect(riderSplashRemainingMs(1_000, 1_000)).toBe(RIDER_SPLASH_MINIMUM_VISIBLE_MS);
    expect(riderSplashRemainingMs(1_000, 1_400)).toBe(RIDER_SPLASH_MINIMUM_VISIBLE_MS - 400);
  });

  it('does not delay the authenticated Home screen once the splash window has elapsed', () => {
    expect(riderSplashRemainingMs(1_000, 1_000 + RIDER_SPLASH_MINIMUM_VISIBLE_MS)).toBe(0);
    expect(riderSplashRemainingMs(1_000, 9_000)).toBe(0);
  });

  it('handles an unexpected backwards device clock without shortening the splash', () => {
    expect(riderSplashRemainingMs(1_000, 500)).toBe(RIDER_SPLASH_MINIMUM_VISIBLE_MS);
  });
});
