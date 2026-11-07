export const RIDER_DRIVER_INITIAL_MOTION_DURATION_MS = 1_800;
export const RIDER_DRIVER_MAX_MOTION_DURATION_MS = 9_000;
// Keep the marker moving almost until the next authenticated GPS sample.
// A larger headroom made the vehicle visibly pause between otherwise healthy
// location updates, especially on the normal 2-3 second Driver cadence.
export const RIDER_DRIVER_MOTION_COMPLETION_RATIO = 0.97;

function timestampMs(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Animate only the verified segment between two server-received GPS samples. */
export function riderDriverMarkerMotionDuration(
  previousUpdatedAtMs: number | null,
  currentUpdatedAt: string | null | undefined,
) {
  const currentUpdatedAtMs = timestampMs(currentUpdatedAt);
  if (previousUpdatedAtMs === null || currentUpdatedAtMs === null) {
    return RIDER_DRIVER_INITIAL_MOTION_DURATION_MS;
  }
  const intervalMs = currentUpdatedAtMs - previousUpdatedAtMs;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return RIDER_DRIVER_INITIAL_MOTION_DURATION_MS;
  return Math.max(1, Math.min(RIDER_DRIVER_MAX_MOTION_DURATION_MS,
    Math.round(intervalMs * RIDER_DRIVER_MOTION_COMPLETION_RATIO)));
}
