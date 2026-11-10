import { describe, expect, it } from 'vitest';
import { bookingMapTimeLabels } from '@/lib/booking-map-presentation';

describe('Rider booking map presentation', () => {
  it('shows nearby Driver pickup time and server-route drop-off clock time', () => {
    expect(bookingMapTimeLabels({
      pickupEtaMinutes: 3.1,
      routeDurationMinutes: 37,
      now: new Date(2026, 9, 3, 6, 26, 0),
    })).toEqual({
      pickup: 'Pickup\n6:30 · 4 min',
      dropoff: 'Drop-off\n7:03',
    });
  });

  it('does not invent a pickup or destination time when authoritative inputs are absent', () => {
    expect(bookingMapTimeLabels({ now: new Date(2026, 9, 3, 6, 26, 0) })).toEqual({
      pickup: 'Pickup\nNearby ETA unavailable',
      dropoff: 'Drop-off\nCalculating',
    });
  });

  it.each([null, undefined, ''])('does not turn absent pickup ETA %s into a false 1-minute estimate', (pickupEtaMinutes) => {
    expect(bookingMapTimeLabels({ pickupEtaMinutes, routeDurationMinutes: 10 }).pickup)
      .toBe('Pickup\nNearby ETA unavailable');
  });
});
