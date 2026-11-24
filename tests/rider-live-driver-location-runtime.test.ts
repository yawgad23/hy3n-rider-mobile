import React from 'react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { recoverActiveRide } from '../lib/rider-active-ride-recovery';
import { nextRiderDriverLocation, riderDriverLocationFromRide } from '../lib/rider-driver-location';

vi.mock('react-native', () => ({
  View: 'view', Text: 'text', Image: 'image',
  Platform: { OS: 'android' },
  StyleSheet: { create: (value: any) => value, absoluteFill: {} },
}));
vi.mock('react-native-maps', async () => {
  const R = await import('react');
  class AnimatedRegion {
    value: any;
    constructor(value: any) { this.value = value; }
    setValue(value: any) { this.value = value; }
    stopAnimation(callback: any) { callback(this.value); }
    timing(value: any) { return { start: (callback: any) => { this.value = value; callback({ finished: true }); } }; }
  }
  const MapView = R.forwardRef((props: any, ref) => {
    R.useImperativeHandle(ref, () => ({ animateToRegion: () => {}, fitToCoordinates: () => {} }));
    return R.createElement('map', null, props.children);
  });
  const Marker: any = (props: any) => R.createElement('marker', props, props.children);
  Marker.Animated = (props: any) => R.createElement('animated-marker', props, props.children);
  return { default: MapView, AnimatedRegion, Marker, Polyline: 'polyline', PROVIDER_GOOGLE: 'google' };
});

const renderer = createRequire(import.meta.url)('react-test-renderer');
const A = { lat: 5.6037, lng: -0.187 };
const B = { lat: 5.612, lng: -0.182 };
const C = { lat: 5.615, lng: -0.179 };
const B_TIME = '2026-11-24T12:00:05.000Z';
const C_TIME = '2026-11-24T12:00:10.000Z';
const OLD_TIME = '2026-11-24T11:59:59.000Z';

const baseRide = {
  id: 'ride-live-location', rider_id: 'rider-1', status: 'in_progress', category: 'standard',
  pickup: { name: 'Pickup', address: 'Pickup', lat: 5.6, lng: -0.19 },
  destination: { name: 'Airport', address: 'Airport', lat: 5.62, lng: -0.17 },
  distance_km: 8, duration_minutes: 20, quoted_fare: 30, payment_method: 'cash',
  driver_id: 'driver-1',
  driver: {
    id: 'driver-1', name: 'Kofi', vehicle_make: 'Toyota', vehicle_model: 'Vitz',
    location: { ...A, recorded_at: '2026-11-24T11:00:00Z' },
  },
  driver_location: { latitude: B.lat, longitude: B.lng, heading: 90, recorded_at: B_TIME },
  driver_location_updated_at: B_TIME,
  live_route_metrics: {
    phase: 'destination', calculated_at: B_TIME, distance_km: 2.2, duration_minutes: 8,
    points: [[B.lat, B.lng], [5.62, -0.17]],
  },
};

type Ride = Record<string, any>;

function extractHomeRideListener() {
  const source = ts.createSourceFile(
    'index.tsx', readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  let listener: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (listener) return;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'listenToRide' && node.arguments.length === 2
      && ts.isArrowFunction(node.arguments[1])) listener = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!listener) throw new Error('Home ride listener disappeared or is no longer an inline callback');
  return ts.transpileModule(`const listener = ${listener.getText(source)}; listener`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

const compiledListener = extractHomeRideListener();

function makeListenerHarness(initial: Ride) {
  let current = initial;
  let driverLocation: any = current.driverLocation;
  const env: Record<string, any> = {
    cancelled: false,
    user: { uid: 'rider-1' },
    riderDriverLocationFromRide,
    nextRiderDriverLocation,
    riderTerminalStatus: (status: string) => status,
    isAssignmentReleaseRedispatch: () => false,
    driverRedispatchCount: () => 0,
    assignmentReleaseActor: () => undefined,
    nonRegressiveRideStatus: (_previous: string, next: string) => next,
    calculateDistance: () => 1,
    calculateBearing: () => 90,
    calculateETA: () => 8,
    toFiniteNumber: (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null,
    riderLiveRouteIsCurrent: () => true,
    getSafetySignal: () => undefined,
    getQuotedRideFare: () => 30,
    driverPhotoUri: () => undefined,
    setDriverLocation: (value: any) => { driverLocation = value; },
    setDistanceToPickup: vi.fn(), setDistanceToDestination: vi.fn(), setEtaMinutes: vi.fn(),
    presentCompletedRide: vi.fn(), offerFindAnotherRide: vi.fn(), removeActiveRide: vi.fn(),
    selectedRideId: initial.id,
    trackedRide: initial,
    updateActiveRide: (updater: (ride: Ride) => Ride) => { current = updater(current); },
  };
  const listener = new Function('env', `with (env) { return ${compiledListener.replace(/^const listener = /, '').replace(/;\s*listener;?\s*$/, '')}; }`)(env) as (ride: Ride) => void;
  return { emit: (ride: Ride) => listener(ride), retire: () => { env.cancelled = true; }, get current() { return current; }, get driverLocation() { return driverLocation; } };
}

let previousPngExtension: any;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  previousPngExtension = require.extensions['.png'];
  require.extensions['.png'] = (module: any, filename: string) => { module.exports = filename; };
});
afterAll(() => {
  if (previousPngExtension) require.extensions['.png'] = previousPngExtension;
  else delete require.extensions['.png'];
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe('Rider live Driver location recovery/runtime', () => {
  it('recovers the live ride-scoped coordinate as one coherent pose when nested acceptance data is stale', () => {
    const pose = riderDriverLocationFromRide(baseRide);
    expect(pose).toMatchObject({ lat: B.lat, lng: B.lng, heading: 90, updatedAt: B_TIME });
    expect(recoverActiveRide(baseRide)).toMatchObject({
      driverLocation: { lat: B.lat, lng: B.lng }, driverBearing: 90, driverLocationUpdatedAt: B_TIME,
    });
  });

  it('ignores a late GPS callback after the native subscription was retired', () => {
    const initial = recoverActiveRide({ ...baseRide, driver_location: undefined, driver_location_updated_at: undefined })!;
    const h = makeListenerHarness(initial);
    h.retire();
    h.emit(baseRide);
    expect(h.current).toBe(initial);
    expect(h.driverLocation).toEqual(A);
  });

  it('does not accept a ride snapshot belonging to a different Rider account', () => {
    const initial = recoverActiveRide({ ...baseRide, driver_location: undefined, driver_location_updated_at: undefined })!;
    const h = makeListenerHarness(initial);
    h.emit({ ...baseRide, rider_id: 'rider-2' });
    expect(h.current).toBe(initial);
    expect(h.driverLocation).toEqual(A);
  });

  it('runs the production Home ride listener through B then C and rejects an older projection', () => {
    // No private presence feed is supplied. The assigned ride alone must move
    // the car away from its acceptance-time location.
    const h = makeListenerHarness(recoverActiveRide({
      ...baseRide, driver_location: undefined, driver_location_updated_at: undefined,
    })!);
    expect(h.current.driverLocation).toEqual(A);
    h.emit(baseRide);
    expect(h.current.driverLocation).toEqual(B);
    expect(h.current.driverLocationUpdatedAt).toBe(B_TIME);
    expect(h.current.driverBearing).toBe(90);

    const rideC = { ...baseRide, driver_location: { latitude: C.lat, longitude: C.lng, heading: 105, recorded_at: C_TIME }, driver_location_updated_at: C_TIME };
    h.emit(rideC);
    expect(h.current.driverLocation).toEqual(C);
    expect(h.current.driverLocationUpdatedAt).toBe(C_TIME);
    expect(h.current.driverBearing).toBe(105);

    const oldProjection = { ...baseRide, driver_location: { latitude: A.lat, longitude: A.lng, heading: 12, recorded_at: OLD_TIME }, driver_location_updated_at: OLD_TIME };
    h.emit(oldProjection);
    expect(h.current.driverLocation).toEqual(C);
    expect(h.current.driverLocationUpdatedAt).toBe(C_TIME);
    expect(h.current.driverBearing).toBe(105);
  });

  it('advances the actual NativeGoogleMap marker pose for recovered B then C, not merely its route line', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    const route: [number, number][] = [[B.lat, B.lng], [5.62, -0.17]];
    const props = { driverTracking: true, tripStatus: 'in_progress', driverLocation: [B.lat, B.lng] as [number, number], driverLocationUpdatedAt: B_TIME, driverBearing: 90, driverRouteUpdatedAt: B_TIME, driverRoutePoints: route };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      const firstMarker = tree.root.findAllByType('animated-marker')[0];
      expect(firstMarker.props.coordinate.value).toEqual(expect.objectContaining({ latitude: B.lat, longitude: B.lng }));
      const nextProps = { ...props, driverLocation: [C.lat, C.lng] as [number, number], driverLocationUpdatedAt: C_TIME, driverBearing: 105 };
      await renderer.act(async () => { tree.update(React.createElement(Component, nextProps)); });
      const marker = tree.root.findAllByType('animated-marker')[0];
      expect(marker.props.coordinate.value).toEqual(expect.objectContaining({ latitude: C.lat, longitude: C.lng }));
      expect(marker.props.coordinate.value.latitude).not.toBe(B.lat);
      expect(marker.props.coordinate.value.longitude).not.toBe(B.lng);
    } finally {
      if (tree) await renderer.act(async () => { tree.unmount(); });
    }
  });
});
