function finiteWholeMinutes(value: unknown): number | null {
  // Number(null) and Number('') both become zero. Treat absent ETA data as
  // unknown so the map never invents a 1-minute pickup when no Driver exists.
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(0, Math.ceil(parsed)) : null;
}

function clockTime(value: Date): string {
  const hours = value.getHours();
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Booking-preview time callouts are shown only when a matching, live nearby
 * Driver has a valid road ETA AND the current server route quote has a valid
 * destination duration. If either input is missing, hide both callouts rather
 * than showing "Finding Driver", "Calculating", or a misleading partial ETA.
 */
export function bookingMapTimeLabels(input: {
  pickupEtaMinutes?: unknown;
  routeDurationMinutes?: unknown;
  now?: Date;
}): { pickup: string | null; dropoff: string | null } {
  const pickupMinutes = finiteWholeMinutes(input.pickupEtaMinutes);
  const routeMinutes = finiteWholeMinutes(input.routeDurationMinutes);
  if (pickupMinutes === null || routeMinutes === null) {
    return { pickup: null, dropoff: null };
  }

  const now = input.now ?? new Date();
  return {
    pickup: `Pickup\n${Math.max(1, pickupMinutes)} min`,
    dropoff: `Drop-off\n${clockTime(new Date(now.getTime() + routeMinutes * 60_000))}`,
  };
}
