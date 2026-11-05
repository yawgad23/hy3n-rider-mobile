import { describe, expect, it } from 'vitest';
import { calculateRiderWaitingTime } from '../lib/rider-waiting-time';

describe('Rider waiting time', () => {
  const arrivedAt = '2026-11-05T10:00:00.000Z';
  const start = new Date(arrivedAt).getTime();

  it('keeps the first three minutes complimentary', () => {
    expect(calculateRiderWaitingTime({ arrivedAt, now: start + 179_000, ratePerMinute: 0.55 })).toMatchObject({
      waitedSeconds: 179,
      freeSecondsRemaining: 1,
      chargeableMinutes: 0,
      waitingFee: 0,
    });
  });

  it('starts charging only after the three-minute free period', () => {
    expect(calculateRiderWaitingTime({ arrivedAt, now: start + 240_000, ratePerMinute: 0.55 })).toMatchObject({
      waitedSeconds: 240,
      freeSecondsRemaining: 0,
      chargeableMinutes: 1,
      waitingFee: 0.55,
    });
  });

  it('does not charge for invalid or future arrival timestamps', () => {
    expect(calculateRiderWaitingTime({ arrivedAt: 'not-a-date', now: start + 600_000, ratePerMinute: 0.55 }).waitingFee).toBe(0);
    expect(calculateRiderWaitingTime({ arrivedAt: new Date(start + 60_000).toISOString(), now: start, ratePerMinute: 0.55 }).waitedSeconds).toBe(0);
  });

  it('uses the ride rate snapshot supplied by the caller for two chargeable minutes', () => {
    expect(calculateRiderWaitingTime({ arrivedAt, now: start + 300_000, ratePerMinute: 0.88 }).waitingFee).toBe(1.76);
  });
});
