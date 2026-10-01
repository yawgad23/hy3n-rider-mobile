import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCompletedRideSnapshot } from '../lib/rider-terminal-ride';

const riding = {
  id: 'ride-1',
  status: 'in_progress',
  quotedFare: 19,
  currentFare: 19,
  finalFare: undefined as number | undefined,
  waitingFee: 0,
  actualDistanceKm: 2,
  driverLocation: { lat: 5.61, lng: -0.19 },
  driverRoutePoints: [[5.61, -0.19], [5.62, -0.20]] as [number, number][],
  routeDistanceKm: 2.1,
  routeDurationMinutes: 8,
  routePhase: 'destination' as const,
  driverStoppedAt: 1234,
  safetySignal: 'long_stop',
  sharingActive: true,
  shareExpiresAt: '2026-10-01T15:00:00Z',
  driverName: 'Driver',
  driverId: 'driver-1',
};

describe('Rider terminal snapshot', () => {
  it('returns before the live GPS and nested React-state updates on completion', () => {
    const screen = readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
    const start = screen.indexOf('dispatchService.listenToRide(trackedRide.firestoreId!');
    const completionGuard = screen.indexOf("if (ride.status === 'completed') {", start);
    const liveDriverParsing = screen.indexOf('const rawRide = ride as any;', start);
    const nestedUpdate = screen.indexOf('setDriverLocation(nextDriverLocation);', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(completionGuard).toBeGreaterThan(start);
    expect(completionGuard).toBeLessThan(liveDriverParsing);
    expect(completionGuard).toBeLessThan(nestedUpdate);
    expect(screen.slice(completionGuard, liveDriverParsing)).toContain('return applyCompletedRideSnapshot');
  });

  it('uses the server final fare and clears only ephemeral tracking state', () => {
    const completed = applyCompletedRideSnapshot(riding, {
      status: 'completed',
      final_fare: 22,
      quoted_fare: 19,
      waiting_fee: 3,
      actual_distance_km: 2.5,
      driver: null,
      live_route_metrics: null,
    });
    expect(completed).toMatchObject({
      status: 'completed', finalFare: 22, currentFare: 22, quotedFare: 19,
      waitingFee: 3, actualDistanceKm: 2.5,
      driverName: 'Driver', driverId: 'driver-1', sharingActive: false,
    });
    expect(completed.driverLocation).toBeUndefined();
    expect(completed.driverRoutePoints).toBeUndefined();
    expect(completed.routeDistanceKm).toBeUndefined();
    expect(completed.routeDurationMinutes).toBeUndefined();
    expect(completed.routePhase).toBeUndefined();
    expect(riding.status).toBe('in_progress');
    expect(riding.driverLocation).toBeDefined();
  });

  it('handles missing optional settlement fields without invoking the live GPS path', () => {
    const completed = applyCompletedRideSnapshot(riding, {
      status: 'completed', quoted_fare: 19, final_fare: 19,
      driver: { location: null }, live_route_metrics: { points: null },
    });
    expect(completed.finalFare).toBe(19);
    expect(completed.waitingFee).toBe(0);
    expect(completed.actualDistanceKm).toBe(2);
    expect(completed.driverLocation).toBeUndefined();
  });

  it('normalizes legacy numeric strings and rejects invalid optional fees', () => {
    const legacy = { ...riding, waitingFee: 'invalid' as unknown as number };
    const completed = applyCompletedRideSnapshot(legacy, {
      status: 'completed', quoted_fare: 19, final_fare: '19',
      waiting_fee: 'invalid', trip_meter: { distance_km: '2.75' },
    });
    expect(completed.finalFare).toBe(19);
    expect(completed.waitingFee).toBe(0);
    expect(completed.actualDistanceKm).toBe(2.75);
    expect(() => completed.waitingFee.toFixed(2)).not.toThrow();
  });

  it('is idempotent when a completed ride receives a later receipt/rating snapshot', () => {
    const first = applyCompletedRideSnapshot(riding, {
      status: 'completed', quoted_fare: 19, final_fare: 19,
    });
    const second = applyCompletedRideSnapshot(first, {
      status: 'completed', quoted_fare: 19, final_fare: 19,
      receipt_status: 'sent', rider_rating: 5,
    });
    expect(second).toMatchObject({ status: 'completed', finalFare: 19, driverId: 'driver-1' });
    expect(second.driverLocation).toBeUndefined();
  });
});
