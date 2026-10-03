function finiteWholeMinutes(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(0, Math.ceil(parsed)) : null;
}

function clockTime(value: Date): string {
  const hours = value.getHours();
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats the booking-preview callouts shown directly on the native map.
 * Pickup comes from a currently eligible nearby Driver; drop-off is derived
 * only from the server-owned route duration, never a client fare estimate.
 */
export function bookingMapTimeLabels(input: {
  pickupEtaMinutes?: unknown;
  routeDurationMinutes?: unknown;
  now?: Date;
}): { pickup: string; dropoff: string } {
  const pickupMinutes = finiteWholeMinutes(input.pickupEtaMinutes);
  const routeMinutes = finiteWholeMinutes(input.routeDurationMinutes);
  const now = input.now ?? new Date();

  return {
    pickup: pickupMinutes === null ? 'Pickup\nFinding Driver' : `Pickup\n${Math.max(1, pickupMinutes)} min`,
    dropoff: routeMinutes === null ? 'Drop-off\nCalculating' : `Drop-off\n${clockTime(new Date(now.getTime() + routeMinutes * 60_000))}`,
  };
}

/** A route preview should keep both endpoints visible even when route geometry is incomplete. */
export function bookingMapFramePoints<T>(route: T[], pickup: T | null, destination: T | null): T[] {
  return [...route, ...(pickup ? [pickup] : []), ...(destination ? [destination] : [])];
}
