export const RIDER_DRIVER_INITIAL_MOTION_DURATION_MS = 2_650;
export const RIDER_DRIVER_MOTION_LATENCY_BUFFER_MS = 1_200;
export const RIDER_DRIVER_MIN_MOTION_DURATION_MS = 1_200;
export const RIDER_DRIVER_MAX_MOTION_DURATION_MS = 9_000;

function timestampMs(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Renders a verified GPS segment slightly behind its received endpoint. The
 * short buffer absorbs ordinary Firestore/network delivery delay so a Rider
 * sees one continuous glide instead of a car that finishes early and waits for
 * the next point. It never extrapolates past the newest authenticated Driver
 * coordinate.
 */
export function riderDriverMarkerMotionDuration(
  previousUpdatedAtMs: number | null,
  currentUpdatedAt: string | null | undefined,
) {
  const currentUpdatedAtMs = timestampMs(currentUpdatedAt);
  if (previousUpdatedAtMs === null || currentUpdatedAtMs === null) {
    return RIDER_DRIVER_INITIAL_MOTION_DURATION_MS;
  }

  const intervalMs = currentUpdatedAtMs - previousUpdatedAtMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return RIDER_DRIVER_INITIAL_MOTION_DURATION_MS;
  }

  return Math.max(
    RIDER_DRIVER_MIN_MOTION_DURATION_MS,
    Math.min(
      RIDER_DRIVER_MAX_MOTION_DURATION_MS,
      Math.round(intervalMs + RIDER_DRIVER_MOTION_LATENCY_BUFFER_MS),
    ),
  );
}
