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

  it('adds a small receipt buffer so normal live GPS segments do not visibly pause', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:00:03.000Z')).toBe(4_200);
  });

  it('caps delayed packets without inventing travel beyond the newest real point', () => {
    const previous = Date.parse('2026-10-16T19:00:00.000Z');
    expect(riderDriverMarkerMotionDuration(previous, '2026-10-16T19:01:00.000Z'))
      .toBe(RIDER_DRIVER_MAX_MOTION_DURATION_MS);
  });
});
