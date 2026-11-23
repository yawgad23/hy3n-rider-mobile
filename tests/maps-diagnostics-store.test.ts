import { describe, expect, it } from 'vitest';
import { createMapDiagnosticsStore, nativeInitializationObservation, safeDiagnosticDetails, sanitizeNativeSnapshot } from '../lib/maps-diagnostics-store';

const base = { schemaVersion: 1, sessionId: 'test-session', bundleIdentifier: 'com.hy3n.rider', appVersion: '1.0.5', buildNumber: '136' };
const event = (name: string, elapsedMs: number, details = {}) => ({ name, elapsedMs, details });

describe('Privacy-safe Maps diagnostics', () => {
  it('stores only finite approved geometry-validation fields, never locations or error payloads', () => {
    expect(safeDiagnosticDetails({ width: 390, height: 0, validCenter: true, zoom: 14, latitude: 5.6, longitude: -0.1, driverId: 'private-driver', message: 'private error', key: 'secret', latitudeDelta: Infinity, longitudeDelta: NaN })).toEqual({ width: 390, height: 0, validCenter: true, zoom: 14 });
  });
  it('uses stable instance IDs and a bounded event buffer', () => {
    let now = 100;
    const store = createMapDiagnosticsStore(() => now, 2);
    const home = store.newInstance();
    const minimal = store.newInstance();
    expect([home, minimal]).toEqual([1, 2]);
    store.record('home', home, 'mounted');
    now = 110; store.record('home', home, 'layout', { width: 390 });
    now = 120; store.record('minimal', minimal, 'mounted');
    expect(store.snapshot()).toEqual([
      { surface: 'home', instanceId: 1, name: 'layout', elapsedMs: 10, details: { width: 390 } },
      { surface: 'minimal', instanceId: 2, name: 'mounted', elapsedMs: 20, details: {} },
    ]);
  });
  it('does not expose mutable internal state and clamps backward JS wall-clock jumps', () => {
    let now = 100;
    const store = createMapDiagnosticsStore(() => now);
    now = 50; store.record('home', 1, 'layout', { width: 390 });
    const copy = store.snapshot(); copy[0].details.width = 99; copy.length = 0;
    expect(store.snapshot()[0].elapsedMs).toBe(0);
    expect(store.snapshot()[0].details.width).toBe(390);
  });
  it('rejects unsupported native response schemas', () => {
    expect(sanitizeNativeSnapshot(null)).toBeNull();
    expect(sanitizeNativeSnapshot({ schemaVersion: 2, events: [] })).toBeNull();
    expect(sanitizeNativeSnapshot({ schemaVersion: 1, events: 'invalid' })).toBeNull();
  });
  it('filters unknown native events, unsafe details and raw-key-shaped metadata', () => {
    const result = sanitizeNativeSnapshot({ ...base, appVersion: 'AIza_NOT_A_REAL_KEY', events: [
      event('maps.key.end', 10, { accepted: true, onMainThread: true, API_KEY: 'private', message: 'private', instanceId: 'safe-id' }),
      event('private.raw-error', 11), event('maps.view.create.begin', NaN),
      event('maps.view.create.end', -1),
    ] });
    expect(result?.appVersion).toBe('unavailable');
    expect(result?.events).toEqual([event('maps.key.end', 10, { accepted: true, onMainThread: true, instanceId: 'safe-id' })]);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('accepts zero-timestamp native events and never compares them to the JS clock', () => {
    const result = sanitizeNativeSnapshot({ ...base, events: [event('launch.started', 0)] });
    expect(result?.events[0].elapsedMs).toBe(0);
    expect(nativeInitializationObservation(result)).toContain('No native Google map creation');
  });
  it('reports key-before-map as observation, never server authorization', () => {
    const result = sanitizeNativeSnapshot({ ...base, events: [event('maps.key.begin', 5), event('maps.key.end', 6, { accepted: true }), event('maps.view.create.begin', 8)] });
    expect(nativeInitializationObservation(result)).toContain('completed before');
    expect(nativeInitializationObservation(result)).toContain('does not prove server authorization');
  });
  it('reports map-before-key without claiming a confirmed cause', () => {
    const result = sanitizeNativeSnapshot({ ...base, events: [event('maps.view.create.begin', 5), event('maps.key.begin', 6), event('maps.key.end', 7)] });
    expect(nativeInitializationObservation(result)).toContain('before the key call began');
    expect(nativeInitializationObservation(result)).toContain('not a confirmed cause');
  });
  it('reports overlapping map creation and key call as ordering evidence only', () => {
    const result = sanitizeNativeSnapshot({ ...base, events: [event('maps.key.begin', 5), event('maps.view.create.begin', 6), event('maps.key.end', 7)] });
    expect(nativeInitializationObservation(result)).toContain('not yet completed');
    expect(nativeInitializationObservation(result)).toContain('not a confirmed cause');
  });
  it('leaves missing initialization evidence unknown', () => {
    expect(nativeInitializationObservation(null)).toContain('unknown');
    const result = sanitizeNativeSnapshot({ ...base, events: [event('maps.view.create.begin', 5)] });
    expect(nativeInitializationObservation(result)).toContain('could not be established');
  });
});
