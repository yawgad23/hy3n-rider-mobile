import { describe, it, expect } from 'vitest';
import { riderDisplayedRoute, riderLiveRouteIsCurrent, riderRemainingLiveRoute, riderLiveRouteIsFresh } from '../lib/rider-live-route-display';
import { recoverActiveRide } from '../lib/rider-active-ride-recovery';
import { mergeRiderStatusSnapshot } from '../lib/rider-status-reconciliation';
const route: [number, number][] = [[5.7, -0.1], [5.704, -0.1], [5.704, -0.096]];
const target = { lat: 5.704, lng: -0.096 };

describe('Rider live route display authority', () => {
  it('never falls back to the booking preview for any tracked status', () => {
    for (const status of ['matched', 'driver_arriving', 'driver_arrived', 'in_progress']) {
      expect(riderDisplayedRoute({ status, bookingRoutePoints: route }, route)).toEqual([]);
      expect(riderDisplayedRoute({ status, bookingRoutePoints: route, driverRoutePoints: route })).toBe(route);
    }
    expect(riderDisplayedRoute({ status: 'searching', bookingRoutePoints: route })).toBe(route);
    expect(riderDisplayedRoute(null, route)).toBe(route);
  });
  it('requires both the phase and current target identity', () => {
    const live = { phase: 'destination', target_key: '5.70400:-0.09600', points: route };
    expect(riderLiveRouteIsCurrent(live, 'in_progress', target)).toBe(true);
    expect(riderLiveRouteIsCurrent(live, 'matched', target)).toBe(false);
    expect(riderLiveRouteIsCurrent(live, 'in_progress', { lat: 5.73, lng: -0.1 })).toBe(false);
  });
  it('supports legacy server routes only if they end near the current destination', () => {
    const live = { phase: 'destination', points: route };
    expect(riderLiveRouteIsCurrent(live, 'in_progress', target)).toBe(true);
    expect(riderLiveRouteIsCurrent(live, 'in_progress', { lat: 5.73, lng: -0.1 })).toBe(false);
    expect(riderLiveRouteIsCurrent({ phase: 'destination', points: [] }, 'in_progress', target)).toBe(false);
  });
  it('removes passed roads, hides disconnected lines, and preserves an explicit full overview', () => {
    const point: [number, number] = [5.702, -0.1];
    expect(riderRemainingLiveRoute(point, route)).toEqual([point, route[1], route[2]]);
    expect(riderRemainingLiveRoute(point, route, true)).toBe(route);
    expect(riderRemainingLiveRoute([5.702, -0.103], route)).toEqual([]);
  });
  it('does not label an expired, missing, malformed, or future route as fresh', () => {
    const now = Date.parse('2026-10-17T00:00:00Z');
    expect(riderLiveRouteIsFresh(new Date(now - 44_999).toISOString(), now)).toBe(true);
    expect(riderLiveRouteIsFresh(new Date(now - 45_001).toISOString(), now)).toBe(false);
    expect(riderLiveRouteIsFresh(new Date(now + 10_000).toISOString(), now)).toBe(false);
    expect(riderLiveRouteIsFresh(null, now)).toBe(false);
    expect(riderLiveRouteIsFresh('bad', now)).toBe(false);
  });
  it('relaunch cannot restore pickup-phase geometry during a destination trip', () => {
    const restored = recoverActiveRide({ id: 'ride', status: 'in_progress', pickup: { lat: 5.7, lng: -0.1 }, destination: target,
      live_route_metrics: { phase: 'pickup', points: route }, booking_route_points: route });
    expect(restored?.driverRoutePoints).toBeUndefined();
    expect(riderDisplayedRoute(restored)).toEqual([]);
  });
  it('does not keep an old route after the destination changes without route_target', () => {
    const current = { status: 'in_progress', destination: target, driverRoutePoints: route, driverRouteUpdatedAt: '2026-10-17T00:00:00Z' };
    const server = { status: 'in_progress', destination: { lat: 5.73, lng: -0.1 }, driverRoutePoints: undefined, driverRouteUpdatedAt: undefined };
    expect(mergeRiderStatusSnapshot(current, server).driverRoutePoints).toBeUndefined();
  });
});
