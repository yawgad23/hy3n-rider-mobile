import { describe, expect, it } from 'vitest';
import {
  AuthoritativeQuoteRequestError,
  requestAuthoritativeRideQuotes,
} from '../lib/rider-quote-request';

const body = { categories: ['standard'], pickup: { lat: 5.6, lng: -0.18 }, destination: { lat: 5.61, lng: -0.17 } };

const response = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('authoritative Rider quote request', () => {
  it('retries exactly once with a forced Firebase token refresh after an authorization rejection', async () => {
    const tokenCalls: boolean[] = [];
    const authorizationHeaders: string[] = [];
    let calls = 0;

    const quotes = await requestAuthoritativeRideQuotes<{ category: string }>({
      baseUrl: 'https://api.example.test/',
      body,
      getIdToken: async (forceRefresh) => {
        tokenCalls.push(Boolean(forceRefresh));
        return forceRefresh ? 'renewed-token' : 'stale-token';
      },
      fetchImpl: async (_url, init) => {
        authorizationHeaders.push(String((init?.headers as Record<string, string>)?.Authorization));
        calls += 1;
        return calls === 1
          ? response(401, { success: false, message: 'Your session has expired.' })
          : response(200, { success: true, quotes: [{ category: 'standard' }] });
      },
    });

    expect(quotes).toEqual([{ category: 'standard' }]);
    expect(tokenCalls).toEqual([false, true]);
    expect(authorizationHeaders).toEqual(['Bearer stale-token', 'Bearer renewed-token']);
  });

  it('does not retry a route or provider failure that may already have created quote snapshots', async () => {
    const getIdToken = async () => 'valid-token';
    let calls = 0;

    await expect(requestAuthoritativeRideQuotes({
      baseUrl: 'https://api.example.test',
      body,
      getIdToken,
      fetchImpl: async () => {
        calls += 1;
        return response(503, { success: false, message: 'Route guidance is temporarily unavailable. Please try again.' });
      },
    })).rejects.toMatchObject({
      message: 'Route guidance is temporarily unavailable. Please try again.',
    });

    expect(calls).toBe(1);
  });

  it('uses a friendly failure when the session cannot produce a token', async () => {
    await expect(requestAuthoritativeRideQuotes({
      baseUrl: 'https://api.example.test',
      body,
      getIdToken: async () => null,
      fetchImpl: async () => response(200, { success: true, quotes: [] }),
    })).rejects.toMatchObject({
      message: 'Please sign in again to update fares.',
    });
  });
});
