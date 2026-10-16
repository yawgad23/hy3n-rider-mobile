export type AuthoritativeBookingRouteQuote = {
  available?: unknown;
  distanceKm?: unknown;
  durationMinutes?: unknown;
};

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The booking sheet may render while a new server quote is loading. In that
 * short period it must not present a device-side straight-line distance beside
 * a server-calculated fare. Every displayed route metric therefore comes from
 * the same fresh, server-owned quote, or is deliberately shown as pending.
 */
export function riderBookingRouteDisplay(quote?: AuthoritativeBookingRouteQuote): {
  ready: boolean;
  distance: string;
  duration: string;
  combined: string;
} {
  if (quote?.available !== true) {
    return {
      ready: false,
      distance: 'Updating route',
      duration: 'Calculating secure route',
      combined: 'Updating secure route',
    };
  }

  const distanceKm = finiteNonNegative(quote.distanceKm);
  const durationMinutes = finiteNonNegative(quote.durationMinutes);
  if (distanceKm === null || durationMinutes === null) {
    return {
      ready: false,
      distance: 'Updating route',
      duration: 'Calculating secure route',
      combined: 'Updating secure route',
    };
  }

  const roundedMinutes = Math.max(1, Math.ceil(durationMinutes));
  return {
    ready: true,
    distance: `${distanceKm.toFixed(1)} km`,
    duration: `~${roundedMinutes} min trip`,
    combined: `${distanceKm.toFixed(1)} km · ~${roundedMinutes} min`,
  };
}
