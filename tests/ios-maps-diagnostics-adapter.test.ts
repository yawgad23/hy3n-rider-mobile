import { beforeEach, describe, expect, it, vi } from 'vitest';

async function adapter(os: string, native: Record<string, unknown> = {}) {
  vi.doMock('react-native', () => ({ Platform: { OS: os }, NativeModules: { HY3NMapsDiagnostics: native } }));
  return import('../lib/ios-maps-diagnostics');
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

describe('iOS-only Maps diagnostic adapter', () => {
  it.each(['android', 'web'])('cannot enable diagnostics or read the native bridge on %s', async (os) => {
    const getSnapshot = vi.fn();
    const d = await adapter(os, { enabled: true, getSnapshot });
    expect(d.isIOSMapsDiagnosticsEnabled()).toBe(false);
    expect(d.newMapDiagnosticInstance()).toBe(0);
    d.recordMapDiagnostic('home', 1, 'mounted');
    expect(d.getMapDiagnosticEvents()).toEqual([]);
    expect(await d.getNativeMapDiagnostics()).toBeNull();
    expect(getSnapshot).not.toHaveBeenCalled();
  });
  it('stays disabled in an ordinary iOS release without the native diagnostic module', async () => {
    const d = await adapter('ios');
    expect(d.isIOSMapsDiagnosticsEnabled()).toBe(false);
    expect(await d.getNativeMapDiagnostics()).toBeNull();
  });
  it('requires the explicit native enabled constant and a snapshot method', async () => {
    const d = await adapter('ios', { enabled: false, getSnapshot: vi.fn() });
    expect(d.isIOSMapsDiagnosticsEnabled()).toBe(false);
  });
  it('observes an enabled iOS instance without persisting location details', async () => {
    const getSnapshot = vi.fn().mockResolvedValue({ schemaVersion: 1, sessionId: 'test', events: [] });
    const d = await adapter('ios', { enabled: true, getSnapshot });
    expect(d.isIOSMapsDiagnosticsEnabled()).toBe(true);
    const id = d.newMapDiagnosticInstance();
    d.recordMapDiagnostic('home', id, 'layout', { width: 390, latitude: 5.6, message: 'secret' });
    expect(d.getMapDiagnosticEvents()[0].details).toEqual({ width: 390 });
    expect((await d.getNativeMapDiagnostics())?.schemaVersion).toBe(1);
  });
  it('fails safely on a rejected native snapshot read without retaining its payload', async () => {
    const d = await adapter('ios', { enabled: true, getSnapshot: vi.fn().mockRejectedValue(new Error('private native message')) });
    expect(await d.getNativeMapDiagnostics()).toBeNull();
    expect(d.getMapDiagnosticEvents()).toEqual([]);
  });
  it('validates camera-region inputs without recording coordinates', async () => {
    const d = await adapter('ios');
    expect(d.validDiagnosticRegion({ latitude: 5.6, longitude: -0.1, latitudeDelta: 0.018, longitudeDelta: 0.018 })).toBe(true);
    expect(d.validDiagnosticRegion({ latitude: 100, longitude: 0, latitudeDelta: 0.018, longitudeDelta: 0.018 })).toBe(false);
    expect(d.validDiagnosticRegion({ latitude: 0, longitude: 0, latitudeDelta: 0, longitudeDelta: 0 })).toBe(false);
  });
});
