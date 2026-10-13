export function isAssignmentReleaseRedispatch(ride: Record<string, unknown>): boolean {
  return String(ride.status || '').trim().toLowerCase() === 'searching'
    && ride.reassigned_after_assignment_release === true;
}

export function assignmentReleaseActor(ride: Record<string, unknown>): 'rider' | 'driver' | null {
  const actor = String(ride.assignment_release_actor || '').trim().toLowerCase();
  return actor === 'rider' || actor === 'driver' ? actor : null;
}

export function driverRedispatchCount(ride: Record<string, unknown>): number {
  const count = Number(ride.driver_reassignment_count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
