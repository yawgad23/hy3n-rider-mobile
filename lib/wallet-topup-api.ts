export type FirebasePaymentUser = {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

export type WalletTopUpInput = {
  riderId: string;
  riderName: string;
  momoNumber: string;
  momoNetwork: string;
  amount: number;
};

export type WalletTopUpResult = {
  success?: boolean;
  status?: string;
  message?: string;
  reference?: string;
  txId?: string;
  transactionId?: string | null;
};

type TrpcEnvelope = {
  result?: { data?: { json?: WalletTopUpResult } | WalletTopUpResult };
  error?: { json?: { message?: string } };
};

export function unwrapWalletTopUpResponse(payload: unknown): WalletTopUpResult {
  const response = (payload && typeof payload === 'object' ? payload : {}) as TrpcEnvelope;
  const data = response.result?.data;
  if (data && typeof data === 'object' && 'json' in data) {
    return (data as { json?: WalletTopUpResult }).json || {};
  }
  if (data && typeof data === 'object') return data as WalletTopUpResult;
  throw new Error(response.error?.json?.message || 'Wallet top-up could not be started. Please try again.');
}

/**
 * Sends a Rider wallet top-up with a freshly minted Firebase ID token.
 * This avoids relying on a stale auth singleton in a long-running native app.
 */
export async function startAuthenticatedWalletTopUp(
  user: FirebasePaymentUser,
  input: WalletTopUpInput,
  apiBaseUrl: string,
  request: typeof fetch = fetch,
): Promise<WalletTopUpResult> {
  const token = await user.getIdToken(true);
  if (!token) throw new Error('Your sign-in session has expired. Please sign in again before topping up.');

  const response = await request(`${apiBaseUrl.replace(/\/$/, '')}/api/trpc/wallet.topup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
  });
  const payload = await response.json().catch(() => null);
  const result = unwrapWalletTopUpResponse(payload);
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Wallet top-up could not be started. Please try again.');
  }
  return result;
}
