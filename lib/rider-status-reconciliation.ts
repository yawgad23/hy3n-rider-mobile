/**
 * Firestore provides live trip updates. This is only the authenticated fallback
 * when an iOS snapshot is paused, so it must stay bounded and must not restart
 * because a normal state update re-rendered the map.
 */
export const RIDER_STATUS_RECONCILIATION_INTERVAL_MS = 4_000;

type ReconciledRide = Record<string, any> & {
  status?: string;
  driverLocation?: { lat?: number; lng?: number };
  driverBearing?: number;
  driverLocationUpdatedAt?: string;
  driverRouteUpdatedAt?: string;
  driverRoutePoints?: Array<number[]>;
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routePhase?: string;
  routeTarget?: {
    kind?: string;
    stopId?: string;
    location?: { lat?: number; lng?: number };
  };
};

function timestamp(value: unknown) {
  const milliseconds = Date.parse(String(value || ''));
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function routePhase(status: unknown) {
  return String(status || '').trim().toLowerCase() === 'in_progress' ? 'destination' : 'pickup';
}

function sameRouteTarget(left: ReconciledRide, right: ReconciledRide) {
  const a = left.routeTarget;
  const b = right.routeTarget;
  // Older snapshots omit this optional field. It is not proof that the target
  // changed, so preserve the newer route unless a concrete target disagrees.
  if (!a || !b) return true;
  return a.kind === b.kind
    && String(a.stopId || '') === String(b.stopId || '')
    && Number(a.location?.lat) === Number(b.location?.lat)
    && Number(a.location?.lng) === Number(b.location?.lng);
}

/**
 * Merges the authenticated status fallback without allowing its occasionally
 * older ride document to move a car or replace a newer road line received from
 * Firestore Driver presence. Terminal states are handled before this helper.
 */
export function mergeRiderStatusSnapshot<T extends ReconciledRide, S extends ReconciledRide>(current: T, server: S): T {
  const merged = { ...current, ...server } as T;
  const currentLocationAt = timestamp(current.driverLocationUpdatedAt);
  const serverLocationAt = timestamp(server.driverLocationUpdatedAt);

  if (currentLocationAt !== null && (serverLocationAt === null || serverLocationAt <= currentLocationAt)) {
    merged.driverLocation = current.driverLocation;
    merged.driverBearing = current.driverBearing;
    merged.driverLocationUpdatedAt = current.driverLocationUpdatedAt;
  }

  const currentRouteAt = timestamp(current.driverRouteUpdatedAt);
  const serverRouteAt = timestamp(server.driverRouteUpdatedAt);
  const keepCurrentRoute = currentRouteAt !== null
    && (serverRouteAt === null || serverRouteAt <= currentRouteAt)
    && routePhase(current.status) === routePhase(server.status ?? current.status)
    && sameRouteTarget(current, server);

  if (keepCurrentRoute) {
    merged.driverRoutePoints = current.driverRoutePoints;
    merged.driverRouteUpdatedAt = current.driverRouteUpdatedAt;
    merged.routeDistanceKm = current.routeDistanceKm;
    merged.routeDurationMinutes = current.routeDurationMinutes;
    merged.routePhase = current.routePhase;
  }

  return merged;
}
