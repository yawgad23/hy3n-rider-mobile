export type RoutePoint = [latitude: number, longitude: number];

export type RouteMatch = {
  point: RoutePoint;
  segmentIndex: number;
  /** Normalized position on the matched route segment (0=start, 1=end). */
  segmentProgress: number;
  distanceMeters: number;
  bearing: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_ROAD_MATCH_DISTANCE_METERS = 80;

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function degrees(value: number) {
  return (value * 180) / Math.PI;
}

function isPoint(point: unknown): point is RoutePoint {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]))
    && Math.abs(Number(point[0])) <= 90
    && Math.abs(Number(point[1])) <= 180;
}

/** Returns the initial compass direction from one coordinate to another. */
export function routeSegmentBearing(from: RoutePoint, to: RoutePoint): number {
  const lat1 = radians(from[0]);
  const lat2 = radians(to[0]);
  const longitudeDifference = radians(to[1] - from[1]);
  const y = Math.sin(longitudeDifference) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitudeDifference);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function localMeters(point: RoutePoint, origin: RoutePoint): [number, number] {
  const latitudeScale = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const longitudeScale = latitudeScale * Math.cos(radians(origin[0]));
  return [
    (point[1] - origin[1]) * longitudeScale,
    (point[0] - origin[0]) * latitudeScale,
  ];
}

function coordinateFromLocalMeters([x, y]: [number, number], origin: RoutePoint): RoutePoint {
  const latitudeScale = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const longitudeScale = latitudeScale * Math.cos(radians(origin[0]));
  return [
    origin[0] + y / latitudeScale,
    origin[1] + x / longitudeScale,
  ];
}

/**
 * Projects a GPS point on to the nearest segment of a trusted, server-published
 * route. The match is discarded when the GPS point is too far from the route,
 * avoiding a visual lie when the route has gone stale or a Driver genuinely detours.
 */
export function matchPointToServerRoute(
  gpsPoint: RoutePoint | null | undefined,
  routePoints: RoutePoint[] | null | undefined,
  maxDistanceMeters = MAX_ROAD_MATCH_DISTANCE_METERS,
): RouteMatch | null {
  if (!isPoint(gpsPoint) || !Array.isArray(routePoints)) return null;
  const route = routePoints.filter(isPoint);
  if (route.length < 2) return null;

  const [gpsX, gpsY] = localMeters(gpsPoint, gpsPoint);
  let best: RouteMatch | null = null;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const [startX, startY] = localMeters(start, gpsPoint);
    const [endX, endY] = localMeters(end, gpsPoint);
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const squaredLength = segmentX * segmentX + segmentY * segmentY;
    if (squaredLength < 0.01) continue;

    const progress = Math.max(0, Math.min(1, ((gpsX - startX) * segmentX + (gpsY - startY) * segmentY) / squaredLength));
    const projectedLocal: [number, number] = [startX + segmentX * progress, startY + segmentY * progress];
    const distanceMeters = Math.hypot(gpsX - projectedLocal[0], gpsY - projectedLocal[1]);
    if (best && distanceMeters >= best.distanceMeters) continue;

    best = {
      point: coordinateFromLocalMeters(projectedLocal, gpsPoint),
      segmentIndex: index,
      segmentProgress: progress,
      distanceMeters,
      bearing: routeSegmentBearing(start, end),
    };
  }

  return best && best.distanceMeters <= maxDistanceMeters ? best : null;
}

export { MAX_ROAD_MATCH_DISTANCE_METERS };
