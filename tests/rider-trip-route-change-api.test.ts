import { describe, expect, it, vi } from 'vitest';

const { getIdToken } = vi.hoisted(() => ({ getIdToken: vi.fn(async () => 'rider-token') }));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken } } }));
vi.mock('@/constants/oauth', () => ({ getApiBaseUrl: () => 'https://api.example.test/' }));

import { quoteRiderTripRouteChange, requestRiderTripRouteChange } from '@/lib/rider-trip-route-change-api';

const location = { name: 'Accra Mall', address: 'Tetteh Quarshie', lat: 5.625, lng: -0.173 };

describe('Rider in-trip route-change API', () => {
  it('asks the protected server for the revised fare before a Driver request', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      quote: {
        id: 'quote-1',
        estimated_total: 42,
        estimated_remaining_distance_km: 9.2,
        estimated_remaining_duration_minutes: 21,
        expires_at: '2099-10-16T15:05:00.000Z',
        location,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(quoteRiderTripRouteChange({ rideId: 'ride-1', kind: 'destination', location }, request)).resolves.toMatchObject({
      id: 'quote-1', estimatedTotal: 42, remainingDistanceKm: 9.2, remainingDurationMinutes: 21,
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/rides/ride-1/route-change/quote',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer rider-token' }),
        body: JSON.stringify({ kind: 'destination', location }),
      }),
    );
  });

  it('sends only Rider-confirmed quote identity to the Driver review flow', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ success: true, routeChange: { status: 'pending' } }), { status: 200 }));

    await expect(requestRiderTripRouteChange({ rideId: 'ride-1', kind: 'add_stop', location, quoteId: 'quote-1' }, request))
      .resolves.toEqual({ status: 'pending' });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/rides/ride-1/route-change',
      expect.objectContaining({
        body: JSON.stringify({ kind: 'add_stop', quoteId: 'quote-1', location }),
      }),
    );
  });

  it('does not allow a malformed location to reach the API', async () => {
    const request = vi.fn();
    await expect(quoteRiderTripRouteChange({ rideId: 'ride-1', kind: 'destination', location: { ...location, lat: Number.NaN } }, request))
      .rejects.toThrow('Choose a valid address');
    expect(request).not.toHaveBeenCalled();
  });
});
