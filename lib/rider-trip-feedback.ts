function finiteNonNegative(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * A trip reminder is informational only. It never changes the ride state,
 * fare, or Driver workflow; the server remains authoritative for all of those.
 */
export function shouldPromptForDestinationArrival(input: {
  tripStatus?: string | null;
  routeDistanceKm?: unknown;
  routeDurationMinutes?: unknown;
}): boolean {
  if (input.tripStatus !== 'in_progress') return false;
  const distanceKm = finiteNonNegative(input.routeDistanceKm);
  const durationMinutes = finiteNonNegative(input.routeDurationMinutes);
  return (distanceKm !== null && distanceKm <= 0.4)
    || (durationMinutes !== null && durationMinutes <= 2);
}

export function destinationArrivalReminder(destination?: string | null): string {
  const location = String(destination || 'your destination').trim() || 'your destination';
  return `You are almost at ${location}. Please check that you have all your belongings before you arrive.`;
}
