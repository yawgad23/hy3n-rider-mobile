import { rideKeysMatch } from './rider-ride-state';
import { nonRegressiveRideStatus, riderTerminalStatus } from './rider-ride-status';
import { mergeRiderStatusSnapshot } from './rider-status-reconciliation';

export const RIDER_COMPLETION_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

type ResumeRide = Record<string, any> & {
  id: string;
  firestoreId?: string;
  status: string;
  routeTarget?: { kind?: string; stopId?: string; location?: { lat?: number; lng?: number } };
  driverRoutePoints?: number[][];
  driverRouteUpdatedAt?: string;
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routePhase?: string;
};

/** Accept the timestamp shapes returned by Firestore and the authenticated API. */
export function riderCompletionTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  let milliseconds: number;
  try {
    if (value instanceof Date) milliseconds = value.getTime();
    else if (typeof value === 'number') milliseconds = value;
    else if (typeof value === 'object') {
      const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
      const seconds = timestamp.seconds ?? timestamp._seconds;
      milliseconds = typeof timestamp.toMillis === 'function'
        ? timestamp.toMillis()
        : typeof seconds === 'number'
          ? seconds * 1000 + Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0) / 1_000_000
          : NaN;
    } else milliseconds = Date.parse(String(value));
  } catch {
    return null;
  }
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

/** Recover only the signed-in Rider's newest recent, still-unrated completion. */
export function latestRecoverableCompletedRide(
  rides: Record<string, any>[], riderId: string, now = Date.now(),
): Record<string, any> | null {
  const cutoff = now - RIDER_COMPLETION_RECOVERY_WINDOW_MS;
  const eligible = rides.flatMap((ride) => {
    if (ride.rider_id !== riderId || riderTerminalStatus(ride.status) !== 'completed'
      || typeof ride.id !== 'string' || !ride.id.trim() || ride.rider_rating) return [];
    const completedAt = riderCompletionTimestamp(ride.completed_at ?? ride.trip_completed_at
      ?? ride.updated_at ?? ride.updated_date ?? ride.created_at ?? ride.created_date);
    return completedAt !== null && completedAt > cutoff && completedAt <= now
      ? [{ ride, completedAt }]
      : [];
  });
  eligible.sort((left, right) => right.completedAt - left.completedAt
    || String(left.ride.id).localeCompare(String(right.ride.id)));
  return eligible[0]?.ride ?? null;
}

/**
 * Resume reads supplement the current live state; a missing document is not a
 * cancellation. Explicit terminal identities remove stale active state and
 * cannot be resurrected by an older in-flight read. Keep local IDs/UI selection
 * and the newer live GPS/route samples when merging the same server ride.
 */
export function mergeRecoveredRiderRides<T extends ResumeRide>(
  current: T[], recovered: T[], terminalIds: ReadonlySet<string>,
): T[] {
  const isTerminal = (ride: T) => terminalIds.has(ride.id)
    || Boolean(ride.firestoreId && terminalIds.has(ride.firestoreId));
  const next = current.filter((ride) => !isTerminal(ride));
  for (const server of recovered) {
    if (isTerminal(server)) continue;
    const index = next.findIndex((ride) => rideKeysMatch(ride, server));
    if (index < 0) next.push(server);
    else {
      const previous = next[index];
      const merged = mergeRiderStatusSnapshot(previous, server);
      merged.id = previous.id;
      // Driver/rider assignment release can legitimately redispatch the same
      // request. All other older statuses must not move an ongoing trip back.
      merged.status = server.status === 'searching' && server.assignmentReleaseActor
        ? server.status
        : nonRegressiveRideStatus(previous.status, server.status);
      if (merged.status !== server.status) {
        // An older pickup leg cannot replace the line/target of a trip that
        // has already started, even if that old leg has a route timestamp.
        merged.routeTarget = previous.routeTarget;
        merged.driverRoutePoints = previous.driverRoutePoints;
        merged.driverRouteUpdatedAt = previous.driverRouteUpdatedAt;
        merged.routeDistanceKm = previous.routeDistanceKm;
        merged.routeDurationMinutes = previous.routeDurationMinutes;
        merged.routePhase = previous.routePhase;
      }
      next[index] = merged;
    }
  }
  return next;
}
