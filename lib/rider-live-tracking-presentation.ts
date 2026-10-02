export type RiderLiveTripStatus = string | null | undefined;

type DriverMarkerPresentationInput = {
  tripStatus: RiderLiveTripStatus;
  distanceKm?: number | null;
  etaMinutes?: number | null;
};

function finiteNonNegative(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function isRiderTripInProgress(status: RiderLiveTripStatus): boolean {
  return status === 'in_progress';
}

/** Formats close proximity in metres so 0.0 km is never shown to a Rider. */
export function formatLiveDistance(distanceKm: unknown): string | null {
  const distance = finiteNonNegative(distanceKm);
  if (distance === null) return null;
  if (distance < 0.1) return '< 100 m';
  if (distance < 1) return `${Math.max(100, Math.round(distance * 1000 / 10) * 10)} m`;
  return `${distance.toFixed(1)} km`;
}

/**
 * Pickup distance becomes the primary map label below one kilometre. During an
 * active trip no pickup ETA may be rendered; the label instead describes the
 * remaining route to the destination.
 */
export function riderDriverMarkerLabel({
  tripStatus,
  distanceKm,
  etaMinutes,
}: DriverMarkerPresentationInput): string {
  const distance = finiteNonNegative(distanceKm);
  const distanceLabel = formatLiveDistance(distance);

  if (isRiderTripInProgress(tripStatus)) {
    return distanceLabel ? `${distanceLabel} to destination` : 'On trip';
  }

  if (distance !== null && distance < 1) return `${distanceLabel} away`;

  const eta = finiteNonNegative(etaMinutes);
  if (eta !== null) {
    const roundedEta = Math.max(1, Math.round(eta));
    return `${roundedEta} min away${distanceLabel ? ` · ${distanceLabel}` : ''}`;
  }

  return distanceLabel ? `${distanceLabel} away` : 'Pickup ETA unavailable';
}
