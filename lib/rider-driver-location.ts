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

/**
 * Firestore timestamps can arrive as Date objects, Timestamp instances, or
 * their JSON representation ({ seconds, nanoseconds }). Stringifying a
 * Timestamp produces a non-parseable value and can make every later GPS point
 * look undated, freezing the Rider's marker after the first timestamped fix.
 */
function normalizeTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Epoch values from APIs may be expressed in seconds or milliseconds.
    const milliseconds = Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const milliseconds = Date.parse(trimmed);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
  }

  if (!value || typeof value !== 'object') return undefined;
  const timestamp = value as {
    toDate?: () => Date;
    seconds?: unknown;
    _seconds?: unknown;
    nanoseconds?: unknown;
    _nanoseconds?: unknown;
  };

  if (typeof timestamp.toDate === 'function') {
    try {
      return normalizeTimestamp(timestamp.toDate());
    } catch {
      return undefined;
    }
  }

  const seconds = Number(timestamp.seconds ?? timestamp._seconds);
  if (Number.isFinite(seconds)) {
    const nanos = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
    const milliseconds = seconds * 1000 + (Number.isFinite(nanos) ? nanos / 1_000_000 : 0);
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  return undefined;
}

function timestampMs(value: unknown): number | null {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const timestampValue = source?.recorded_at ?? source?.updated_at ?? source?.last_location_update ?? source?.last_seen_at ?? source?.last_seen;
  const updatedAt = normalizeTimestamp(timestampValue);
  const previousMs = timestampMs(previousUpdatedAt);
  const incomingMs = timestampMs(timestampValue);
  if (previousMs !== null && (incomingMs === null || incomingMs < previousMs)) return null;

  const headingValue = source?.heading;
  const heading = headingValue === null || headingValue === undefined || headingValue === ''
    ? NaN
    : Number(headingValue);
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
