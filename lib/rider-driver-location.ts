export type RiderDriverLocation = {
  lat: number;
  lng: number;
  heading?: number | null;
  updatedAt?: string;
};

function sameCoordinates(
  left: Pick<RiderDriverLocation, 'lat' | 'lng'> | null | undefined,
  right: Pick<RiderDriverLocation, 'lat' | 'lng'>,
) {
  return Boolean(
    left
    && Math.abs(Number(left.lat) - right.lat) < 0.0000001
    && Math.abs(Number(left.lng) - right.lng) < 0.0000001,
  );
}

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Keeps the map moving forward through one ordered Driver presence stream. A
 * delayed Firestore snapshot must never put the car back on an older road point.
 */
export function nextRiderDriverLocation(
  source: Record<string, any> | null | undefined,
  previousUpdatedAt?: string,
  previousLocation?: Pick<RiderDriverLocation, 'lat' | 'lng'> | null,
): RiderDriverLocation | null {
  const latitude = Number(source?.latitude ?? source?.lat);
  const longitude = Number(source?.longitude ?? source?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const updatedAt = String(source?.recorded_at ?? source?.updated_at ?? source?.last_location_update ?? source?.last_seen_at ?? source?.last_seen ?? '').trim() || undefined;
  const previousMs = timestampMs(previousUpdatedAt);
  const incomingMs = timestampMs(updatedAt);
  if (previousMs !== null && (incomingMs === null || incomingMs < previousMs)) return null;

  const heading = Number(source?.heading);
  const incoming = {
    lat: latitude,
    lng: longitude,
    heading: Number.isFinite(heading) ? heading : null,
    updatedAt,
  };

  // A ride document preserves the Driver's initial location for identity and
  // recovery. It must never replace a newer live-presence point that arrived
  // through `driver_presence`. Equal timestamps are safe only for the same
  // coordinate, such as an authenticated stationary heartbeat.
  if (previousMs !== null && incomingMs === previousMs && !sameCoordinates(previousLocation, incoming)) return null;

  return incoming;
}
