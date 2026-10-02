import { describe, expect, it } from 'vitest';
import { DriverRatingRequestError, submitAuthenticatedDriverRating } from '@/lib/driver-rating-api';

describe('authenticated Driver rating client', () => {
  it('uses a refreshed Firebase token and sends only rating content', async () => {
    let url = '';
    let request: RequestInit | undefined;
    const result = await submitAuthenticatedDriverRating(
      { getIdToken: async (forceRefresh) => { expect(forceRefresh).toBe(true); return 'fresh-token'; } },
      { rideId: 'ride 1', rating: 5, feedback: 'Great trip', tags: ['Safe Driving'] },
      'https://api.example.test/',
      (async (nextUrl, init) => {
        url = String(nextUrl);
        request = init;
        return { ok: true, json: async () => ({ success: true, rating: 5, driverRating: 4.9, ratingCount: 14 }) } as Response;
      }) as typeof fetch,
    );

    expect(url).toBe('https://api.example.test/api/rides/ride%201/rate-driver');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer fresh-token' });
    expect(JSON.parse(String(request?.body))).toEqual({ rating: 5, feedback: 'Great trip', tags: ['Safe Driving'] });
    expect(result.ratingCount).toBe(14);
  });

  it('returns a server rejection instead of reporting a rating as submitted', async () => {
    await expect(submitAuthenticatedDriverRating(
      { getIdToken: async () => 'token' },
      { rideId: 'ride-1', rating: 5 },
      'https://api.example.test',
      (async () => ({ ok: false, json: async () => ({ success: false, code: 'ride_not_found', message: 'Ride not found.' }) }) as Response) as typeof fetch,
    )).rejects.toEqual(expect.objectContaining({
      name: DriverRatingRequestError.name,
      code: 'ride_not_found',
      message: 'Ride not found.',
    }));
  });
});
