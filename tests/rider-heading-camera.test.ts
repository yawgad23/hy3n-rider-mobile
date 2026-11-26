import { describe, expect, it } from 'vitest';
import { nativeTrackingRegion, type NativeMapPoint } from '../lib/native-map-camera';
import { riderHeadingUpCamera, riderRegionCameraZoom, type RiderHeadingCameraSample } from '../lib/rider-heading-camera';

const point: NativeMapPoint = [5.7, -0.1];
const region = nativeTrackingRegion(point, null, null)!;
const viewport = { width: 360, height: 800 };
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;

// Pure camera policy only; these do not prove native screen delivery.
describe('Rider automatic heading-up camera', () => {
  it.each([0, 45, 90, 180, 270, 359])('initially points travel direction %s upward without changing the car coordinate', (heading) => {
    const sample = riderHeadingUpCamera(point, heading, region, viewport, null, 1_000, 0)!;
    expect(sample.camera.heading).toBe(heading);
    expect(sample.camera.pitch).toBe(0);
    expect(sample.point).toEqual(point);
    expect(sample.camera.zoom).toBe(riderRegionCameraZoom(region, viewport));
    const north = point[0] - sample.camera.center.latitude;
    const east = (point[1] - sample.camera.center.longitude) * Math.cos(point[0] * Math.PI / 180);
    const radians = heading * Math.PI / 180;
    expect(north * Math.sin(radians) - east * Math.cos(radians)).toBeCloseTo(0, 10);
    expect(north * Math.cos(radians) + east * Math.sin(radians)).toBeGreaterThan(0);
  });

  it('bounds genuine turns at actual immediate camera writes and converges at fixed scale', () => {
    let sample = riderHeadingUpCamera(point, 0, region, viewport, null, 1_000, 0)!;
    const initialZoom = sample.camera.zoom;
    for (let index = 1; index <= 50; index += 1) {
      const moved: NativeMapPoint = [point[0], point[1] + index * 0.000002];
      const next = riderHeadingUpCamera(moved, 90, region, viewport, sample, 1_000 + index * 50, 30)!;
      expect(turn(sample.camera.heading, next.camera.heading)).toBeGreaterThanOrEqual(0);
      expect(turn(sample.camera.heading, next.camera.heading)).toBeLessThanOrEqual(6 + 1e-9);
      expect(next.point).toEqual(moved);
      expect(next.camera.zoom).toBe(initialZoom);
      sample = next;
    }
    expect(Math.abs(turn(sample.camera.heading, 90))).toBeLessThan(0.1);
  });

  it('359 to 1 takes the short arc and no long stalled interval permits an abrupt turn', () => {
    const first = riderHeadingUpCamera(point, 359, region, viewport, null, 1_000, 0)!;
    const next = riderHeadingUpCamera([5.70001, -0.1], 1, region, viewport, first, 1_050, 10)!;
    expect(turn(359, next.camera.heading)).toBeGreaterThan(0);
    expect(turn(359, next.camera.heading)).toBeLessThan(2);
    const delayed = riderHeadingUpCamera([5.7001, -0.1], 90, region, viewport, first, 61_000, 10)!;
    expect(Math.abs(turn(first.camera.heading, delayed.camera.heading))).toBeLessThanOrEqual(12 + 1e-9);
  });

  it('compass drift cannot rotate the parked camera or create endless identical writes', () => {
    const first = riderHeadingUpCamera(point, 90, region, viewport, null, 1_000, 0)!;
    for (const movement of [0, 1, -1, Number.NaN, Infinity]) {
      expect(riderHeadingUpCamera(point, 270, region, viewport, first, 2_000, movement)).toBeNull();
      const resized = riderHeadingUpCamera(point, 270, region, { width: 400, height: 800 }, first, 2_000, movement)!;
      expect(resized.camera.heading).toBe(90);
    }
  });

  it('unavailable headings retain the camera bearing instead of being interpreted as north', () => {
    const first = riderHeadingUpCamera(point, 90, region, viewport, null, 1_000, 0)!;
    for (const heading of [Number.NaN, -1, Infinity]) {
      const moved = riderHeadingUpCamera([5.70001, -0.1], heading, region, viewport, first, 1_050, 10)!;
      expect(moved.camera.heading).toBe(90);
    }
  });

  it('centers remain finite at date-line crossings and high latitudes', () => {
    for (const latitude of [-90, -85, 0, 85, 90]) for (const longitude of [-180, 180]) {
      const sample = riderHeadingUpCamera([latitude, longitude], 90, region, viewport, null, 1_000, 0)!;
      expect(Number.isFinite(sample.camera.center.latitude)).toBe(true);
      expect(Math.abs(sample.camera.center.latitude)).toBeLessThanOrEqual(90);
      expect(sample.camera.center.longitude).toBeGreaterThanOrEqual(-180);
      expect(sample.camera.center.longitude).toBeLessThan(180);
      expect(Number.isFinite(sample.camera.zoom)).toBe(true);
    }
  });

  it('invalid points and times never emit a native camera command', () => {
    for (const invalid of [[NaN, 0], [91, 0], [0, 181]] as NativeMapPoint[]) {
      expect(riderHeadingUpCamera(invalid, 0, region, viewport, null, 1_000, 0)).toBeNull();
    }
    expect(riderHeadingUpCamera(point, 0, region, viewport, null, Infinity, 0)).toBeNull();
  });

  it('zoom matches existing region scale, responds to real layout, and sanitizes missing dimensions', () => {
    const zoom = riderRegionCameraZoom(region, viewport);
    expect(zoom).toBeGreaterThan(13);
    expect(zoom).toBeLessThan(18);
    expect(riderRegionCameraZoom(region, { width: 720, height: 1_600 })).toBeCloseTo(zoom + 1, 10);
    expect(riderRegionCameraZoom(region, { width: NaN, height: -1 })).toBe(zoom);
    expect(Number.isFinite(riderRegionCameraZoom({ ...region, latitudeDelta: NaN, longitudeDelta: -1 }, viewport))).toBe(true);
  });
});
