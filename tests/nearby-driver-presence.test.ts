import { describe, expect, it } from 'vitest';
import {
  LIVE_DRIVER_LOCATION_MAX_AGE_MS,
  nearbyVehicleFromProfile,
  vehicleServesRideCategory,
} from '../lib/nearby-driver-presence';

const now = Date.parse('2026-09-25T00:00:00.000Z');

const driverProfile = (location: Record<string, unknown>) => ({
  id: 'driver-document-id',
  user_id: 'driver-live-id',
  approval_status: 'approved',
  is_online: true,
  service_type: 'car',
  ride_categories: ['standard'],
  vehicle_make: 'Toyota',
  vehicle_model: 'Vitz',
  vehicle_colour: 'white',
  current_location: location,
});

describe('Rider nearby Driver live movement', () => {
  it('uses each new Driver GPS point as the map marker position and heading', () => {
    const first = nearbyVehicleFromProfile(driverProfile({
      latitude: 5.6037,
      longitude: -0.187,
      heading: 20,
      recorded_at: new Date(now - 5_000).toISOString(),
    }), now);
    const second = nearbyVehicleFromProfile(driverProfile({
      latitude: 5.6049,
      longitude: -0.1854,
      heading: 78,
      recorded_at: new Date(now - 1_000).toISOString(),
    }), now);

    expect(first).toMatchObject({ id: 'driver-live-id', lat: 5.6037, lng: -0.187, heading: 20 });
    expect(second).toMatchObject({ id: 'driver-live-id', lat: 5.6049, lng: -0.1854, heading: 78 });
    expect(second?.lat).not.toBe(first?.lat);
    expect(second?.lng).not.toBe(first?.lng);
    expect(second?.heading).not.toBe(first?.heading);
  });

  it('removes a Driver marker when the last GPS point is stale or missing', () => {
    const stale = driverProfile({
      latitude: 5.6037,
      longitude: -0.187,
      recorded_at: new Date(now - LIVE_DRIVER_LOCATION_MAX_AGE_MS - 1).toISOString(),
    });
    const missingHeartbeat = driverProfile({ latitude: 5.6037, longitude: -0.187 });

    expect(nearbyVehicleFromProfile(stale, now)).toBeNull();
    expect(nearbyVehicleFromProfile(missingHeartbeat, now)).toBeNull();
  });

  it('shows a legacy online Driver profile after a fresh GPS heartbeat', () => {
    const legacyProfile = {
      ...driverProfile({
        latitude: 5.6041,
        longitude: -0.1861,
        recorded_at: new Date(now - 5_000).toISOString(),
      }),
      availability_status: 'online',
    };
    delete (legacyProfile as Record<string, unknown>).is_online;

    expect(nearbyVehicleFromProfile(legacyProfile, now)).toMatchObject({
      id: 'driver-live-id',
      lat: 5.6041,
      lng: -0.1861,
    });
  });

  it('does not show an offline or busy Driver even with a fresh GPS point', () => {
    const offline = {
      ...driverProfile({ latitude: 5.6041, longitude: -0.1861, recorded_at: new Date(now - 5_000).toISOString() }),
      is_online: true,
      availability_status: 'offline',
    };
    const busy = {
      ...driverProfile({ latitude: 5.6041, longitude: -0.1861, recorded_at: new Date(now - 5_000).toISOString() }),
      is_online: true,
      availability_status: 'busy',
    };

    expect(nearbyVehicleFromProfile(offline, now)).toBeNull();
    expect(nearbyVehicleFromProfile(busy, now)).toBeNull();
  });

  it('never exposes pending or rejected Driver applications on the Rider map', () => {
    const location = {
      latitude: 5.6041,
      longitude: -0.1861,
      recorded_at: new Date(now - 5_000).toISOString(),
    };

    expect(nearbyVehicleFromProfile({ ...driverProfile(location), approval_status: 'pending' }, now)).toBeNull();
    expect(nearbyVehicleFromProfile({ ...driverProfile(location), approval_status: 'rejected' }, now)).toBeNull();
    expect(nearbyVehicleFromProfile({ ...driverProfile(location), approval_status: undefined }, now)).toBeNull();
  });

  it('keeps an online legacy Driver visible when last_seen_at is the only fresh heartbeat', () => {
    const legacyPresence = {
      ...driverProfile({ latitude: 5.6041, longitude: -0.1861 }),
      current_location: {},
      location: { latitude: 5.6041, longitude: -0.1861 },
      last_seen_at: new Date(now - 5_000).toISOString(),
    };

    expect(nearbyVehicleFromProfile(legacyPresence, now)).toMatchObject({
      id: 'driver-live-id',
      lat: 5.6041,
      lng: -0.1861,
    });
  });

  it('counts Kantanka vehicles for Comfort but never treats Comfort-only vehicles as Kantanka', () => {
    const kantanka = nearbyVehicleFromProfile({
      ...driverProfile({ latitude: 5.6041, longitude: -0.1861, recorded_at: new Date(now - 5_000).toISOString() }),
      ride_categories: ['kantanka'],
    }, now)!;
    const comfort = nearbyVehicleFromProfile({
      ...driverProfile({ latitude: 5.6041, longitude: -0.1861, recorded_at: new Date(now - 5_000).toISOString() }),
      ride_categories: ['comfort'],
    }, now)!;

    expect(vehicleServesRideCategory(kantanka, 'comfort')).toBe(true);
    expect(vehicleServesRideCategory(kantanka, 'kantanka')).toBe(true);
    expect(vehicleServesRideCategory(kantanka, 'standard')).toBe(false);
    expect(vehicleServesRideCategory(comfort, 'comfort')).toBe(true);
    expect(vehicleServesRideCategory(comfort, 'kantanka')).toBe(false);
  });
});
