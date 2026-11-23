import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enabled: true,
  nextId: 0,
  record: vi.fn(),
  camera: vi.fn(),
  clipboard: vi.fn(),
  native: vi.fn(),
  events: vi.fn(),
}));
vi.mock('react-native', () => ({
  Clipboard: { setString: state.clipboard }, ScrollView: 'scroll', Text: 'text', TouchableOpacity: 'button', View: 'view',
  StyleSheet: { create: (v: any) => v, absoluteFill: {} },
}));
vi.mock('expo-router', async () => {
  const R = await import('react');
  return { useRouter: () => ({ back: vi.fn() }), useFocusEffect: (effect: any) => R.useEffect(effect, [effect]) };
});
vi.mock('@/components/screen-container', () => ({ ScreenContainer: 'screen' }));
vi.mock('@/lib/ios-maps-diagnostics', () => ({
  isIOSMapsDiagnosticsEnabled: () => state.enabled,
  newMapDiagnosticInstance: () => ++state.nextId,
  recordMapDiagnostic: state.record,
  getMapDiagnosticEvents: state.events,
  getNativeMapDiagnostics: state.native,
  validDiagnosticRegion: () => true,
}));
vi.mock('react-native-maps', async () => {
  const R = await import('react');
  return {
    PROVIDER_GOOGLE: 'google',
    default: R.forwardRef((props: any, ref) => {
      R.useImperativeHandle(ref, () => ({ getCamera: state.camera }));
      return R.createElement('google-map', props);
    }),
  };
});

const renderer = require('react-test-renderer');
let tree: any;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); state.enabled = true; state.nextId = 0;
  state.native.mockResolvedValue({ schemaVersion: 1, sessionId: 'test', bundleIdentifier: 'com.hy3n.rider', appVersion: '1.0.5', buildNumber: '136', events: [] });
  state.events.mockReturnValue([]);
  state.camera.mockResolvedValue({ center: { latitude: 5.6037, longitude: -0.187 }, zoom: 14 });
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (tree) await renderer.act(async () => { tree.unmount(); });
  tree = null; vi.restoreAllMocks(); vi.useRealTimers();
});
async function mount() {
  const Screen = (await import('../app/maps-diagnostics')).default;
  await renderer.act(async () => { tree = renderer.create(React.createElement(Screen)); });
}
async function press(label: string) {
  const button = tree.root.findAllByType('button').find((item: any) => item.props.accessibilityLabel === label);
  expect(button).toBeTruthy();
  await renderer.act(async () => { button.props.onPress(); });
}

describe('iPhone-readable Maps diagnostic screen', () => {
  it('does not instantiate any Google map or read snapshots when disabled', async () => {
    state.enabled = false;
    await mount();
    expect(tree.root.findAllByType('google-map')).toHaveLength(0);
    expect(state.native).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('diagnostics unavailable');
  });
  it('ignores an already queued polling callback after screen cleanup', async () => {
    const timer = vi.spyOn(globalThis, 'setInterval');
    await mount();
    const queuedRefresh = timer.mock.calls[0][0] as () => void;
    const eventReads = state.events.mock.calls.length;
    const nativeReads = state.native.mock.calls.length;
    await renderer.act(async () => { tree.unmount(); });
    tree = null;
    await renderer.act(async () => { queuedRefresh(); });
    expect(state.events).toHaveBeenCalledTimes(eventReads);
    expect(state.native).toHaveBeenCalledTimes(nativeReads);
  });
  it('waits for explicit user action before creating the minimal map and removes it on stop', async () => {
    await mount();
    expect(tree.root.findAllByType('google-map')).toHaveLength(0);
    await press('Start minimal map');
    expect(tree.root.findAllByType('google-map')).toHaveLength(1);
    await press('Stop minimal map');
    expect(tree.root.findAllByType('google-map')).toHaveLength(0);
  });
  it('creates a fixed public-camera map without Home styling, markers, routes or tracking inputs', async () => {
    await mount(); await press('Start minimal map');
    const props = tree.root.findByType('google-map').props;
    expect(props.provider).toBe('google');
    expect(props.initialRegion).toEqual({ latitude: 5.6037, longitude: -0.187, latitudeDelta: 0.018, longitudeDelta: 0.018 });
    for (const key of ['children', 'customMapStyle', 'googleRenderer', 'showsUserLocation', 'driverTracking', 'driverRoutePoints']) expect(props[key]).toBeUndefined();
  });
  it('records callbacks and camera validity without recording coordinates or claiming authorization', async () => {
    await mount(); await press('Start minimal map');
    const props = tree.root.findByType('google-map').props;
    await renderer.act(async () => { props.onMapReady(); props.onMapLoaded(); });
    expect(state.record).toHaveBeenCalledWith('minimal', 1, 'ready-callback');
    expect(state.record).toHaveBeenCalledWith('minimal', 1, 'loaded-callback');
    expect(state.record).toHaveBeenCalledWith('minimal', 1, 'camera-read', { validCamera: true, zoom: 14 });
    expect(JSON.stringify(state.record.mock.calls)).not.toContain('5.6037');
    await press('Copy redacted diagnostic report');
    const report = JSON.parse(state.clipboard.mock.calls[0][0]);
    expect(report.limitation).toContain('do not prove server authorization');
    expect(report.limitation).toContain('No native SDK authorization-log capture');
    expect(report.native.bundleIdentifier).toBe('com.hy3n.rider');
  });
});
