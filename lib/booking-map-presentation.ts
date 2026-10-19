function finiteWholeMinutes(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(0, Math.ceil(parsed)) : null;
}

/**
 * A booking pickup ETA is displayable only when the same quote also contains
 * at least one anonymous nearby vehicle. This prevents stale or partial quote
 * payloads from showing "1 min" over an empty map.
 */
export function bookingPickupEtaMinutes(input: {
  pickupEtaMinutes?: unknown;
  eligibleDriverCount?: unknown;
  nearbyVehicleCount?: unknown;
}): number | null {
  const eligible = Number(input.eligibleDriverCount);
  const nearby = Number(input.nearbyVehicleCount);
  if (!Number.isFinite(eligible) || eligible <= 0 || !Number.isFinite(nearby) || nearby <= 0) return null;
  return finiteWholeMinutes(input.pickupEtaMinutes);
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
  eligibleDriverCount?: unknown;
  nearbyVehicleCount?: unknown;
  routeDurationMinutes?: unknown;
  now?: Date;
}): { pickup: string; dropoff: string } {
  const pickupMinutes = bookingPickupEtaMinutes(input);
  const routeMinutes = finiteWholeMinutes(input.routeDurationMinutes);
  const now = input.now ?? new Date();

  return {
    pickup: pickupMinutes === null ? 'Pickup\nFinding Driver' : `Pickup\n${Math.max(1, pickupMinutes)} min`,
    dropoff: routeMinutes === null ? 'Drop-off\nCalculating' : `Drop-off\n${clockTime(new Date(now.getTime() + routeMinutes * 60_000))}`,
  };
}
