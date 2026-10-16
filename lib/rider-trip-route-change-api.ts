import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/constants/oauth';

export type RiderTripRouteChangeKind = 'destination' | 'add_stop';

export type RiderTripRouteLocation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type RouteChangeResponse = {
  success?: boolean;
  message?: string;
  routeChange?: Record<string, unknown>;
  quote?: {
    id?: unknown;
    estimated_total?: unknown;
    estimated_remaining_distance_km?: unknown;
    estimated_remaining_duration_minutes?: unknown;
    expires_at?: unknown;
    location?: Partial<RiderTripRouteLocation>;
  };
};

export type RiderTripRouteChangeQuote = {
  id: string;
  kind: RiderTripRouteChangeKind;
  location: RiderTripRouteLocation;
  estimatedTotal: number;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  expiresAt: string;
};

function isValidLocation(location: RiderTripRouteLocation) {
  return Number.isFinite(location.lat)
    && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90
    && Math.abs(location.lng) <= 180
    && Boolean(location.name.trim())
    && Boolean(location.address.trim());
}

/**
 * Sends a Rider request only. It does not edit the live route, fare, wallet,
 * or destination locally: the assigned Driver must confirm on the server.
 */
async function riderRouteChangeRequest(input: {
  rideId: string;
  kind: RiderTripRouteChangeKind;
  location: RiderTripRouteLocation;
  quoteId?: string;
  endpoint: 'quote' | 'request';
}, request: typeof fetch = fetch): Promise<RouteChangeResponse> {
  const rideId = String(input.rideId || '').trim();
  const user = auth.currentUser;
  if (!rideId) throw new Error('This trip could not be identified. Please reopen it and try again.');
  if (!user) throw new Error('Please sign in again before changing your route.');
  if (!isValidLocation(input.location)) throw new Error('Choose a valid address before requesting a route change.');

  const idToken = await user.getIdToken(true);
  if (!idToken) throw new Error('Your sign-in session has expired. Please sign in again.');
  const suffix = input.endpoint === 'quote' ? '/quote' : '';
  const response = await request(`${getApiBaseUrl().replace(/\/$/, '')}/api/rides/${encodeURIComponent(rideId)}/route-change${suffix}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: input.kind,
      ...(input.quoteId ? { quoteId: input.quoteId } : {}),
      location: {
        name: input.location.name.trim(),
        address: input.location.address.trim(),
        lat: input.location.lat,
        lng: input.location.lng,
      },
    }),
  });
  const payload = await response.json().catch(() => null) as RouteChangeResponse | null;
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.message || 'Your route change could not be sent. Please try again.');
  }
  return payload;
}

/** Requests a server-owned fare estimate before a Rider can ask the Driver to approve a new route. */
export async function quoteRiderTripRouteChange(input: {
  rideId: string;
  kind: RiderTripRouteChangeKind;
  location: RiderTripRouteLocation;
}, request: typeof fetch = fetch): Promise<RiderTripRouteChangeQuote> {
  const payload = await riderRouteChangeRequest({ ...input, endpoint: 'quote' }, request);
  const quote = payload.quote;
  const id = String(quote?.id || '').trim();
  const estimatedTotal = Number(quote?.estimated_total);
  const remainingDistanceKm = Number(quote?.estimated_remaining_distance_km);
  const remainingDurationMinutes = Number(quote?.estimated_remaining_duration_minutes);
  const expiresAt = String(quote?.expires_at || '').trim();
  const location = quote?.location;
  if (!id || !Number.isFinite(estimatedTotal) || !Number.isFinite(remainingDistanceKm) || !Number.isFinite(remainingDurationMinutes) || !expiresAt || !location) {
    throw new Error('HY3N could not verify the updated fare. Please try again.');
  }
  return {
    id,
    kind: input.kind,
    location: {
      name: String(location.name || input.location.name),
      address: String(location.address || input.location.address),
      lat: Number(location.lat ?? input.location.lat),
      lng: Number(location.lng ?? input.location.lng),
    },
    estimatedTotal,
    remainingDistanceKm,
    remainingDurationMinutes,
    expiresAt,
  };
}

/** Sends the Rider-confirmed server quote for Driver approval; it never edits a route locally. */
export async function requestRiderTripRouteChange(input: {
  rideId: string;
  kind: RiderTripRouteChangeKind;
  location: RiderTripRouteLocation;
  quoteId: string;
}, request: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const payload = await riderRouteChangeRequest({ ...input, endpoint: 'request' }, request);
  return payload.routeChange || {};
}
