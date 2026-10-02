import { describe, expect, it } from 'vitest';
import { nativeTrackingRegion } from '../lib/native-map-camera';

describe('native Google Maps tracking camera', () => {
  it('keeps a Driver and pickup in a road-level visible frame', () => {
    const region = nativeTrackingRegion([5.602, -0.19], [5.61, -0.184], null);
    expect(region).toMatchObject({ longitude: -0.187, latitudeDelta: expect.any(Number) });
    expect(region!.latitudeDelta).toBeGreaterThanOrEqual(0.0065);
    expect(region!.latitudeDelta).toBeLessThanOrEqual(0.06);
  });

  it('uses the last valid position while no route is active', () => {
    expect(nativeTrackingRegion(null, null, [5.6037, -0.187])).toEqual({
      latitude: 5.6037,
      longitude: -0.187,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
  });
});
