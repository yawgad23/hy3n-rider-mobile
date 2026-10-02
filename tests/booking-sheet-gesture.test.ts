import { describe, expect, it } from 'vitest';
import { bookingSheetSwipeAction, shouldClaimBookingSheetSwipe } from '../lib/booking-sheet-gesture';

describe('Rider booking-sheet gestures', () => {
  it('claims deliberate vertical handle swipes but not horizontal drags or taps', () => {
    expect(shouldClaimBookingSheetSwipe(9, 1)).toBe(true);
    expect(shouldClaimBookingSheetSwipe(-12, 2)).toBe(true);
    expect(shouldClaimBookingSheetSwipe(7, 0)).toBe(false);
    expect(shouldClaimBookingSheetSwipe(14, 18)).toBe(false);
  });

  it('maps a downward swipe to minimize and an upward swipe to expand', () => {
    expect(bookingSheetSwipeAction(24, 0)).toBe('minimize');
    expect(bookingSheetSwipeAction(-24, 0)).toBe('expand');
    expect(bookingSheetSwipeAction(4, 0.4)).toBe('minimize');
    expect(bookingSheetSwipeAction(-4, -0.4)).toBe('expand');
  });

  it('does not change sheet state after an ordinary tap or small movement', () => {
    expect(bookingSheetSwipeAction(8, 0.1)).toBeNull();
    expect(bookingSheetSwipeAction(0, 0)).toBeNull();
  });
});
