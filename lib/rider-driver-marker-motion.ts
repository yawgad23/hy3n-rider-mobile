export const RIDER_DRIVER_INITIAL_MOTION_DURATION_MS = 1_800;
export const RIDER_DRIVER_MAX_MOTION_DURATION_MS = 9_000;
// Finish each visual segment just before the next expected GPS sample. The
// previous implementation added 1.2 seconds to the sample interval, so a
// healthy 2-second stream created 3.2-second animations that were repeatedly
// interrupted by the next update. That made the car perpetually lag behind.
export const RIDER_DRIVER_MOTION_COMPLETION_RATIO = 0.88;

function timestampMs(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Animate a verified GPS segment within the cadence of real server-received
 * Driver samples. The small headroom absorbs ordinary scheduling jitter while
 * ensuring a healthy stream can reach each new point before it is superseded.
 * No position is extrapolated beyond the newest authenticated Driver point.
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
    1,
    Math.min(
      RIDER_DRIVER_MAX_MOTION_DURATION_MS,
      Math.round(intervalMs * RIDER_DRIVER_MOTION_COMPLETION_RATIO),
    ),
  );
}
