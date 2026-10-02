import { describe, expect, it } from 'vitest';
import {
  matchPointToServerRoute,
  routeSegmentBearing,
} from '../lib/rider-route-matching';

describe('Rider server-route vehicle matching', () => {
  it('projects a nearby GPS fix on to the current server route segment', () => {
    const route: [number, number][] = [[5.6, -0.2], [5.6, -0.19]];
    const match = matchPointToServerRoute([5.60018, -0.195], route);

    expect(match).not.toBeNull();
    expect(match?.point[0]).toBeCloseTo(5.6, 5);
    expect(match?.point[1]).toBeCloseTo(-0.195, 5);
    expect(match?.distanceMeters).toBeLessThan(25);
    expect(match?.bearing).toBeCloseTo(90, 0);
  });

  it('uses the nearest route segment through a turn', () => {
    const route: [number, number][] = [[5.6, -0.2], [5.6, -0.19], [5.61, -0.19]];
    const match = matchPointToServerRoute([5.605, -0.18984], route);

    expect(match?.segmentIndex).toBe(1);
    expect(match?.point[0]).toBeCloseTo(5.605, 4);
    expect(match?.point[1]).toBeCloseTo(-0.19, 4);
    expect(match?.bearing).toBeCloseTo(0, 0);
  });

  it('does not snap a Driver to a stale route when the GPS fix is too far away', () => {
    const route: [number, number][] = [[5.6, -0.2], [5.6, -0.19]];
    expect(matchPointToServerRoute([5.605, -0.195], route)).toBeNull();
  });

  it('calculates route orientation in both cardinal directions', () => {
    expect(routeSegmentBearing([5.6, -0.2], [5.61, -0.2])).toBeCloseTo(0, 0);
    expect(routeSegmentBearing([5.61, -0.2], [5.6, -0.2])).toBeCloseTo(180, 0);
  });
});
