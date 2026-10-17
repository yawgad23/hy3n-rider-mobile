import React from 'react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'view', Text: 'text', Image: 'image',
  StyleSheet: { create: (v: any) => v, absoluteFill: {} },
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

const renderer = require('react-test-renderer');
const route: [number, number][] = [[5.7, -0.1], [5.704, -0.1], [5.704, -0.096]];
let previousPngExtension: any;
beforeAll(() => {
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  previousPngExtension = require.extensions['.png'];
  require.extensions['.png'] = (module: any, filename: string) => { module.exports = filename; };
});
afterAll(() => {
  if (previousPngExtension) require.extensions['.png'] = previousPngExtension;
  else delete require.extensions['.png'];
});

describe('real Rider map route rendering', () => {
  it('removes travelled road as GPS advances and displays replacement server geometry', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    let props: any = { driverTracking: true, tripStatus: 'in_progress', driverLocation: [5.7, -0.1],
      driverLocationUpdatedAt: new Date().toISOString(), driverRouteUpdatedAt: new Date().toISOString(), driverRoutePoints: route };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      props = { ...props, driverLocation: [5.702, -0.1], driverLocationUpdatedAt: new Date(Date.now() + 1).toISOString() };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(tree.root.findByType('polyline').props.coordinates).toEqual([
        { latitude: 5.702, longitude: -0.1 }, { latitude: 5.704, longitude: -0.1 }, { latitude: 5.704, longitude: -0.096 },
      ]);
      props = { ...props, driverLocation: [5.702, -0.103], driverLocationUpdatedAt: new Date(Date.now() + 2).toISOString() };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(tree.root.findAllByType('polyline')).toHaveLength(0);
      props = { ...props, driverRoutePoints: [[5.702, -0.103], [5.704, -0.103], route[2]], driverRouteUpdatedAt: new Date(Date.now() + 3).toISOString() };
      await renderer.act(async () => { tree.update(React.createElement(Component, props)); });
      expect(tree.root.findByType('polyline').props.coordinates[0]).toEqual({ latitude: 5.702, longitude: -0.103 });
      expect(tree.root.findByType('polyline').props.coordinates.at(-1)).toEqual({ latitude: 5.704, longitude: -0.096 });
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });
  it('keeps the full road only for booking previews or an explicit route overview', async () => {
    const Component = (await import('../components/NativeGoogleMap')).default;
    let tree: any;
    const props = { driverTracking: true, tripStatus: 'in_progress', driverLocation: [5.702, -0.1] as [number, number],
      driverRouteUpdatedAt: new Date().toISOString(), driverRoutePoints: route, routeOverview: true };
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
      expect(tree.root.findByType('polyline').props.coordinates[0]).toEqual({ latitude: 5.7, longitude: -0.1 });
      await renderer.act(async () => { tree.update(React.createElement(Component, { ...props, driverTracking: false, routeOverview: false })); });
      expect(tree.root.findByType('polyline').props.coordinates).toHaveLength(3);
    } finally { if (tree) await renderer.act(async () => { tree.unmount(); }); }
  });
});
