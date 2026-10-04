import {
  matchPointToServerRoute,
  routeSegmentBearing,
  type RoutePoint,
} from './rider-route-matching';

export type RiderRouteAnimationStep = {
  point: RoutePoint;
  bearing: number;
  durationMs: number;
};

export type RiderRouteAnimationPlan = {
  /** `road` only means the visual marker traverses verified server route geometry. */
  mode: 'road' | 'direct' | 'stationary';
  steps: RiderRouteAnimationStep[];
};

export type RiderRouteAnimationInput = {
  from: RoutePoint | null | undefined;
  to: RoutePoint | null | undefined;
  routePoints?: RoutePoint[] | null;
  durationMs: number;
  /** Native heading is only used when server road geometry cannot be trusted. */
  fallbackBearing?: number | null;
  /** Server-written timestamp from `live_route_metrics.updated_at`. */
  routeUpdatedAt?: string | null;
  /** Authenticated Driver presence timestamp for the incoming GPS coordinate. */
  locationUpdatedAt?: string | null;
  nowMs?: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const MIN_ANIMATION_DURATION_MS = 900;
const MAX_ANIMATION_DURATION_MS = 7_500;
const MAX_SERVER_ROUTE_AGE_MS = 45_000;
const MAX_ROUTE_ANIMATION_SPAN_METERS = 750;
const MIN_STRAIGHT_SAMPLE_METERS = 35;
const MAX_ROUTE_ANIMATION_STEPS = 32;
const TURN_THRESHOLD_DEGREES = 12;

function isRoutePoint(value: unknown): value is RoutePoint {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
    && Math.abs(Number(value[0])) <= 90
    && Math.abs(Number(value[1])) <= 180;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(from: RoutePoint, to: RoutePoint) {
  const latitudeDifference = radians(to[0] - from[0]);
  const longitudeDifference = radians(to[1] - from[1]);
  const startLatitude = radians(from[0]);
  const endLatitude = radians(to[0]);
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boundedDuration(value: number) {
  return Math.max(MIN_ANIMATION_DURATION_MS, Math.min(MAX_ANIMATION_DURATION_MS, Math.round(value)));
}

function timestampMs(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function validBearing(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? (Number(value) % 360 + 360) % 360 : null;
}

function angularDifference(left: number, right: number) {
  return Math.abs(((right - left + 540) % 360) - 180);
}

function pointsEqual(left: RoutePoint, right: RoutePoint) {
  return distanceMeters(left, right) < 0.35;
}

function routeIsFresh(input: RiderRouteAnimationInput) {
  const routeTimestamp = timestampMs(input.routeUpdatedAt);
  const locationTimestamp = timestampMs(input.locationUpdatedAt);
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();

  // Route geometry without the server refresh timestamp might be a booking
  // preview or a legacy snapshot. It is safe to draw but not to traverse.
  if (routeTimestamp === null) return false;

  // A route generated before a much newer Driver fix can no longer safely
  // describe where that Driver is heading. Do not make the marker traverse it.
  if (routeTimestamp !== null && locationTimestamp !== null
    && locationTimestamp - routeTimestamp > MAX_SERVER_ROUTE_AGE_MS) return false;

  // The current clock check protects a preserved Rider state after a long
  // background pause.
  if (routeTimestamp !== null && now - routeTimestamp > MAX_SERVER_ROUTE_AGE_MS) return false;
  return true;
}

function directPlan(input: RiderRouteAnimationInput): RiderRouteAnimationPlan {
  if (!isRoutePoint(input.from) || !isRoutePoint(input.to)) {
    return { mode: 'stationary', steps: [] };
  }

  if (pointsEqual(input.from, input.to)) {
    return { mode: 'stationary', steps: [] };
  }

  return {
    mode: 'direct',
    steps: [{
      point: input.to,
      bearing: validBearing(input.fallbackBearing) ?? routeSegmentBearing(input.from, input.to),
      durationMs: boundedDuration(input.durationMs),
    }],
  };
}

/**
 * Retains sharp turns and samples only long straight sections. The native marker
 * interpolates smoothly between these points, so no client-created path changes
 * the Driver's real GPS state.
 */
function compactRoadPath(from: RoutePoint, candidates: RoutePoint[]) {
  const valid = candidates.filter(isRoutePoint);
  if (!valid.length) return [];

  const retained: RoutePoint[] = [];
  let lastRetained = from;
  for (let index = 0; index < valid.length; index += 1) {
    const point = valid[index];
    const next = valid[index + 1];
    const final = index === valid.length - 1;
    const distanceSinceLast = distanceMeters(lastRetained, point);
    const turn = !final && next
      ? angularDifference(routeSegmentBearing(lastRetained, point), routeSegmentBearing(point, next)) >= TURN_THRESHOLD_DEGREES
      : false;

    if (final || turn || distanceSinceLast >= MIN_STRAIGHT_SAMPLE_METERS) {
      if (!pointsEqual(lastRetained, point)) {
        retained.push(point);
        lastRetained = point;
      }
    }
  }

  // Very dense, server-generated geometry can contain more vertices than can
  // be animated meaningfully in one GPS interval. Preserve every detected turn
  // in normal routes; for an extreme path, sample in-order rather than queueing
  // a backlog that would make the marker lag behind real presence updates.
  if (retained.length <= MAX_ROUTE_ANIMATION_STEPS) return retained;
  const stride = Math.ceil(retained.length / MAX_ROUTE_ANIMATION_STEPS);
  return retained.filter((_, index) => index % stride === 0 || index === retained.length - 1);
}

function distributeDurations(from: RoutePoint, points: RoutePoint[], totalDurationMs: number) {
  const legLengths = points.map((point, index) => distanceMeters(index === 0 ? from : points[index - 1], point));
  const totalLength = legLengths.reduce((sum, length) => sum + length, 0);
  const minimum = Math.min(120, Math.max(1, Math.floor(totalDurationMs / Math.max(1, points.length))));
  const flexible = Math.max(0, totalDurationMs - minimum * points.length);
  const durations = legLengths.map((length) => minimum + Math.round(
    flexible * (totalLength > 0 ? length / totalLength : 1 / points.length),
  ));
  const difference = totalDurationMs - durations.reduce((sum, duration) => sum + duration, 0);
  if (durations.length) durations[durations.length - 1] += difference;
  return durations;
}

/**
 * Plans a visual motion path only when both rendered marker positions can be
 * matched forward along a fresh, server-published road route. All other cases
 * deliberately fall back to the actual next Driver coordinate.
 */
export function planRiderRouteAnimation(input: RiderRouteAnimationInput): RiderRouteAnimationPlan {
  if (!isRoutePoint(input.from) || !isRoutePoint(input.to)) return directPlan(input);
  const route = (input.routePoints || []).filter(isRoutePoint);
  if (route.length < 2 || !routeIsFresh(input)) return directPlan(input);

  const fromMatch = matchPointToServerRoute(input.from, route);
  const toMatch = matchPointToServerRoute(input.to, route);
  if (!fromMatch || !toMatch) return directPlan(input);

  const forward = toMatch.segmentIndex > fromMatch.segmentIndex
    || (toMatch.segmentIndex === fromMatch.segmentIndex && toMatch.segmentProgress > fromMatch.segmentProgress + 0.0001);
  if (!forward) return directPlan(input);

  const routeCandidates: RoutePoint[] = [];
  for (let index = fromMatch.segmentIndex + 1; index <= toMatch.segmentIndex; index += 1) {
    routeCandidates.push(route[index]);
  }
  routeCandidates.push(toMatch.point);
  const points = compactRoadPath(fromMatch.point, routeCandidates);
  if (!points.length) return directPlan(input);

  const spanMeters = points.reduce((total, point, index) => total + distanceMeters(index === 0 ? fromMatch.point : points[index - 1], point), 0);
  if (!Number.isFinite(spanMeters) || spanMeters > MAX_ROUTE_ANIMATION_SPAN_METERS) return directPlan(input);

  const durations = distributeDurations(fromMatch.point, points, boundedDuration(input.durationMs));
  return {
    mode: 'road',
    steps: points.map((point, index) => ({
      point,
      // Use the server road segment direction at every retained bend so the
      // branded vehicle turns with the line rather than only at the final GPS fix.
      bearing: routeSegmentBearing(index === 0 ? fromMatch.point : points[index - 1], point),
      durationMs: durations[index],
    })),
  };
}

export {
  MAX_ROUTE_ANIMATION_SPAN_METERS,
  MAX_SERVER_ROUTE_AGE_MS,
};
