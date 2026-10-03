import { auth } from './firebase';
import { getApiBaseUrl } from '@/constants/oauth';

export type RiderRideStatusResponse = {
  success?: boolean;
  ride?: Record<string, unknown>;
  message?: string;
};

/**
 * Reads one Rider-owned ride through the authenticated server boundary.
 *
 * Firestore remains the primary real-time transport. This fallback prevents a
 * paused or disconnected client snapshot from leaving the rider on “Searching”
 * after a driver has already accepted the trip on the authoritative server.
 */
export async function getRiderRideStatus(rideId: string): Promise<Record<string, unknown> | null> {
  const user = auth.currentUser;
  if (!user || !rideId) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/rides/${encodeURIComponent(rideId)}/status`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const payload = await response.json().catch(() => null) as RiderRideStatusResponse | null;

  if (response.status === 404) return null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Unable to refresh your ride status.');
  }
  return payload.ride || null;
}
