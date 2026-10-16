import { getApiBaseUrl } from '@/constants/oauth';

export type RiderHistoryUser = {
  getIdToken: () => Promise<string>;
};

type RiderHistoryResponse = {
  success?: boolean;
  rides?: unknown;
  message?: string;
};

type RiderHistoryRequest = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function safeLimit(value: number): number {
  return Math.min(50, Math.max(1, Math.floor(Number.isFinite(value) ? value : 50)));
}

/**
 * Gets one Rider's history from the authenticated server view. This avoids a
 * client-side Firestore collection query while keeping ride data private and
 * display-only. It has no access to fare, wallet, or trip-state mutation.
 */
export async function requestRiderHistory(
  user: RiderHistoryUser,
  apiBaseUrl: string,
  limit = 50,
  request: RiderHistoryRequest = (url, init) => fetch(url, init),
): Promise<Record<string, unknown>[]> {
  const response = await request(`${apiBaseUrl.replace(/\/$/, '')}/api/rider/rides/history?limit=${safeLimit(limit)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const payload = await response.json().catch(() => null) as RiderHistoryResponse | null;
  if (!response.ok || payload?.success !== true || !Array.isArray(payload.rides)) {
    throw new Error('Your ride history is temporarily unavailable. Please pull to refresh.');
  }
  return payload.rides.filter((ride): ride is Record<string, unknown> => Boolean(ride && typeof ride === 'object' && !Array.isArray(ride)));
}

export async function getRiderHistory(limit = 50): Promise<Record<string, unknown>[]> {
  // Delay the native Firebase module load until the Rider actually opens
  // History. This keeps the screen's API helper testable in isolation and
  // avoids making this non-critical read part of initial route evaluation.
  const { auth } = await import('./firebase');
  const user = auth.currentUser;
  if (!user) return [];
  return requestRiderHistory(user, getApiBaseUrl(), limit);
}
