import { describe, expect, it } from 'vitest';
import { mergeRiderStatusSnapshot, RIDER_STATUS_RECONCILIATION_INTERVAL_MS } from '@/lib/rider-status-reconciliation';

describe('Rider status reconciliation cadence', () => {
  it('keeps the server fallback bounded instead of polling continuously', () => {
    expect(RIDER_STATUS_RECONCILIATION_INTERVAL_MS).toBe(4_000);
  });

  it('does not let a stale status snapshot pull a live Driver car or route backwards', () => {
    const current = {
      id: 'ride-1',
      status: 'in_progress',
      driverLocation: { lat: 5.612, lng: -0.182 },
      driverBearing: 92,
      driverLocationUpdatedAt: '2026-10-16T21:40:07.000Z',
      driverRouteUpdatedAt: '2026-10-16T21:40:06.000Z',
      driverRoutePoints: [[5.612, -0.182], [5.614, -0.18]],
      routeDistanceKm: 1.2,
      routeDurationMinutes: 4,
      routePhase: 'destination',
      routeTarget: { kind: 'destination', location: { lat: 5.614, lng: -0.18 } },
    };
    const staleServer = {
      ...current,
      status: 'in_progress',
      driverLocation: { lat: 5.603, lng: -0.187 },
      driverBearing: 25,
      driverLocationUpdatedAt: '2026-10-16T21:39:59.000Z',
      driverRouteUpdatedAt: '2026-10-16T21:39:58.000Z',
      driverRoutePoints: [[5.603, -0.187], [5.614, -0.18]],
      routeDistanceKm: 2.8,
      routeDurationMinutes: 9,
    };

    expect(mergeRiderStatusSnapshot(current, staleServer)).toMatchObject({
      driverLocation: current.driverLocation,
      driverBearing: current.driverBearing,
      driverLocationUpdatedAt: current.driverLocationUpdatedAt,
      driverRoutePoints: current.driverRoutePoints,
      driverRouteUpdatedAt: current.driverRouteUpdatedAt,
      routeDistanceKm: current.routeDistanceKm,
      routeDurationMinutes: current.routeDurationMinutes,
    });
  });

  it('uses a newer server route but clears an old route when the trip phase changes', () => {
    const current = {
      id: 'ride-1',
      status: 'driver_arriving',
      driverRouteUpdatedAt: '2026-10-16T21:40:00.000Z',
      driverRoutePoints: [[5.603, -0.187], [5.604, -0.186]],
      routePhase: 'pickup',
      routeTarget: { kind: 'destination', location: { lat: 5.614, lng: -0.18 } },
    };
    const afterTripStart = {
      ...current,
      status: 'in_progress',
      driverRouteUpdatedAt: undefined,
      driverRoutePoints: undefined,
      routePhase: 'destination',
    };
    const newerRoute = {
      ...afterTripStart,
      driverRouteUpdatedAt: '2026-10-16T21:40:04.000Z',
      driverRoutePoints: [[5.606, -0.184], [5.614, -0.18]],
      routeDistanceKm: 1.1,
    };

    expect(mergeRiderStatusSnapshot(current, afterTripStart).driverRoutePoints).toBeUndefined();
    expect(mergeRiderStatusSnapshot(afterTripStart, newerRoute)).toMatchObject({
      driverRouteUpdatedAt: newerRoute.driverRouteUpdatedAt,
      driverRoutePoints: newerRoute.driverRoutePoints,
      routeDistanceKm: 1.1,
    });
  });
});
