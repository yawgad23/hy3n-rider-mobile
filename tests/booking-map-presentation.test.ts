import { describe, expect, it } from 'vitest';
import { bookingMapTimeLabels } from '@/lib/booking-map-presentation';

describe('Rider booking map presentation', () => {
  it('shows nearby Driver pickup time and server-route drop-off clock time', () => {
    expect(bookingMapTimeLabels({
      pickupEtaMinutes: 3.1,
      routeDurationMinutes: 37,
      now: new Date(2026, 9, 3, 6, 26, 0),
    })).toEqual({
      pickup: 'Pickup\n4 min',
      dropoff: 'Drop-off\n7:03',
    });
  });

  it('does not invent a pickup or destination time when authoritative inputs are absent', () => {
    expect(bookingMapTimeLabels({ now: new Date(2026, 9, 3, 6, 26, 0) })).toEqual({
      pickup: 'Pickup\nFinding Driver',
      dropoff: 'Drop-off\nCalculating',
    });
  });
});
