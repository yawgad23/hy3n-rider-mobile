import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/constants/oauth';

export async function createLiveTripShareLink(rideId: string): Promise<{ trackingUrl: string; expiresAt: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again before sharing your trip.');
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('Live trip sharing is temporarily unavailable.');

  const response = await fetch(`${baseUrl}/api/rider/trips/${encodeURIComponent(rideId)}/share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.trackingUrl) {
    throw new Error(body.message || 'Live trip sharing is temporarily unavailable.');
  }
  return { trackingUrl: String(body.trackingUrl), expiresAt: String(body.expiresAt || '') };
}
