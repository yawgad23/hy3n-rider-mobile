import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import { getApiBaseUrl } from '@/constants/oauth';

export type CardCheckoutPurpose = 'ride_quote' | 'wallet_top_up';
export type CardCheckoutStatus = 'completed' | 'processing' | 'failed';

export interface CardCheckoutResult {
  status: CardCheckoutStatus;
  transactionId: string;
  amount?: number;
  message?: string;
}

interface StartCardCheckoutInput {
  idToken: string;
  amount: number;
  purpose: CardCheckoutPurpose;
  description: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Card checkout is unavailable right now.');
  }
  return payload;
}

async function wait(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function confirmHubtelCardCheckout(idToken: string, transactionId: string): Promise<CardCheckoutResult> {
  const payload = await requestJson(
    `${getApiBaseUrl()}/api/wallet/card-checkout/${encodeURIComponent(transactionId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  const status = payload.status === 'completed' || payload.status === 'failed'
    ? payload.status as CardCheckoutStatus
    : 'processing';
  return {
    status,
    transactionId: String(payload.transactionId || transactionId),
    amount: Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : undefined,
    message: typeof payload.message === 'string' ? payload.message : undefined,
  };
}

/**
 * Starts a one-time Hubtel hosted checkout. Card number, expiry, CVV and Hubtel
 * merchant credentials never pass through this app. The function resolves only
 * after the returned checkout is confirmed, fails, or remains pending.
 */
export async function payWithHubtelCard(input: StartCardCheckoutInput): Promise<CardCheckoutResult> {
  const started = await requestJson(`${getApiBaseUrl()}/api/wallet/card-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.idToken}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      purpose: input.purpose,
      description: input.description,
    }),
  });

  const transactionId = String(started.transactionId || '');
  const checkoutUrl = String(started.checkoutUrl || '');
  if (!transactionId || !/^https:\/\//i.test(checkoutUrl)) {
    throw new Error('Hubtel did not return a secure card checkout session.');
  }

  if (Platform.OS === 'web') {
    await Linking.openURL(checkoutUrl);
  } else {
    await WebBrowser.openBrowserAsync(checkoutUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      controlsColor: '#006B3F',
      dismissButtonStyle: 'close',
    });
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      const confirmation = await confirmHubtelCardCheckout(input.idToken, transactionId);
      if (confirmation.status !== 'processing') return confirmation;
    } catch {
      // Hubtel can take a moment to publish a brand-new invoice status. Keep
      // the rider in the same checkout session rather than encouraging a
      // duplicate card payment.
    }
    await wait(POLL_INTERVAL_MS);
  }

  return {
    status: 'processing',
    transactionId,
    amount: Number.isFinite(Number(started.amount)) ? Number(started.amount) : undefined,
    message: 'Your card payment is still processing. Do not pay again; open Wallet shortly to see the confirmed balance.',
  };
}
