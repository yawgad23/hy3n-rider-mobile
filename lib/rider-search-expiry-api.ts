import { auth } from './firebase';
import { getApiBaseUrl } from '@/constants/oauth';

/** Marks an already-expired search as terminal without exposing it to Drivers. */
export async function expireStaleRiderSearch(rideId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !rideId) return;

  const response = await fetch(`${getApiBaseUrl()}/api/rides/${encodeURIComponent(rideId)}/expire-stale-search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });

  // A concurrent cancellation, Driver acceptance, or another device resolving
  // the request is already a safe terminal outcome for this client cleanup.
  if (!response.ok && response.status !== 409) {
    throw new Error('Unable to clear an expired ride search.');
  }
}
