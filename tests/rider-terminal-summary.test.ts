import { describe, expect, it } from 'vitest';
import { buildRiderTerminalSummary } from '../lib/rider-terminal-summary';

describe('buildRiderTerminalSummary', () => {
  const previous = {
    id: 'ride-1',
    firestoreId: 'firestore-ride-1',
    fare: 19,
    waitingFee: 0,
    payment: 'Card via Hubtel',
    paymentId: 'wallet',
    category: 'Comfort',
    pickup: 'Adenta',
    destination: { name: 'School Junction' },
    driverName: 'Kofi',
    driverRating: 4.8,
    driverVehicle: 'Toyota Vitz',
    driverPlate: 'GG 1-26',
    distance: 3.2,
    duration: 12,
  };

  it('keeps only safe, server-authoritative completion values', () => {
    const summary = buildRiderTerminalSummary(previous, {
      id: 'firestore-ride-1',
      status: 'completed',
      final_fare: '27.25',
      waiting_fee: '2.5',
      actual_distance_km: '4.7',
      driver_location: { latitude: 'not-a-number' },
      live_route_metrics: { points: [['bad', null]] },
      driver: { name: '  Kofi   Mensah ', rating: '4.6', plate: 'GT 1234-25' },
    });

    expect(summary).toEqual(expect.objectContaining({
      id: 'ride-1',
      firestoreId: 'firestore-ride-1',
      finalFare: 27,
      waitingFee: 2.5,
      distanceKm: 4.7,
      driverName: 'Kofi Mensah',
      driverRating: 4.6,
      driverPlate: 'GT 1234-25',
    }));
    expect(summary).not.toHaveProperty('driverLocation');
    expect(summary).not.toHaveProperty('driverRoutePoints');
  });

  it('does not throw or emit invalid numeric UI values for malformed completion data', () => {
    expect(() => buildRiderTerminalSummary(previous, {
      id: null,
      final_fare: { unsafe: true },
      waiting_fee: Infinity,
      actual_distance_km: 'invalid',
      destination: { nested: ['not', 'a', 'string'] },
      driver: null,
    })).not.toThrow();

    const summary = buildRiderTerminalSummary(previous, {
      final_fare: 'not-a-number',
      waiting_fee: -9,
      actual_distance_km: -5,
      driver: null,
    });
    expect(summary.finalFare).toBe(19);
    expect(summary.waitingFee).toBe(0);
    expect(summary.distanceKm).toBe(0);
  });
});
