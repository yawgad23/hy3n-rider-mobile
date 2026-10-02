export type RiderLiveTripStatus = string | null | undefined;

type DriverMarkerPresentationInput = {
  tripStatus: RiderLiveTripStatus;
  distanceKm?: number | null;
  etaMinutes?: number | null;
};

function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
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

/** Map callouts use fully spelled metre units for immediate road proximity. */
export function formatMapDistance(distanceKm: unknown): string | null {
  const distance = finiteNonNegative(distanceKm);
  if (distance === null) return null;
  if (distance < 0.1) return '< 100 metres';
  if (distance < 1) return `${Math.max(100, Math.round(distance * 1000 / 10) * 10)} metres`;
  return `${distance.toFixed(1)} km`;
}

/** Keeps a single, human-readable pickup arrival status in the active-ride sheet. */
export function riderPickupStatusLabel(etaMinutes: unknown, distanceKm: unknown): string {
  const eta = finiteNonNegative(etaMinutes);
  if (eta !== null) return `Pickup in ${Math.max(1, Math.round(eta))} min`;
  const distance = formatLiveDistance(distanceKm);
  return distance ? `Driver is ${distance} away` : 'Driver is on the way';
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
  const distanceLabel = formatMapDistance(distance);

  if (isRiderTripInProgress(tripStatus)) {
    return distanceLabel ? `${distanceLabel} to destination` : 'On trip';
  }

  if (distance !== null && distance < 1) return distanceLabel || 'Driver nearby';

  const eta = finiteNonNegative(etaMinutes);
  if (eta !== null) {
    const roundedEta = Math.max(1, Math.round(eta));
    return `${roundedEta} min${distanceLabel ? ` · ${distanceLabel}` : ''}`;
  }

  return distanceLabel || 'Pickup ETA unavailable';
}
