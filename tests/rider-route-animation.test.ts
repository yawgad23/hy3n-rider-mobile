import { describe, expect, it } from 'vitest';
import { planRiderRouteAnimation } from '../lib/rider-route-animation';

const freshRouteAt = '2026-10-04T10:00:00.000Z';
const freshNow = new Date(freshRouteAt).getTime() + 3_000;
const rightAngleRoute: [number, number][] = [
  [5.6, -0.2],
  [5.6, -0.199],
  [5.601, -0.199],
  [5.601, -0.198],
];

describe('Rider route-aware vehicle animation', () => {
  it('moves through server road turns in forward order and rotates at each turn', () => {
    const plan = planRiderRouteAnimation({
      from: [5.6, -0.1998],
      to: [5.6008, -0.199],
      routePoints: rightAngleRoute,
      durationMs: 3_000,
      routeUpdatedAt: freshRouteAt,
      locationUpdatedAt: '2026-10-04T10:00:03.000Z',
      nowMs: freshNow,
    });

    expect(plan.mode).toBe('road');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].point).toEqual([5.6, -0.199]);
    expect(plan.steps[1].point[0]).toBeCloseTo(5.6008, 5);
    expect(plan.steps[1].point[1]).toBeCloseTo(-0.199, 5);
    expect(plan.steps[0].bearing).toBeCloseTo(90, 0);
    expect(plan.steps[1].bearing).toBeCloseTo(0, 0);
    expect(plan.steps.reduce((total, step) => total + step.durationMs, 0)).toBe(3_000);
    expect(plan.steps.every((step) => step.durationMs > 0)).toBe(true);
  });

  it('falls back to the authenticated Driver coordinate when road geometry is unavailable or off route', () => {
    const noRoute = planRiderRouteAnimation({
      from: [5.6, -0.2],
      to: [5.6001, -0.1999],
      durationMs: 2_400,
      fallbackBearing: 41,
    });
    const offRoute = planRiderRouteAnimation({
      from: [5.604, -0.2],
      to: [5.6041, -0.1999],
      routePoints: rightAngleRoute,
      durationMs: 2_400,
      routeUpdatedAt: freshRouteAt,
      locationUpdatedAt: '2026-10-04T10:00:03.000Z',
      nowMs: freshNow,
    });
    const untimestampedRoute = planRiderRouteAnimation({
      from: [5.6, -0.1998],
      to: [5.6008, -0.199],
      routePoints: rightAngleRoute,
      durationMs: 2_400,
    });

    expect(noRoute).toMatchObject({ mode: 'direct', steps: [{ point: [5.6001, -0.1999], bearing: 41, durationMs: 2_400 }] });
    expect(offRoute).toMatchObject({ mode: 'direct', steps: [{ point: [5.6041, -0.1999], durationMs: 2_400 }] });
    expect(untimestampedRoute.mode).toBe('direct');
  });

  it('does not replay a stale, backwards, or implausibly long server route segment', () => {
    const stale = planRiderRouteAnimation({
      from: [5.6, -0.1998],
      to: [5.6008, -0.199],
      routePoints: rightAngleRoute,
      durationMs: 3_000,
      routeUpdatedAt: '2026-10-04T09:58:00.000Z',
      locationUpdatedAt: '2026-10-04T10:00:03.000Z',
      nowMs: freshNow,
    });
    const backwards = planRiderRouteAnimation({
      from: [5.6008, -0.199],
      to: [5.6, -0.1998],
      routePoints: rightAngleRoute,
      durationMs: 3_000,
      routeUpdatedAt: freshRouteAt,
      locationUpdatedAt: '2026-10-04T10:00:03.000Z',
      nowMs: freshNow,
    });
    const longSpan = planRiderRouteAnimation({
      from: [5.6, -0.2],
      to: [5.6, -0.19],
      routePoints: [[5.6, -0.2], [5.6, -0.195], [5.6, -0.19]],
      durationMs: 3_000,
      routeUpdatedAt: freshRouteAt,
      locationUpdatedAt: '2026-10-04T10:00:03.000Z',
      nowMs: freshNow,
    });

    expect(stale.mode).toBe('direct');
    expect(backwards.mode).toBe('direct');
    expect(longSpan.mode).toBe('direct');
  });

  it('returns stationary movement for an unchanged point instead of queuing an animation', () => {
    expect(planRiderRouteAnimation({
      from: [5.6, -0.2],
      to: [5.6, -0.2],
      durationMs: 3_000,
    })).toEqual({ mode: 'stationary', steps: [] });
  });
});
