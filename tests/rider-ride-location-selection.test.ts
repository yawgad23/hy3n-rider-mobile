import { describe, expect, it } from 'vitest';
import { nextRiderDriverLocation, riderDriverLocationFromRide } from '../lib/rider-driver-location';
import { recoverActiveRide } from '../lib/rider-active-ride-recovery';
import { mergeRiderStatusSnapshot } from '../lib/rider-status-reconciliation';

const a = { lat: 5.6037, lng: -0.187 };
const b = { latitude: 5.612, longitude: -0.182, heading: 90, recorded_at: '2026-11-24T12:00:05.000Z' };
const c = { latitude: 5.613, longitude: -0.182, heading: 0, recorded_at: '2026-11-24T12:00:10.000Z' };
const destination = { name: 'Destination', address: 'Destination', lat: 5.62, lng: -0.182 };
function snapshot(location = b) {
  return {
    id: 'ride-projected-gps', status: 'in_progress', category: 'standard', quoted_fare: 70,
    pickup: { name: 'Pickup', address: 'Pickup', ...a }, destination,
    driver: { id: 'assigned-driver', name: 'Kofi', location: a },
    driver_location: location, driver_location_updated_at: location.recorded_at,
    live_route_metrics: { phase: 'destination', updated_at: location.recorded_at,
      points: [[location.latitude, location.longitude], [destination.lat, destination.lng]],
      distance_km: 1.2, duration_minutes: 4 },
  };
}

describe('Rider ride-scoped live GPS selection', () => {
  it('uses the projected sample instead of the undated acceptance position', () => {
    expect(riderDriverLocationFromRide(snapshot())).toEqual({
      lat: b.latitude, lng: b.longitude, heading: 90, updatedAt: b.recorded_at,
    });
  });

  it('reads flat projected latitude/longitude without a nested Driver identity snapshot', () => {
    expect(riderDriverLocationFromRide({ driver_location: b })).toMatchObject({
      lat: b.latitude, lng: b.longitude, updatedAt: b.recorded_at,
    });
  });

  it('uses the projection timestamp only for that projection when the point lacks its own timestamp', () => {
    expect(riderDriverLocationFromRide({
      driver: { location: a }, driver_location: { lat: b.latitude, lng: b.longitude, heading: 90 },
      driver_location_updated_at: b.recorded_at,
    })).toMatchObject({ lat: b.latitude, lng: b.longitude, updatedAt: b.recorded_at });
  });

  it('never lends an absent/invalid projection timestamp to the nested acceptance sample', () => {
    for (const driver_location of [undefined, { latitude: 91, longitude: 0 }, { lat: 0, lng: 0 }]) {
      const input = { ...snapshot(), driver_location };
      expect(riderDriverLocationFromRide(input)).toEqual({ ...a, heading: null, updatedAt: undefined });
      expect(recoverActiveRide(input)?.driverLocationUpdatedAt).toBeUndefined();
    }
  });

  it('keeps timestamp and heading attached to the selected coordinates, not to another source', () => {
    const input = { ...snapshot(), driver_location_updated_at: c.recorded_at,
      driver: { location: { ...a, heading: 180, recorded_at: '2026-11-24T12:00:01.000Z' } } };
    expect(riderDriverLocationFromRide(input)).toEqual({
      lat: b.latitude, lng: b.longitude, heading: 90, updatedAt: b.recorded_at,
    });
  });

  it('keeps a genuinely newer nested live sample over a delayed projected sample', () => {
    expect(riderDriverLocationFromRide({ ...snapshot(), driver: { location: c } })).toEqual({
      lat: c.latitude, lng: c.longitude, heading: 0, updatedAt: c.recorded_at,
    });
  });

  it('normalizes Firestore timestamps through the existing ordered GPS helper', () => {
    const date = new Date(b.recorded_at);
    expect(riderDriverLocationFromRide({
      driver: { location: a }, driver_location: { latitude: b.latitude, longitude: b.longitude },
      driver_location_updated_at: { toDate: () => date },
    })?.updatedAt).toBe(b.recorded_at);
  });

  it('retains stale/equal-timestamp rejection and allows a same-position heartbeat', () => {
    const latest = { lat: c.latitude, lng: c.longitude };
    expect(riderDriverLocationFromRide(snapshot(b), c.recorded_at, latest)).toBeNull();
    expect(riderDriverLocationFromRide(snapshot(c), c.recorded_at, latest)).toMatchObject(latest);
    expect(riderDriverLocationFromRide({ ...snapshot(c), driver_location: { ...b, recorded_at: c.recorded_at } }, c.recorded_at, latest)).toBeNull();
    expect(riderDriverLocationFromRide({ driver: { location: a } }, c.recorded_at, latest)).toBeNull();
  });

  it('recovery and periodic status reconciliation advance pose and route together without poisoning real GPS', () => {
    const first = recoverActiveRide(snapshot(b))!;
    expect(first).toMatchObject({
      driverLocation: { lat: b.latitude, lng: b.longitude }, driverLocationUpdatedAt: b.recorded_at,
      driverBearing: 90, driverId: 'assigned-driver', driverName: 'Kofi', quotedFare: 70,
    });
    expect(nextRiderDriverLocation(b, first.driverLocationUpdatedAt, first.driverLocation)).not.toBeNull();
    const next = mergeRiderStatusSnapshot(first, recoverActiveRide(snapshot(c))!);
    expect(next.driverLocation).toEqual({ lat: c.latitude, lng: c.longitude });
    expect(next.driverLocationUpdatedAt).toBe(c.recorded_at);
    expect(next.driverRoutePoints?.[0]).toEqual([c.latitude, c.longitude]);
    const delayed = mergeRiderStatusSnapshot(next, recoverActiveRide(snapshot(b))!);
    expect(delayed.driverLocation).toEqual(next.driverLocation);
    expect(delayed.driverLocationUpdatedAt).toBe(c.recorded_at);
    expect(delayed.driverRoutePoints).toEqual(next.driverRoutePoints);
  });
});
