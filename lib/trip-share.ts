import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/constants/oauth';

export type SharedTripSnapshot = {
  id: string;
  status: string;
  pickup: { latitude: number; longitude: number; label: string } | null;
  destination: { latitude: number; longitude: number; label: string } | null;
  driver: {
    name: string;
    vehicle: string;
    plate: string;
    location: { latitude: number; longitude: number; heading: number; updatedAt: string } | null;
  };
  route: { points: Array<[number, number]>; updatedAt: string | null; durationMinutes: number | null; distanceKm: number | null };
};

async function authenticatedRequest(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('Live trip sharing is temporarily unavailable.');
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, ...(init.headers || {}) },
  });
}

export async function createRecipientTripShare(rideId: string, phone: string): Promise<{ shareId: string; expiresAt: string }> {
  const response = await authenticatedRequest(`/api/rider/trips/${encodeURIComponent(rideId)}/share/recipient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.shareId) throw new Error(body.message || 'Unable to share this trip privately.');
  return { shareId: String(body.shareId), expiresAt: String(body.expiresAt || '') };
}

export async function getRecipientSharedTrip(shareId: string): Promise<SharedTripSnapshot | null> {
  const response = await authenticatedRequest(`/api/trip-shares/${encodeURIComponent(shareId)}/live`);
  if (response.status === 404 || response.status === 410) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.active || !body.share) throw new Error(body.message || 'Unable to load this shared trip.');
  return body.share as SharedTripSnapshot;
}

export async function createLiveTripShareLink(rideId: string): Promise<{ trackingUrl: string; expiresAt: string }> {
  const response = await authenticatedRequest(`/api/rider/trips/${encodeURIComponent(rideId)}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.trackingUrl) throw new Error(body.message || 'Live trip sharing is temporarily unavailable.');
  return { trackingUrl: String(body.trackingUrl), expiresAt: String(body.expiresAt || '') };
}

export async function revokeLiveTripShareLink(rideId: string): Promise<{ revokedAt: string }> {
  const response = await authenticatedRequest(`/api/rider/trips/${encodeURIComponent(rideId)}/share`, { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.message || 'Trip sharing could not be stopped.');
  return { revokedAt: String(body.revokedAt || '') };
}
