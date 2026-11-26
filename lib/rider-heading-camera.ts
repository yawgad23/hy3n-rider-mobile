import { isNativeMapPoint, type NativeMapPoint, type NativeMapRegion } from './native-map-camera';

export type RiderHeadingCamera = {
  center: { latitude: number; longitude: number };
  heading: number;
  pitch: number;
  zoom: number;
};
export type RiderHeadingCameraSample = { point: NativeMapPoint; atMs: number; camera: RiderHeadingCamera };
export type RiderCameraViewport = { width: number; height: number };

const normalHeading = (value: number) => ((value % 360) + 360) % 360;
const signedTurn = (from: number, to: number) => ((to - from + 540) % 360) - 180;
const boundedLatitude = (value: number) => Math.max(-85.05112878, Math.min(85.05112878, value));
const mercatorY = (latitude: number) => {
  const sine = Math.sin(boundedLatitude(latitude) * Math.PI / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
};

/** Translate the existing region's road-level scale into the supported Google camera API. */
export function riderRegionCameraZoom(region: NativeMapRegion, viewport: RiderCameraViewport) {
  const width = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 360;
  const height = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 800;
  const longitudeSpan = Number.isFinite(region.longitudeDelta) && region.longitudeDelta > 0 ? Math.min(360, region.longitudeDelta) / 360 : 0.016 / 360;
  const latitudeDelta = Number.isFinite(region.latitudeDelta) && region.latitudeDelta > 0 ? region.latitudeDelta : 0.014;
  const latitude = Number.isFinite(region.latitude) ? region.latitude : 0;
  const latitudeSpan = Math.max(1e-9, Math.abs(mercatorY(latitude + latitudeDelta / 2) - mercatorY(latitude - latitudeDelta / 2)));
  const zoom = Math.min(Math.log2(width / (256 * longitudeSpan)), Math.log2(height / (256 * latitudeSpan)));
  return Math.max(3, Math.min(21, zoom));
}

/**
 * Camera presentation only. Consume the already-rendered car coordinate and
 * bearing; never alter the marker animation, accepted GPS, route or trip data.
 */
export function riderHeadingUpCamera(
  point: NativeMapPoint,
  visualHeading: number,
  region: NativeMapRegion,
  viewport: RiderCameraViewport,
  previous: RiderHeadingCameraSample | null,
  nowMs: number,
  acceptedMovementMeters: number,
): RiderHeadingCameraSample | null {
  if (!isNativeMapPoint(point) || !Number.isFinite(nowMs)) return null;
  const latitude = Number(point[0]);
  const longitude = Number(point[1]);
  const desired = Number.isFinite(visualHeading) && visualHeading >= 0
    ? normalHeading(visualHeading) : previous?.camera.heading ?? 0;
  let heading = desired;
  if (previous) {
    const moving = Number.isFinite(acceptedMovementMeters) && acceptedMovementMeters >= 1.5;
    if (!moving) heading = previous.camera.heading;
    else {
      // The bridge exposes immediate setCamera, so spend no long JS/GPS gap in
      // one rotation. Small shortest-arc steps also handle 359 -> 1 correctly.
      const elapsed = Math.max(0, Math.min(100, nowMs - previous.atMs));
      const delta = signedTurn(previous.camera.heading, desired);
      const eased = delta * (1 - Math.exp(-elapsed / 150));
      const limit = 120 * elapsed / 1_000;
      heading = normalHeading(previous.camera.heading + Math.max(-limit, Math.min(limit, eased)));
    }
  }
  const radians = heading * Math.PI / 180;
  const delta = Number.isFinite(region.latitudeDelta) && region.latitudeDelta > 0 ? region.latitudeDelta : 0.014;
  // Preserve the existing close-view above-sheet offset, but rotate that offset
  // WITH the camera. A world-south offset puts the car behind controls on turns.
  const behindLatitude = delta * 0.18;
  const centerLatitude = boundedLatitude(latitude - Math.cos(radians) * behindLatitude);
  const centerLongitude = longitude - Math.sin(radians) * behindLatitude / Math.max(0.05, Math.cos(latitude * Math.PI / 180));
  const camera: RiderHeadingCamera = {
    center: { latitude: centerLatitude, longitude: ((centerLongitude + 540) % 360) - 180 },
    heading,
    pitch: 0,
    zoom: riderRegionCameraZoom(region, viewport),
  };
  if (previous && Math.abs(latitude - previous.point[0]) < 1e-10
    && Math.abs(longitude - previous.point[1]) < 1e-10
    && Math.abs(signedTurn(previous.camera.heading, heading)) < 0.01
    && Math.abs(previous.camera.zoom - camera.zoom) < 0.001
    && Math.abs(previous.camera.center.latitude - camera.center.latitude) < 1e-10
    && Math.abs(previous.camera.center.longitude - camera.center.longitude) < 1e-10) return null;
  return { point: [latitude, longitude], atMs: nowMs, camera };
}
