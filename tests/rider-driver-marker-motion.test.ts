import { describe, expect, it } from 'vitest';
import {
  RIDER_DRIVER_INITIAL_MOTION_DURATION_MS,
  RIDER_DRIVER_MAX_MOTION_DURATION_MS,
  riderDriverMarkerMotionDuration,
} from '../lib/rider-driver-marker-motion';

describe('Rider Driver marker motion timing', () => {
  it('uses a stable initial duration until two authenticated GPS timestamps exist', () => {
    expect(riderDriverMarkerMotionDuration(null, '2026-10-16T19:00:00.000Z'))
      .toBe(RIDER_DRIVER_INITIAL_MOTION_DURATION_MS);
    expect(riderDriverMarkerMotionDuration(Date.parse('2026-10-16T19:00:00.000Z'), null))
      .toBe(RIDER_DRIVER_INITIAL_MOTION_DURATION_MS);
  });

  it('finishes a normal GPS segment before the next expected update', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:02.000Z')).toBe(1_760);
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:03.000Z')).toBe(2_640);
  });

  it('never schedules normal motion longer than its GPS cadence and caps delayed packets', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    const fastCadence = riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:01.000Z');
    expect(fastCadence).toBeLessThan(1_000);
  });

  it('caps delayed packets without inventing travel beyond the newest real point', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:01:00.000Z'))
      .toBe(RIDER_DRIVER_MAX_MOTION_DURATION_MS);
  });
});
