export type RiderWaitingTime = {
  waitedSeconds: number;
  freeSecondsRemaining: number;
  chargeableMinutes: number;
  waitingFee: number;
};

/** Uses the server arrival timestamp and snapshotted server rate. */
export function calculateRiderWaitingTime(input: {
  arrivedAt?: unknown;
  now?: number;
  freeMinutes?: number;
  ratePerMinute?: number;
}): RiderWaitingTime {
  const arrivedAtMs = new Date(String(input.arrivedAt || '')).getTime();
  const nowMs = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const freeMinutes = Number.isFinite(input.freeMinutes) && Number(input.freeMinutes) >= 0
    ? Math.min(Number(input.freeMinutes), 30)
    : 3;
  const rate = Number.isFinite(input.ratePerMinute) && Number(input.ratePerMinute) >= 0
    ? Number(input.ratePerMinute)
    : 0;
  const waitedSeconds = Number.isFinite(arrivedAtMs) && arrivedAtMs > 0
    ? Math.max(0, Math.floor((nowMs - arrivedAtMs) / 1000))
    : 0;
  const freeSecondsRemaining = Math.max(0, freeMinutes * 60 - waitedSeconds);
  const chargeableMinutes = Math.max(0, (waitedSeconds - freeMinutes * 60) / 60);
  return {
    waitedSeconds,
    freeSecondsRemaining,
    chargeableMinutes,
    waitingFee: Number((chargeableMinutes * rate).toFixed(2)),
  };
}
