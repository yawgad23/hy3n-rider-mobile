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

  it('hides both time callouts when there is no nearby Driver', () => {
    expect(bookingMapTimeLabels({
      routeDurationMinutes: 37,
      now: new Date(2026, 9, 3, 6, 26, 0),
    })).toEqual({ pickup: null, dropoff: null });
  });

  it('hides both time callouts until the server route duration is ready', () => {
    expect(bookingMapTimeLabels({
      pickupEtaMinutes: 3,
      now: new Date(2026, 9, 3, 6, 26, 0),
    })).toEqual({ pickup: null, dropoff: null });
  });

  it.each([null, undefined, ''])('hides both callouts when pickup ETA %s is absent', (pickupEtaMinutes) => {
    expect(bookingMapTimeLabels({ pickupEtaMinutes, routeDurationMinutes: 10 }))
      .toEqual({ pickup: null, dropoff: null });
  });

  it.each([null, undefined, ''])('hides both callouts when route duration %s is absent', (routeDurationMinutes) => {
    expect(bookingMapTimeLabels({ pickupEtaMinutes: 3, routeDurationMinutes }))
      .toEqual({ pickup: null, dropoff: null });
  });
});
