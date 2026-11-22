import React from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const camera = vi.hoisted(() => ({ animateToRegion: vi.fn(), fitToCoordinates: vi.fn() }));

vi.mock('react-native', () => ({
  View: 'view', Text: 'text', Image: 'image', Easing: { linear: (value: number) => value },
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
}));
vi.mock('react-native-maps', async () => {
  const R = await import('react');
  class AnimatedRegion {
    value: any;
    events: string[] = [];
    pending: ((result: { finished: boolean }) => void)[] = [];
    constructor(value: any) { this.value = value; }
    setValue(value: any) { this.events.push('set'); this.value = value; }
    stopAnimation(callback: (value: any) => void) {
      this.events.push('stop');
      // Deliberately retain callbacks: a late completion must be generation-guarded.
      callback(this.value);
    }
    timing(value: any) {
      this.events.push('timing');
      return { start: (callback?: (result: { finished: boolean }) => void) => {
        this.value = value;
        if (callback) this.pending.push(callback);
      } };
    }
    completeNext() { this.pending.shift()?.({ finished: true }); }
  }
  const MapView = R.forwardRef((props: any, ref) => {
    R.useImperativeHandle(ref, () => camera);
    return R.createElement('map', props, props.children);
  });
  const Marker: any = (props: any) => R.createElement('marker', props, props.children);
  Marker.Animated = (props: any) => R.createElement('animated-marker', props, props.children);
  return { default: MapView, AnimatedRegion, Marker, Polyline: 'polyline', PROVIDER_GOOGLE: 'google' };
});

const renderer = require('react-test-renderer');
let previousPngExtension: any;
let previousReact: any;
let previousActEnvironment: any;
beforeAll(() => {
  previousReact = (globalThis as any).React;
  previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  previousPngExtension = require.extensions['.png'];
  require.extensions['.png'] = (module: any, filename: string) => { module.exports = filename; };
});
afterAll(() => {
  (globalThis as any).React = previousReact;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  if (previousPngExtension) require.extensions['.png'] = previousPngExtension;
  else delete require.extensions['.png'];
});
beforeEach(() => { vi.clearAllMocks(); });

const asCoordinates = (points: [number, number][]) => points.map(([latitude, longitude]) => ({ latitude, longitude }));

// These are JS source regressions with a mocked native boundary, not device verification.
describe('native map source safety', () => {
  it('frames every server road bend and refits changed geometry with unchanged endpoints', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    let props = {
      userLocation: [5.6, -0.2] as [number, number],
      destination: [5.61, -0.19] as [number, number],
      driverRoutePoints: [[5.6, -0.2], [5.63, -0.23], [5.61, -0.19]] as [number, number][],
    };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      expect(camera.fitToCoordinates).not.toHaveBeenCalled();
      await renderer.act(async () => { tree.root.findByType('map').props.onMapReady(); });
      expect(camera.fitToCoordinates).toHaveBeenCalledWith(
        asCoordinates([props.userLocation, ...props.driverRoutePoints, props.destination]),
        { edgePadding: { top: 132, right: 36, bottom: 460, left: 36 }, animated: true },
      );
      expect(camera.fitToCoordinates.mock.calls[0][0]).toContainEqual({ latitude: 5.63, longitude: -0.23 });
      expect(tree.root.findByType('polyline').props.coordinates).toEqual(asCoordinates(props.driverRoutePoints));
      await renderer.act(async () => { tree.update(React.createElement(Component, { ...props, nearbyDrivers: [{ id: 'nearby', lat: 5.603, lng: -0.201 }] })); });
      expect(camera.fitToCoordinates).toHaveBeenCalledTimes(1);
      props = { ...props, driverRoutePoints: [props.driverRoutePoints[0], [5.64, -0.24], props.driverRoutePoints[2]] };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(camera.fitToCoordinates).toHaveBeenCalledTimes(2);
      expect(camera.fitToCoordinates.mock.calls[1][0]).toEqual(asCoordinates([props.userLocation, ...props.driverRoutePoints, props.destination]));
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('ignores public commands before ready without suppressing the initial automatic camera', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    const ref = React.createRef<any>();
    let tree: any;
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, { ref, center: [5.6, -0.2] })); });
      ref.current.panTo(5.61, -0.19);
      ref.current.fitBounds([[5.6, -0.2], [5.61, -0.19]]);
      expect(camera.animateToRegion).not.toHaveBeenCalled();
      expect(camera.fitToCoordinates).not.toHaveBeenCalled();
      await renderer.act(async () => { tree.root.findByType('map').props.onMapReady(); });
      expect(camera.animateToRegion).toHaveBeenCalledTimes(1);
      expect(camera.animateToRegion.mock.calls[0][0]).toMatchObject({ latitude: 5.6, longitude: -0.2 });
      camera.animateToRegion.mockClear();
      ref.current.panTo(5.62, -0.18);
      expect(camera.animateToRegion).toHaveBeenCalledWith({ latitude: 5.62, longitude: -0.18, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 350);
      ref.current.fitBounds([[5.6, -0.2], [5.61, -0.19]]);
      expect(camera.fitToCoordinates).toHaveBeenCalledTimes(1);
      await renderer.act(async () => { tree.update(React.createElement(Component, { ref, center: [5.7, -0.1] })); });
      expect(camera.animateToRegion).toHaveBeenCalledTimes(1);
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('uses the sole validated fitBounds point and rejects malformed public coordinates', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    const ref = React.createRef<any>();
    let tree: any;
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, { ref })); });
      await renderer.act(async () => { tree.root.findByType('map').props.onMapReady(); });
      vi.clearAllMocks();
      const invalid = [['5.6', '-0.2'], [null, null], ['', false], [91, 0], [NaN, Infinity]];
      ref.current.fitBounds([...invalid, [5.61, -0.19]]);
      expect(camera.animateToRegion).toHaveBeenCalledWith({ latitude: 5.61, longitude: -0.19, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 350);
      expect(camera.fitToCoordinates).not.toHaveBeenCalled();
      camera.animateToRegion.mockClear();
      ref.current.fitBounds(invalid);
      for (const point of invalid) ref.current.panTo(...point);
      expect(camera.animateToRegion).not.toHaveBeenCalled();
      expect(camera.fitToCoordinates).not.toHaveBeenCalled();
      ref.current.fitBounds([...invalid, [5.6, -0.2], [5.61, -0.19]]);
      expect(camera.fitToCoordinates.mock.calls[0][0]).toEqual(asCoordinates([[5.6, -0.2], [5.61, -0.19]]));
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('filters malformed route and nearby tuples before rendering or fitting native coordinates', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    const validRoute: [number, number][] = [[5.6, -0.2], [5.61, -0.19]];
    const props: any = {
      userLocation: validRoute[0], destination: validRoute[1],
      driverRoutePoints: [validRoute[0], ['5.603', '-0.198'], [null, null], ['', false], validRoute[1]],
      nearbyDrivers: [{ id: 'valid', lat: 5.603, lng: -0.201 }, { id: 'string', lat: '5.603', lng: '-0.201' }, { id: 'null', lat: null, lng: null }],
    };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      expect(tree.root.findByType('polyline').props.coordinates).toEqual(asCoordinates(validRoute));
      expect(tree.root.findAllByType('animated-marker')).toHaveLength(1);
      await renderer.act(async () => { tree.root.findByType('map').props.onMapReady(); });
      expect(camera.fitToCoordinates.mock.calls[0][0]).toEqual(asCoordinates([validRoute[0], ...validRoute, validRoute[1]]));
      const mapProps = tree.root.findByType('map').props;
      expect(mapProps).not.toHaveProperty('showsPointsOfInterest');
      expect(mapProps.googleRenderer).toBe('LEGACY');
      await renderer.act(async () => { tree.update(React.createElement(Component, { ...props, colorScheme: 'dark' })); });
      expect(tree.root.findByType('map').props.customMapStyle).toContainEqual({ featureType: 'poi', stylers: [{ visibility: 'off' }] });
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('rejects malformed driver locations even when route matching would otherwise coerce them', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    try {
      for (const driverLocation of [['5.6', '-0.2'], [null, null], ['', false]]) {
        const props: any = { driverTracking: true, tripStatus: 'in_progress', driverLocation, driverRoutePoints: [[5.6, -0.2], [5.61, -0.19]] };
        await renderer.act(async () => {
          if (tree) tree.update(React.createElement(Component, props));
          else tree = renderer.create(React.createElement(Component, props));
        });
        expect(tree.root.findAllByType('animated-marker')).toHaveLength(0);
        expect(tree.root.findByType('polyline').props.coordinates).toHaveLength(2);
      }
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('invalidates active-driver segment callbacks before stopping on unmount without heading-only cancellation', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    const now = Date.now();
    let props = {
      driverTracking: true, tripStatus: 'in_progress', driverBearing: 90,
      driverLocation: [5.6, -0.1998] as [number, number],
      driverLocationUpdatedAt: new Date(now).toISOString(),
      driverRouteUpdatedAt: new Date(now).toISOString(),
      driverRoutePoints: [[5.6, -0.2], [5.6, -0.199], [5.601, -0.199]] as [number, number][],
    };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      const region = tree.root.findAllByType('animated-marker')[0].props.coordinate;
      props = { ...props, driverLocation: [5.6008, -0.199], driverLocationUpdatedAt: new Date(now + 3_000).toISOString() };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events.slice(-2)).toEqual(['stop', 'timing']);
      expect(region.pending).toHaveLength(1);
      const activeEvents = [...region.events];
      props = { ...props, driverBearing: 120 };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events).toEqual(activeEvents);
      // Simulate a completion arriving synchronously during disposal. The
      // generation must already be invalidated so it cannot enqueue step two.
      const originalStop = region.stopAnimation.bind(region);
      region.stopAnimation = (callback: any) => { region.completeNext(); originalStop(callback); };
      await renderer.act(async () => { tree.unmount(); });
      tree = null;
      expect(region.events).toEqual([...activeEvents, 'stop']);
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });

  it('stops nearby motion before replacements, teleports and unmount, but not heading-only updates', async () => {
    const Component = (await import('../components/AnimatedNearbyMarker')).default;
    let tree: any;
    let props = { latitude: 5.6, longitude: -0.2, heading: 90, children: React.createElement('artwork') };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      const region = tree.root.findByType('animated-marker').props.coordinate;
      props = { ...props, latitude: 5.601 };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events).toEqual(['stop', 'timing']);
      expect(region.value.useNativeDriver).toBe(false);
      props = { ...props, heading: 120 };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events).toEqual(['stop', 'timing']);
      props = { ...props, latitude: 5.602 };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events).toEqual(['stop', 'timing', 'stop', 'timing']);
      props = { ...props, latitude: 5.7 };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(region.events.slice(-2)).toEqual(['stop', 'set']);
      expect(tree.root.findByType('animated-marker').props.anchor).toEqual({ x: 0.5, y: 0.5 });
      await renderer.act(async () => { tree.unmount(); });
      tree = null;
      expect(region.events.at(-1)).toBe('stop');
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });
});
