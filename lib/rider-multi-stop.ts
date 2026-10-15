export const MAX_RIDER_ROUTE_STOPS = 3;

export type RiderRouteStop<T> = T | null;

/** Adds an unfilled, visible stop row; the caller chooses its address separately. */
export function addRiderRouteStop<T>(stops: RiderRouteStop<T>[]): RiderRouteStop<T>[] {
  if (stops.length >= MAX_RIDER_ROUTE_STOPS) return stops;
  return [...stops, null];
}

/** Replaces the exact placeholder row that the Rider is editing. */
export function setRiderRouteStop<T>(
  stops: RiderRouteStop<T>[],
  index: number,
  stop: T,
): RiderRouteStop<T>[] {
  if (!Number.isInteger(index) || index < 0 || index >= stops.length) return stops;
  const next = [...stops];
  next[index] = stop;
  return next;
}

/** Removes a stop or an unfilled row without affecting the remaining route order. */
export function removeRiderRouteStop<T>(
  stops: RiderRouteStop<T>[],
  index: number,
): RiderRouteStop<T>[] {
  if (!Number.isInteger(index) || index < 0 || index >= stops.length) return stops;
  return stops.filter((_, candidateIndex) => candidateIndex !== index);
}

/** A visible unfilled row must be resolved or removed before booking. */
export function hasPendingRiderRouteStop<T>(stops: RiderRouteStop<T>[]): boolean {
  return stops.some((stop) => stop === null);
}
