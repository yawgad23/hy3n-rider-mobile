export type RideLifecycleStatus =
  | "searching"
  | "matched"
  | "driver_arriving"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface RideStateRecord {
  id: string;
  status: RideLifecycleStatus | string;
}

/**
 * A recovered ride may carry the Firestore document ID separately from the
 * in-memory ride ID used by an older session. Treat either identifier as the
 * same ride when merging an authoritative server snapshot.
 */
export function rideKeysMatch(
  left: { id?: string | null; firestoreId?: string | null },
  right: { id?: string | null; firestoreId?: string | null },
): boolean {
  const leftKeys = [left.id, left.firestoreId].map((value) => String(value || '').trim()).filter(Boolean);
  const rightKeys = [right.id, right.firestoreId].map((value) => String(value || '').trim()).filter(Boolean);
  return leftKeys.some((key) => rightKeys.includes(key));
}

/** Insert or replace one ride without affecting any other active ride. */
export function upsertRide<T extends RideStateRecord>(rides: T[], ride: T): T[] {
  const withoutRide = rides.filter((item) => item.id !== ride.id);
  return [...withoutRide, ride];
}

/** Apply a change only to the ride identified by id. */
export function updateRide<T extends RideStateRecord>(
  rides: T[],
  rideId: string,
  updater: (ride: T) => T,
): T[] {
  return rides.map((ride) => (ride.id === rideId ? updater(ride) : ride));
}

/** Remove one ride while preserving all other ride records. */
export function removeRide<T extends RideStateRecord>(rides: T[], rideId: string): T[] {
  return rides.filter((ride) => ride.id !== rideId);
}

/** Count rides that should remain visible as active. */
export function countActiveRides(rides: RideStateRecord[]): number {
  return rides.filter((ride) => !["completed", "cancelled"].includes(ride.status)).length;
}
