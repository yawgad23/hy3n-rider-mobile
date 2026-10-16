import { describe, expect, it } from 'vitest';
import { riderBookingRouteDisplay } from '../lib/rider-booking-route-display';

describe('Rider booking route display', () => {
  it('uses the same authoritative distance and duration in every booking summary', () => {
    expect(riderBookingRouteDisplay({
      available: true,
      distanceKm: 15.2,
      durationMinutes: 24.6,
    })).toEqual({
      ready: true,
      distance: '15.2 km',
      duration: '~25 min trip',
      combined: '15.2 km · ~25 min',
    });
  });

  it('does not substitute a device-side estimate while a protected route is loading', () => {
    expect(riderBookingRouteDisplay(undefined)).toEqual({
      ready: false,
      distance: 'Updating route',
      duration: 'Calculating secure route',
      combined: 'Updating secure route',
    });
  });

  it('keeps pending display when a quote lacks valid server route metrics', () => {
    expect(riderBookingRouteDisplay({ available: true, distanceKm: 8.4 })).toMatchObject({
      ready: false,
      combined: 'Updating secure route',
    });
  });
});
