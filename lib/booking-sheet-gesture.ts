export type BookingSheetSwipe = 'minimize' | 'expand' | null;

const CLAIM_DISTANCE = 8;
const RELEASE_DISTANCE = 22;
const RELEASE_VELOCITY = 0.35;

/** Claim only deliberate vertical gestures so category-list scrolling stays intact. */
export function shouldClaimBookingSheetSwipe(dy: number, dx: number): boolean {
  return Math.abs(dy) >= CLAIM_DISTANCE && Math.abs(dy) > Math.abs(dx) * 1.2;
}

/** Treat a clear distance or a quick vertical flick as a sheet action. */
export function bookingSheetSwipeAction(dy: number, vy: number): BookingSheetSwipe {
  const effectiveVerticalDistance = Math.abs(dy) >= RELEASE_DISTANCE || Math.abs(vy) >= RELEASE_VELOCITY;
  if (!effectiveVerticalDistance) return null;
  return (dy || vy) > 0 ? 'minimize' : 'expand';
}
