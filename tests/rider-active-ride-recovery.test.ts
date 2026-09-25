import { describe, expect, it } from 'vitest';
import { recoverActiveRide, recoverActiveRides } from '../lib/rider-active-ride-recovery';

const activeRide = {
  id: 'ride-active-123',
  status: 'in_progress',
  category: 'standard',
  pickup: { name: 'Accra Mall', address: 'Accra Mall', lat: 5.605, lng: -0.174 },
  destination: { name: 'Airport', address: 'Kotoka Airport', lat: 5.607, lng: -0.171 },
  distance_km: 8.6,
  duration_minutes: 26,
  quoted_fare: 70,
  payment_method: 'cash',
  pickup_code: '9593',
  driver: {
    id: 'driver-123',
    name: 'Kofi',
    photo_url: 'https://cdn.example.com/drivers/kofi.jpg',
    vehicle_make: 'Toyota',
    vehicle_model: 'Vitz',
    vehicle_colour: 'White',
    plate: 'GG 1-26',
    location: { lat: 5.604, lng: -0.175, heading: 0, recorded_at: '2026-09-25T01:40:00.000Z' },
  },
};

describe('Rider active ride relaunch recovery', () => {
  it('rebuilds an in-progress trip from the authoritative ride document', () => {
    expect(recoverActiveRide(activeRide)).toMatchObject({
      id: 'ride-active-123',
      firestoreId: 'ride-active-123',
      status: 'in_progress',
      pickup: 'Accra Mall',
      destination: { name: 'Airport', lat: 5.607, lng: -0.171 },
      driverName: 'Kofi',
      driverPhoto: 'https://cdn.example.com/drivers/kofi.jpg',
      driverVehicle: 'Toyota Vitz',
      driverBearing: 0,
      ridePin: '9593',
    });
  });

  it('does not revive completed or cancelled rides after relaunch', () => {
    expect(recoverActiveRide({ ...activeRide, status: 'completed' })).toBeNull();
    expect(recoverActiveRide({ ...activeRide, status: 'cancelled' })).toBeNull();
  });

  it('deduplicates the recovered active ride list by ride id', () => {
    const restored = recoverActiveRides([activeRide, { ...activeRide, status: 'driver_arriving' }]);
    expect(restored).toHaveLength(1);
    expect(restored[0].status).toBe('driver_arriving');
  });
});
