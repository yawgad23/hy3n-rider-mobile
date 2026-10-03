const STATUS_ORDER: Record<string, number> = {
  searching: 0,
  matched: 1,
  driver_arriving: 2,
  driver_arrived: 3,
  in_progress: 4,
  completed: 5,
  cancelled: 5,
};

export type RiderTerminalStatus = 'completed' | 'cancelled';

/**
 * Terminal snapshots must be handled before active-ride recovery. Recovery
 * intentionally returns null for them, because a completed trip must never be
 * revived as a live map. The caller still needs the raw terminal snapshot to
 * remove the stale trip and, for a completion, show its server receipt state.
 */
export function riderTerminalStatus(value: unknown): RiderTerminalStatus | null {
  const status = String(value ?? '').trim().toLowerCase();
  return status === 'completed' || status === 'cancelled' ? status : null;
}

/** Prevents an out-of-order snapshot from moving an accepted ride back to searching. */
export function nonRegressiveRideStatus<T extends string>(current: T, incoming: T): T {
  const currentOrder = STATUS_ORDER[current] ?? -1;
  const incomingOrder = STATUS_ORDER[incoming] ?? -1;
  return incomingOrder < currentOrder ? current : incoming;
}
