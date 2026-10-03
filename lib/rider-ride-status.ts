const STATUS_ORDER: Record<string, number> = {
  searching: 0,
  matched: 1,
  driver_arriving: 2,
  driver_arrived: 3,
  in_progress: 4,
  completed: 5,
  cancelled: 5,
};

/** Prevents an out-of-order snapshot from moving an accepted ride back to searching. */
export function nonRegressiveRideStatus<T extends string>(current: T, incoming: T): T {
  const currentOrder = STATUS_ORDER[current] ?? -1;
  const incomingOrder = STATUS_ORDER[incoming] ?? -1;
  return incomingOrder < currentOrder ? current : incoming;
}
