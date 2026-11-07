import { describe, expect, it } from 'vitest';
import {
  RIDER_DRIVER_INITIAL_MOTION_DURATION_MS,
  RIDER_DRIVER_MAX_MOTION_DURATION_MS,
  RIDER_DRIVER_MOTION_COMPLETION_RATIO,
  riderDriverMarkerMotionDuration,
} from '../lib/rider-driver-marker-motion';

describe('Rider Driver marker motion timing', () => {
  it('uses a stable initial duration until two authenticated GPS timestamps exist', () => {
    expect(riderDriverMarkerMotionDuration(null, '2026-10-16T19:00:00.000Z')).toBe(RIDER_DRIVER_INITIAL_MOTION_DURATION_MS);
    expect(riderDriverMarkerMotionDuration(Date.parse('2026-10-16T19:00:00.000Z'), null)).toBe(RIDER_DRIVER_INITIAL_MOTION_DURATION_MS);
  });
  it('finishes almost at the next GPS sample to reduce visible pauses', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:02.000Z')).toBe(1_940);
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:03.000Z')).toBe(2_910);
    expect(RIDER_DRIVER_MOTION_COMPLETION_RATIO).toBe(0.97);
  });
  it('caps delayed packets and handles a rapid GPS cadence', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:01.000Z')).toBe(970);
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:01:00.000Z')).toBe(RIDER_DRIVER_MAX_MOTION_DURATION_MS);
  });
});
