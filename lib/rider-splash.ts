/**
 * Keep the native HY3N launch artwork visible long enough to register on both
 * cold and warm opens. This affects presentation only, not authentication or
 * the persisted Rider session.
 */
export const RIDER_SPLASH_MINIMUM_VISIBLE_MS = 900;

export function riderSplashRemainingMs(
  startedAtMs: number,
  currentTimeMs = Date.now(),
): number {
  const elapsedMs = Math.max(0, currentTimeMs - startedAtMs);
  return Math.max(0, RIDER_SPLASH_MINIMUM_VISIBLE_MS - elapsedMs);
}
