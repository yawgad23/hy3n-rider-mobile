import { describe, expect, it, vi } from 'vitest';

// The API request helper is intentionally tested without loading the native
// Linking module used by the app-wide OAuth helper.
vi.mock('@/constants/oauth', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

import { requestRiderHistory } from '@/lib/rider-history-api';

describe('Rider protected history API', () => {
  const user = { getIdToken: vi.fn(async () => 'rider-token') };

  it('uses an authenticated, bounded server history route', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      rides: [{ id: 'ride-1' }, null, 'not-a-record'],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(requestRiderHistory(user, 'https://api.example.test/', 999, request)).resolves.toEqual([{ id: 'ride-1' }]);
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/rider/rides/history?limit=50',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer rider-token' } }),
    );
  });

  it('uses a safe screen message instead of server internals when history cannot be read', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'internal detail' }), { status: 503 }));

    await expect(requestRiderHistory(user, 'https://api.example.test', 0, request))
      .rejects.toThrow('Your ride history is temporarily unavailable. Please pull to refresh.');
    const firstUrl = (request.mock.calls as unknown as Array<[string]>)[0]?.[0];
    expect(firstUrl).toContain('?limit=1');
  });
});
