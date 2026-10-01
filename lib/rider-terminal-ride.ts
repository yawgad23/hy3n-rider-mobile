import { getFinalRideFare, getQuotedRideFare } from './fare';

type TerminalRide = {
  id: string;
  status: string;
  finalFare?: number;
  currentFare?: number;
  quotedFare?: number;
  waitingFee?: number;
  actualDistanceKm?: number;
  driverLocation?: { lat: number; lng: number };
  driverRoutePoints?: [number, number][];
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routePhase?: 'pickup' | 'destination';
  driverStoppedAt?: number;
  safetySignal?: string;
  sharingActive?: boolean;
  shareExpiresAt?: string;
};

/**
 * A completed Firestore snapshot must not pass through the live GPS/ETA path:
 * its driver, route, and other optional fields may be removed or reshaped by
 * settlement. Payment authority stays on the server; this only builds UI state.
 */
export function applyCompletedRideSnapshot<T extends TerminalRide>(
  previous: T,
  serverRide: Record<string, unknown>,
): T {
  const serverFinal = getFinalRideFare(serverRide);
  const waiting = finiteNonNegative(serverRide.waiting_fee);
  const meter = serverRide.trip_meter;
  const meteredDistance = meter && typeof meter === 'object'
    ? (meter as Record<string, unknown>).distance_km
    : undefined;
  const distance = finiteNonNegative(serverRide.actual_distance_km ?? meteredDistance);
  return {
    ...previous,
    status: 'completed',
    finalFare: serverFinal,
    currentFare: serverFinal,
    quotedFare: getQuotedRideFare(serverRide),
    waitingFee: waiting ?? finiteNonNegative(previous.waitingFee) ?? 0,
    actualDistanceKm: distance ?? finiteNonNegative(previous.actualDistanceKm) ?? 0,
    driverLocation: undefined,
    driverRoutePoints: undefined,
    routeDistanceKm: undefined,
    routeDurationMinutes: undefined,
    routePhase: undefined,
    driverStoppedAt: undefined,
    safetySignal: 'clear',
    sharingActive: false,
    shareExpiresAt: undefined,
  } as T;
}

function finiteNonNegative(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}
