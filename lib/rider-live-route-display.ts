import { matchPointToServerRoute, type RoutePoint } from './rider-route-matching';

const TRACKING_STATUSES = ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'];
const EMPTY_POINTS: RoutePoint[] = [];
const METRES_PER_DEGREE = Math.PI * 6_371_000 / 180;

type Location = { lat: number; lng: number };
function isLocation(value: Location | null | undefined): value is Location {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180);
}

/** An active ride can never fall back to the original pickup-to-dropoff preview. */
export function riderDisplayedRoute(
  ride: { status?: string; driverRoutePoints?: RoutePoint[] | null; bookingRoutePoints?: RoutePoint[] | null } | null | undefined,
  quoteRoute?: RoutePoint[] | null,
): RoutePoint[] {
  if (ride && TRACKING_STATUSES.includes(String(ride.status))) return ride.driverRoutePoints ?? EMPTY_POINTS;
  return ride?.bookingRoutePoints ?? quoteRoute ?? EMPTY_POINTS;
}

/** Phase alone cannot distinguish the old destination from a Driver-approved new one. */
export function riderLiveRouteIsCurrent(live: Record<string, any>, status: string, target: Location | null | undefined): boolean {
  const phase = status === 'in_progress' ? 'destination' : 'pickup';
  if (live.phase !== phase || !isLocation(target)) return false;
  const key = `${target.lat.toFixed(5)}:${target.lng.toFixed(5)}`;
  if (typeof live.target_key === 'string') return live.target_key === key;
  // Transitional compatibility: old server rows have no target key. Require
  // their final Google/OSRM road point to terminate near the actual target.
  const end = Array.isArray(live.points) ? live.points.at(-1) : null;
  const endpoint: Location = {
    lat: Number(Array.isArray(end) ? end[0] : end?.lat ?? end?.latitude),
    lng: Number(Array.isArray(end) ? end[1] : end?.lng ?? end?.longitude),
  };
  if (!isLocation(endpoint)) return false;
  const dx = (endpoint.lng - target.lng) * METRES_PER_DEGREE * Math.cos(target.lat * Math.PI / 180);
  const dy = (endpoint.lat - target.lat) * METRES_PER_DEGREE;
  return Math.hypot(dx, dy) <= 150;
}

/** Preserve full route geometry only in the explicitly requested overview. */
export function riderRemainingLiveRoute(driverPoint: RoutePoint | null | undefined, serverRoute: RoutePoint[], overview = false): RoutePoint[] {
  const match = matchPointToServerRoute(driverPoint, serverRoute);
  if (!match) return EMPTY_POINTS;
  if (overview) return serverRoute;
  const points = [match.point, ...serverRoute.slice(match.segmentIndex + 1)];
  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
}

export function riderLiveRouteIsFresh(calculatedAt: string | null | undefined, nowMs = Date.now()) {
  const timestamp = calculatedAt ? Date.parse(calculatedAt) : NaN;
  return Number.isFinite(timestamp) && nowMs - timestamp <= 45_000 && timestamp - nowMs <= 5_000;
}
