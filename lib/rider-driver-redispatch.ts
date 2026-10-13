export function isDriverCancellationRedispatch(ride: Record<string, unknown>): boolean {
  return String(ride.status || '').trim().toLowerCase() === 'searching'
    && ride.reassigned_after_driver_cancellation === true;
}

export function driverRedispatchCount(ride: Record<string, unknown>): number {
  const count = Number(ride.driver_reassignment_count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
