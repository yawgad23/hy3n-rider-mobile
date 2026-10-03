export type NativeMapPoint = [latitude: number, longitude: number];

export type NativeMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const MIN_LATITUDE_DELTA = 0.0065;
const MAX_LATITUDE_DELTA = 0.06;
const MIN_LONGITUDE_DELTA = 0.0065;
const MAX_LONGITUDE_DELTA = 0.08;
// Booking previews deliberately show the Rider's immediate surroundings, not
// the entire city-spanning journey. The full green route remains visible and
// the Rider can still pan/zoom it manually.
const BOOKING_MIN_LATITUDE_DELTA = 0.010;
const BOOKING_MAX_LATITUDE_DELTA = 0.028;
const BOOKING_MIN_LONGITUDE_DELTA = 0.010;
const BOOKING_MAX_LONGITUDE_DELTA = 0.032;
const BOOKING_ROUTE_LOOKAHEAD_KM = 1.2;
const BOOKING_NEARBY_DRIVER_KM = 1.4;

export function isNativeMapPoint(value: unknown): value is NativeMapPoint {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
    && Math.abs(Number(value[0])) <= 90
    && Math.abs(Number(value[1])) <= 180;
}

function bounded(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function approximateDistanceKm(from: NativeMapPoint, to: NativeMapPoint) {
  const latitudeKm = (to[0] - from[0]) * 111.32;
  const longitudeKm = (to[1] - from[1]) * 111.32 * Math.cos(((from[0] + to[0]) / 2) * Math.PI / 180);
  return Math.hypot(latitudeKm, longitudeKm);
}

/**
 * Keeps the booking map useful at a road-level zoom. A full pickup-to-drop-off
 * route can span a city and shrink the pickup car to an unusable size, so the
 * automatic frame uses only pickup, the nearest genuinely nearby Driver, and
 * the first 1.2 km of the authoritative route.
 */
export function bookingPreviewRegion(
  pickupPoint: NativeMapPoint | null | undefined,
  routePoints: NativeMapPoint[] | null | undefined,
  nearbyDriverPoints: NativeMapPoint[] | null | undefined,
): NativeMapRegion | null {
  const pickup = isNativeMapPoint(pickupPoint) ? pickupPoint : null;
  if (!pickup) return null;

  let routeAnchor: NativeMapPoint | null = null;
  for (const point of routePoints || []) {
    if (!isNativeMapPoint(point)) continue;
    if (approximateDistanceKm(pickup, point) <= BOOKING_ROUTE_LOOKAHEAD_KM) routeAnchor = point;
  }

  const nearbyDriver = (nearbyDriverPoints || [])
    .filter(isNativeMapPoint)
    .filter((point) => approximateDistanceKm(pickup, point) <= BOOKING_NEARBY_DRIVER_KM)
    .sort((left, right) => approximateDistanceKm(pickup, left) - approximateDistanceKm(pickup, right))[0] ?? null;

  const framePoints = [pickup, routeAnchor, nearbyDriver].filter(isNativeMapPoint);
  const latitudes = framePoints.map(([latitude]) => latitude);
  const longitudes = framePoints.map(([, longitude]) => longitude);
  const latitudeDelta = bounded(
    (Math.max(...latitudes) - Math.min(...latitudes)) * 2.35,
    BOOKING_MIN_LATITUDE_DELTA,
    BOOKING_MAX_LATITUDE_DELTA,
  );
  const longitudeDelta = bounded(
    (Math.max(...longitudes) - Math.min(...longitudes)) * 2.2,
    BOOKING_MIN_LONGITUDE_DELTA,
    BOOKING_MAX_LONGITUDE_DELTA,
  );

  return {
    // Shift the frame south so the pickup/nearby Driver remain above the
    // booking sheet, rather than being hidden under it.
    latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2 - latitudeDelta * 0.16,
    longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

/**
 * Frames the Driver and the next stop at a useful road-level zoom. The centre
 * is deliberately shifted south so both markers remain visible above the
 * Rider's bottom sheet without asking the Rider to pinch-zoom.
 */
export function nativeTrackingRegion(
  driverPoint: NativeMapPoint | null | undefined,
  targetPoint: NativeMapPoint | null | undefined,
  fallbackPoint: NativeMapPoint | null | undefined,
): NativeMapRegion | null {
  const driver = isNativeMapPoint(driverPoint) ? driverPoint : null;
  const target = isNativeMapPoint(targetPoint) ? targetPoint : null;
  const fallback = isNativeMapPoint(fallbackPoint) ? fallbackPoint : null;

  if (driver && target) {
    const latitudeSpan = bounded(Math.abs(driver[0] - target[0]) * 2.25, MIN_LATITUDE_DELTA, MAX_LATITUDE_DELTA);
    const longitudeSpan = bounded(Math.abs(driver[1] - target[1]) * 2.1, MIN_LONGITUDE_DELTA, MAX_LONGITUDE_DELTA);
    return {
      latitude: (driver[0] + target[0]) / 2 - latitudeSpan * 0.16,
      longitude: (driver[1] + target[1]) / 2,
      latitudeDelta: latitudeSpan,
      longitudeDelta: longitudeSpan,
    };
  }

  const point = driver || target || fallback;
  if (!point) return null;
  return {
    latitude: point[0],
    longitude: point[1],
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };
}
