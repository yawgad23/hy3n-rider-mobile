import { describe, expect, it } from 'vitest';
import { bookingPreviewRegion, nativeTrackingRegion } from '../lib/native-map-camera';

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

  it('keeps a city-spanning booking route at a road-level pickup zoom', () => {
    const region = bookingPreviewRegion(
      [5.6037, -0.187],
      [[5.6037, -0.187], [5.609, -0.184], [5.612, -0.18], [5.68, -0.08]],
      [[5.607, -0.19]],
    );
    expect(region).not.toBeNull();
    expect(region!.latitudeDelta).toBeLessThanOrEqual(0.028);
    expect(region!.longitudeDelta).toBeLessThanOrEqual(0.032);
    expect(region!.latitude).toBeLessThan(5.608);
  });

  it('does not widen the booking camera for a Driver who is not genuinely nearby', () => {
    const region = bookingPreviewRegion(
      [5.6037, -0.187],
      [],
      [[5.75, -0.02]],
    );
    expect(region).toEqual({
      latitude: 5.6021,
      longitude: -0.187,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  });
});
