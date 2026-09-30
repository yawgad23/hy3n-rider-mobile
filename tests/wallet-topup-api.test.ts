import { describe, expect, it } from 'vitest';
import { startAuthenticatedWalletTopUp, unwrapWalletTopUpResponse } from '@/lib/wallet-topup-api';

describe('authenticated Rider wallet top-up', () => {
  it('forces a fresh Firebase token and sends it as bearer authorization', async () => {
    let received: RequestInit | undefined;
    const result = await startAuthenticatedWalletTopUp(
      { uid: 'rider-1', getIdToken: async (forceRefresh) => { expect(forceRefresh).toBe(true); return 'fresh-token'; } },
      { riderId: 'rider-1', riderName: 'Rider', momoNumber: '0244000000', momoNetwork: 'mtn-gh', amount: 20 },
      'https://api.example.test',
      (async (_url, init) => {
        received = init;
        return { ok: true, json: async () => ({ result: { data: { json: { success: true, txId: 'wallet-tx' } } } }) } as Response;
      }) as typeof fetch,
    );

    expect(received?.headers).toMatchObject({ Authorization: 'Bearer fresh-token' });
    expect(result.txId).toBe('wallet-tx');
  });

  it('returns the server authorization failure instead of pretending a payment started', () => {
    expect(() => unwrapWalletTopUpResponse({ error: { json: { message: 'Please sign in to continue.' } } }))
      .toThrow('Please sign in to continue.');
  });
});
