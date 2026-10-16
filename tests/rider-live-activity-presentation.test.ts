import { describe, expect, it } from 'vitest';
import {
  riderLiveActivityEligible,
  riderLiveActivityPresentation,
  riderLiveTripProgress,
} from '@/lib/rider-live-activity-presentation';

describe('Rider Live Activity presentation', () => {
  const ride = {
    id: 'ride-1',
    status: 'driver_arriving' as const,
    driverName: 'Kofi',
    pickupLocation: { name: 'Airport Junction' },
    destination: { name: 'Accra Mall' },
    routeDurationMinutes: 7,
    distance: 10,
  };

  it('shows a native pickup countdown with HY3N trip context', () => {
    expect(riderLiveActivityPresentation(ride, 1_000)).toEqual({
      title: 'Pickup in 7 min',
      subtitle: 'Kofi is heading to your pickup',
      etaMinutes: 7,
      arrivalAt: 421_000,
      progress: 0,
    });
  });

  it('moves the HY3N car only when server remaining distance decreases', () => {
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: 10,
    })).toBe(0);
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: 6,
    })).toBeCloseTo(0.4, 5);
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: 2,
    }, 0.4)).toBeCloseTo(0.8, 5);
  });

  it('does not reach the end early or jump backward when a route refresh is stale', () => {
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: 0,
    }, 0.8)).toBe(0.98);
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: 7,
    }, 0.8)).toBe(0.8);
    expect(riderLiveTripProgress({
      status: 'in_progress', distance: 10, routePhase: 'destination', routeDistanceKm: undefined,
    }, 0.8)).toBe(0.8);
  });

  it('changes to destination wording and carries numeric display progress once the trip starts', () => {
    expect(riderLiveActivityPresentation({
      ...ride,
      status: 'in_progress',
      routePhase: 'destination',
      routeDistanceKm: 5,
    }, 1_000)).toMatchObject({
      title: 'Drop-off at 00:07',
      subtitle: 'Heading to Accra Mall',
      progress: 0.5,
    });
  });

  it('does not fill the destination line while the Driver is waiting at pickup', () => {
    expect(riderLiveActivityPresentation({ ...ride, status: 'driver_arrived' }, 1_000).progress).toBe(0);
  });

  it('never starts a Live Activity while a request is merely searching', () => {
    expect(riderLiveActivityEligible('searching')).toBe(false);
    expect(riderLiveActivityEligible('driver_arriving')).toBe(true);
    expect(riderLiveActivityEligible('in_progress')).toBe(true);
  });
});
