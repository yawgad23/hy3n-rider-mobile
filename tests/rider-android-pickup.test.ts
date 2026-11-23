import type * as ExpoLocation from 'expo-location';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireAndroidPickup, isFreshAndroidPickup, ANDROID_PICKUP_MAX_AGE_MS } from '@/lib/rider-android-pickup';
import { riderPickupIsReadyForBooking, shouldRefreshRiderPickupOnForeground, type RiderPickupSelectionSource } from '@/lib/rider-pickup-freshness';

const NOW = 1_795_348_000_000;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function position(latitude = 5.7, longitude = -0.1, age = 0, accuracy = 25): ExpoLocation.LocationObject {
  return {
    timestamp: Date.now() - age,
    coords: { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  };
}
function permission(status: 'granted' | 'denied' = 'granted', accuracy: 'fine' | 'coarse' | 'none' = 'fine') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never', android: { accuracy } } as ExpoLocation.LocationPermissionResponse;
}
function setup() {
  const current = deferred<ExpoLocation.LocationObject>();
  const watchRegistration = deferred<ExpoLocation.LocationSubscription>();
  const geocode = deferred<ExpoLocation.LocationGeocodedAddress[]>();
  const remove = vi.fn();
  let watchCallback: ExpoLocation.LocationCallback | undefined;
  let watchError: ExpoLocation.LocationErrorCallback | undefined;
  const api = {
    Accuracy: { Balanced: 3 } as typeof ExpoLocation.Accuracy,
    requestForegroundPermissionsAsync: vi.fn().mockResolvedValue(permission()),
    getForegroundPermissionsAsync: vi.fn().mockResolvedValue(permission()),
    hasServicesEnabledAsync: vi.fn().mockResolvedValue(true),
    getProviderStatusAsync: vi.fn().mockResolvedValue({ locationServicesEnabled: true, backgroundModeEnabled: false, gpsAvailable: true, networkAvailable: true }),
    enableNetworkProviderAsync: vi.fn().mockResolvedValue(undefined),
    getLastKnownPositionAsync: vi.fn().mockResolvedValue(null),
    getCurrentPositionAsync: vi.fn().mockReturnValue(current.promise),
    watchPositionAsync: vi.fn().mockImplementation((_options, callback, error) => {
      watchCallback = callback; watchError = error;
      return watchRegistration.promise;
    }),
    reverseGeocodeAsync: vi.fn().mockReturnValue(geocode.promise),
  };
  const state = { point: [5.6037, -0.187] as [number, number], label: 'Getting your location...', ready: false };
  let generation = 0;
  let source: RiderPickupSelectionSource = 'device';
  let foreground = true;
  let mounted = true;
  let activeRide = false;
  let task: ReturnType<typeof acquireAndroidPickup> | undefined;
  const onCoordinate = vi.fn((point: [number, number], label: string) => { state.point = point; state.label = label; state.ready = true; });
  const onLabel = vi.fn((label: string) => { state.label = label; });
  const onUnavailable = vi.fn((label: string) => { state.label = label; state.ready = false; });
  const onExpired = vi.fn(() => { state.label = 'Update current location'; state.ready = false; });
  const start = () => {
    task?.cancel();
    const requestGeneration = ++generation;
    source = 'device'; state.ready = false;
    task = acquireAndroidPickup(api, {
      isCurrent: () => mounted && foreground && !activeRide && generation === requestGeneration && source === 'device',
      onCoordinate, onLabel, onUnavailable, onExpired,
    });
    return task;
  };
  const background = () => { foreground = false; generation += 1; task?.cancel(); if (source === 'device') state.ready = false; };
  const manual = () => { generation += 1; task?.cancel(); source = 'rider-selected'; state.point = [6.2, -0.3]; state.label = 'Chosen pickup'; state.ready = true; };
  return {
    api, current, geocode, watchRegistration, remove, state, onCoordinate, onLabel, onUnavailable, onExpired, start, manual, background,
    emit: (fix: ExpoLocation.LocationObject) => watchCallback?.(fix),
    watchError: () => watchError?.('Location permission revoked'),
    register: () => watchRegistration.resolve({ remove }),
    unmount: () => { mounted = false; generation += 1; task?.cancel(); },
    activateRide: () => { activeRide = true; generation += 1; task?.cancel(); },
    resume: () => { foreground = true; return shouldRefreshRiderPickupOnForeground(source) ? start() : undefined; },
    invalidateOnly: () => { generation += 1; },
    cleanup: () => task?.cancel(),
  };
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
const owners: ReturnType<typeof setup>[] = [];
function owner() { const item = setup(); owners.push(item); return item; }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => {
  owners.splice(0).forEach((item) => item.cleanup());
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('strict Android booking-coordinate validation', () => {
  it('accepts real fresh coordinates, including a genuine GPS fix in Accra', () => {
    expect(isFreshAndroidPickup(position())).toBe(true);
    expect(isFreshAndroidPickup(position(5.6037, -0.187))).toBe(true);
  });
  it.each([null, undefined, false, '5.7', NaN, Infinity, 91])('rejects malformed latitude %s without coercion', (latitude) => {
    const fix = position();
    (fix.coords as unknown as Record<string, unknown>).latitude = latitude;
    expect(isFreshAndroidPickup(fix)).toBe(false);
  });
  it.each([null, true, '-0.1', Infinity, 181])('rejects malformed longitude %s', (longitude) => {
    const fix = position();
    (fix.coords as unknown as Record<string, unknown>).longitude = longitude;
    expect(isFreshAndroidPickup(fix)).toBe(false);
  });
  it('rejects missing fixes, zero placeholders, stale/future timestamps and unknown or excessive accuracy', () => {
    expect(isFreshAndroidPickup(null)).toBe(false);
    expect(isFreshAndroidPickup(undefined)).toBe(false);
    expect(isFreshAndroidPickup(position(0, 0))).toBe(false);
    expect(isFreshAndroidPickup(position(5.7, -0.1, ANDROID_PICKUP_MAX_AGE_MS))).toBe(false);
    expect(isFreshAndroidPickup(position(5.7, -0.1, -1))).toBe(false);
    for (const timestamp of [null, '1795348000000', true, NaN, 0]) {
      const fix = { ...position(), timestamp } as unknown as ExpoLocation.LocationObject;
      expect(isFreshAndroidPickup(fix)).toBe(false);
    }
    for (const accuracy of [null, '25', true, NaN, -1, 1_001]) {
      const fix = position();
      (fix.coords as unknown as Record<string, unknown>).accuracy = accuracy;
      expect(isFreshAndroidPickup(fix)).toBe(false);
    }
  });
});

describe('Android automatic pickup acquisition', () => {
  it('cold start with no cache commits live GPS for booking before a pending reverse geocoder', async () => {
    const h = owner(); const task = h.start(); await flush();
    expect(riderPickupIsReadyForBooking(h.state.ready, h.state.point)).toBe(false);
    h.current.resolve(position(6.03, -0.22)); await flush();
    expect(await task.result).toBe(true);
    expect(h.state).toEqual({ point: [6.03, -0.22], label: 'Current location', ready: true });
    expect(riderPickupIsReadyForBooking(h.state.ready, h.state.point)).toBe(true);
    expect(h.api.reverseGeocodeAsync).toHaveBeenCalledWith(expect.objectContaining({ latitude: 6.03, longitude: -0.22 }));
    await vi.advanceTimersByTimeAsync(3_000);
    h.geocode.resolve([{ name: 'Too late' } as ExpoLocation.LocationGeocodedAddress]); await flush();
    expect(h.state.label).toBe('Current location');
    expect(h.api.watchPositionAsync).not.toHaveBeenCalled();
  });
  it.each(['empty', 'reject'])('keeps fresh GPS bookable when reverse geocoding is %s', async (mode) => {
    const h = owner(); const task = h.start(); await flush(); h.current.resolve(position()); await flush();
    if (mode === 'empty') h.geocode.resolve([]); else h.geocode.reject(new Error('Geocoder unavailable'));
    await flush();
    expect(await task.result).toBe(true);
    expect(h.state.label).toBe('Current location');
    expect(h.state.ready).toBe(true);
  });
  it('updates only the address label when a timely geocoder succeeds', async () => {
    const h = owner(); h.start(); await flush(); h.current.resolve(position()); await flush();
    h.geocode.resolve([{ name: 'Adenta', street: 'New Legon Road' } as ExpoLocation.LocationGeocodedAddress]); await flush();
    expect(h.state).toEqual({ point: [5.7, -0.1], label: 'Adenta, New Legon Road', ready: true });
    expect(h.onCoordinate).toHaveBeenCalledTimes(1);
  });
  it('warm start commits only a recent accurate cache, then replaces it with live GPS', async () => {
    const h = owner(); h.api.getLastKnownPositionAsync.mockResolvedValue(position(5.8, -0.2, 30_000, 100));
    const task = h.start(); await flush();
    expect(await task.result).toBe(true);
    expect(h.state).toEqual({ point: [5.8, -0.2], label: 'Recent location', ready: true });
    expect(h.api.getLastKnownPositionAsync).toHaveBeenCalledTimes(1);
    expect(h.api.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 120_000, requiredAccuracy: 1_000 });
    expect(h.api.reverseGeocodeAsync).not.toHaveBeenCalled();
    h.current.resolve(position(6.1, -0.4)); await flush();
    expect(h.state).toEqual({ point: [6.1, -0.4], label: 'Current location', ready: true });
  });
  it('never allows a late cache to replace live GPS', async () => {
    const h = owner(); const cache = deferred<ExpoLocation.LocationObject>(); h.api.getLastKnownPositionAsync.mockReturnValue(cache.promise);
    h.start(); await flush(); h.current.resolve(position(6.1, -0.4)); await flush();
    cache.resolve(position(5.8, -0.2, 30_000)); await flush();
    expect(h.state.point).toEqual([6.1, -0.4]); expect(h.onCoordinate).toHaveBeenCalledTimes(1);
  });
  it.each(['old', 'inaccurate', 'null', 'malformed'])('rejects %s cache without falling back to an unbounded cache or default Accra', async (mode) => {
    const h = owner();
    const fix = mode === 'old' ? position(5.8, -0.2, 900_000) : mode === 'inaccurate' ? position(5.8, -0.2, 0, 5_000)
      : mode === 'malformed' ? { ...position(), coords: { ...position().coords, latitude: null } } : null;
    h.api.getLastKnownPositionAsync.mockResolvedValue(fix);
    const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(16_000);
    expect(await task.result).toBe(false); expect(h.onCoordinate).not.toHaveBeenCalled();
    expect(h.state.ready).toBe(false); expect(h.state.label).toBe('Location unavailable');
    expect(h.api.getLastKnownPositionAsync).toHaveBeenCalledTimes(1);
  });
  it('does not wait for a hung cache before requesting live GPS', async () => {
    const h = owner(); h.api.getLastKnownPositionAsync.mockReturnValue(new Promise(() => {}));
    const task = h.start(); await flush(); expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    h.current.resolve(position()); await flush(); expect(await task.result).toBe(true);
  });
  it('accepts a slow valid one-shot after the former 8-second timeout and removes its fallback watch', async () => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(9_000);
    h.register(); await flush(); h.current.resolve(position()); await flush();
    expect(await task.result).toBe(true); expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.state.ready).toBe(true);
  });
  it('uses a short foreground watch when the native one-shot hangs, then removes it on success', async () => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(4_000);
    expect(h.api.watchPositionAsync).toHaveBeenCalledWith(
      { accuracy: 3, timeInterval: 1_000, distanceInterval: 0, mayShowUserSettingsDialog: false }, expect.any(Function), expect.any(Function),
    );
    h.register(); await flush(); h.emit(position(6.2, -0.3)); await flush();
    expect(await task.result).toBe(true); expect(h.state.point).toEqual([6.2, -0.3]); expect(h.remove).toHaveBeenCalledTimes(1);
    h.current.resolve(position(5.8, -0.2)); h.emit(position(5.9, -0.3)); await flush();
    expect(h.state.point).toEqual([6.2, -0.3]);
  });
  it('starts the fallback immediately when one-shot fails or returns stale GPS, and ignores stale watch updates', async () => {
    const h = owner(); const task = h.start(); await flush(); h.current.resolve(position(5.7, -0.1, 900_000)); await flush();
    expect(h.api.watchPositionAsync).toHaveBeenCalledTimes(1);
    h.register(); await flush(); h.emit(position(5.8, -0.2, 900_000)); expect(h.state.ready).toBe(false);
    h.emit(position(6.1, -0.4)); await flush(); expect(await task.result).toBe(true);
  });
  it('starts the watch after a rejected one-shot and still commits a subsequent valid watch fix', async () => {
    const h = owner(); const task = h.start(); await flush(); h.current.reject(new Error('No current fix')); await flush();
    expect(h.api.watchPositionAsync).toHaveBeenCalledTimes(1);
    h.register(); await flush(); h.emit(position(6.1, -0.4)); await flush();
    expect(await task.result).toBe(true); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it('bounds rejected/erroring watch fallback without making a fabricated location bookable', async () => {
    const h = owner(); h.api.watchPositionAsync.mockRejectedValue(new Error('Provider unavailable'));
    const task = h.start(); await flush(); h.current.reject(new Error('No GPS')); await flush();
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await task.result).toBe(false); expect(h.state.ready).toBe(false); expect(h.onCoordinate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects stale GPS from both native providers and makes results after the deadline inert', async () => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(4_000); h.register(); await flush();
    h.emit(position(5.8, -0.2, 900_000)); await vi.advanceTimersByTimeAsync(12_000);
    expect(await task.result).toBe(false); expect(h.remove).toHaveBeenCalledTimes(1);
    h.current.resolve(position()); h.emit(position()); await flush(); expect(h.onCoordinate).not.toHaveBeenCalled();
  });
  it('bounds even hung watch registration and removes a subscription registered after timeout', async () => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(16_000);
    expect(await task.result).toBe(false); expect(vi.getTimerCount()).toBe(0);
    h.register(); await flush(); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it('expires cached pickup using its original timestamp, rather than extending it from retrieval', async () => {
    const h = owner(); h.api.getLastKnownPositionAsync.mockResolvedValue(position(5.8, -0.2, 110_000));
    const task = h.start(); await flush(); expect(await task.result).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.state.ready).toBe(false); expect(h.onExpired).toHaveBeenCalledTimes(1);
    h.current.resolve(position(6.1, -0.4)); await flush(); expect(h.state.ready).toBe(true);
  });
  it('expires a live automatic point after two minutes even while the app stays foregrounded', async () => {
    const h = owner(); h.start(); await flush(); h.current.resolve(position()); await flush();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(riderPickupIsReadyForBooking(h.state.ready, h.state.point)).toBe(false);
    expect(h.state.label).toBe('Update current location'); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Android permissions and provider settings', () => {
  it('permission denial never reads cache/GPS or asks to enable a provider', async () => {
    const h = owner(); h.api.requestForegroundPermissionsAsync.mockResolvedValue(permission('denied'));
    const task = h.start(); await flush(); expect(await task.result).toBe(false);
    expect(h.state.label).toBe('Location permission needed');
    expect(h.api.hasServicesEnabledAsync).not.toHaveBeenCalled(); expect(h.api.enableNetworkProviderAsync).not.toHaveBeenCalled();
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled(); expect(h.api.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
  it('requests foreground permission before offering a user-approved settings dialog when services start off', async () => {
    const h = owner(); h.api.hasServicesEnabledAsync.mockResolvedValueOnce(false).mockResolvedValue(true);
    h.start(); await flush();
    expect(h.api.requestForegroundPermissionsAsync.mock.invocationCallOrder[0]).toBeLessThan(h.api.hasServicesEnabledAsync.mock.invocationCallOrder[0]);
    expect(h.api.enableNetworkProviderAsync).toHaveBeenCalledTimes(1); expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    h.current.resolve(position()); await flush(); expect(h.state.ready).toBe(true);
  });
  it('declining provider settings with services still off remains unbookable and retry can succeed', async () => {
    const h = owner(); h.api.hasServicesEnabledAsync.mockResolvedValue(false); h.api.enableNetworkProviderAsync.mockRejectedValue(new Error('User declined'));
    const first = h.start(); await flush(); expect(await first.result).toBe(false);
    expect(h.state.label).toBe('Turn on location services'); expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    h.api.hasServicesEnabledAsync.mockResolvedValue(true);
    const retry = h.start(); await flush(); h.current.resolve(position()); await flush();
    expect(await retry.result).toBe(true); expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });
  it('offers provider recovery only when both known foreground providers are unavailable', async () => {
    const h = owner(); h.api.getProviderStatusAsync.mockResolvedValue({ gpsAvailable: false, networkAvailable: false, locationServicesEnabled: true, backgroundModeEnabled: false });
    h.api.enableNetworkProviderAsync.mockRejectedValue(new Error('No Google Play dialog'));
    h.start(); await flush(); expect(h.api.enableNetworkProviderAsync).toHaveBeenCalledTimes(1);
    h.current.resolve(position()); await flush(); expect(h.state.ready).toBe(true);
  });
  it('does not force high-accuracy settings for a usable GPS-only provider', async () => {
    const h = owner(); h.api.getProviderStatusAsync.mockResolvedValue({ gpsAvailable: true, networkAvailable: false, locationServicesEnabled: true, backgroundModeEnabled: false });
    h.start(); await flush(); expect(h.api.enableNetworkProviderAsync).not.toHaveBeenCalled();
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3, mayShowUserSettingsDialog: false });
  });
  it('continues GPS acquisition if provider-status introspection hangs', async () => {
    const h = owner(); h.api.getProviderStatusAsync.mockReturnValue(new Promise(() => {}));
    h.start(); await flush(); await vi.advanceTimersByTimeAsync(2_000);
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1); expect(h.api.enableNetworkProviderAsync).not.toHaveBeenCalled();
  });
  it.each([['fine', 25, true], ['coarse', 800, true], ['coarse', 3_000, false]] as const)('handles %s foreground permission with %sm accuracy without demanding precise/background permission', async (accuracy, metres, ready) => {
    const h = owner(); h.api.requestForegroundPermissionsAsync.mockResolvedValue(permission('granted', accuracy));
    const task = h.start(); await flush(); h.current.resolve(position(5.7, -0.1, 0, metres)); await flush();
    if (!ready) await vi.advanceTimersByTimeAsync(16_000);
    expect(await task.result).toBe(ready); expect(h.state.ready).toBe(ready); expect(h.api.enableNetworkProviderAsync).not.toHaveBeenCalled();
  });
  it('foreground permission revoked on resume invalidates the old automatic coordinate', async () => {
    const h = owner(); h.start(); await flush(); h.current.resolve(position()); await flush(); h.background();
    h.api.requestForegroundPermissionsAsync.mockResolvedValue(permission('denied'));
    const task = h.resume(); await flush(); expect(await task?.result).toBe(false);
    expect(h.state.ready).toBe(false); expect(h.state.label).toBe('Location permission needed');
  });
  it.each(['revoked', 'services-off'])('invalidates a recent cache when native watch reports %s during acquisition', async (reason) => {
    const h = owner(); h.api.getLastKnownPositionAsync.mockResolvedValue(position(5.8, -0.2, 30_000));
    h.start(); await flush(); expect(h.state.ready).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000); h.register(); await flush();
    if (reason === 'revoked') h.api.getForegroundPermissionsAsync.mockResolvedValue(permission('denied'));
    else h.api.hasServicesEnabledAsync.mockResolvedValue(false);
    h.watchError(); await flush();
    expect(h.state.ready).toBe(false); expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.state.label).toBe(reason === 'revoked' ? 'Location permission needed' : 'Turn on location services');
    expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a hung foreground permission request without starting location access', async () => {
    const h = owner(); h.api.requestForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));
    const task = h.start(); await vi.advanceTimersByTimeAsync(20_000);
    expect(await task.result).toBe(false); expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a hung provider-enable dialog and never reads a cache while services remain off', async () => {
    const h = owner(); h.api.hasServicesEnabledAsync.mockResolvedValue(false); h.api.enableNetworkProviderAsync.mockReturnValue(new Promise(() => {}));
    const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(20_000);
    expect(await task.result).toBe(false); expect(h.state.label).toBe('Turn on location services'); expect(h.api.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
});

describe('Android acquisition lifecycle and manual-selection races', () => {
  it.each(['manual', 'unmount', 'background', 'activateRide'] as const)('cleans registered watch and ignores late native callbacks after %s', async (event) => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(4_000); h.register(); await flush();
    h[event](); expect(h.remove).toHaveBeenCalledTimes(1); expect(await task.result).toBe(false); expect(vi.getTimerCount()).toBe(0);
    h.current.resolve(position()); h.emit(position()); h.watchError(); await flush(); expect(h.onCoordinate).not.toHaveBeenCalled();
    if (event === 'manual') expect(h.state).toEqual({ point: [6.2, -0.3], label: 'Chosen pickup', ready: true });
  });
  it.each(['manual', 'unmount', 'background'] as const)('removes a late watch registration after %s', async (event) => {
    const h = owner(); h.start(); await flush(); await vi.advanceTimersByTimeAsync(4_000);
    h[event](); h.register(); await flush(); expect(h.remove).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('removes a watch registered after its first successful callback', async () => {
    const h = owner(); const task = h.start(); await flush(); await vi.advanceTimersByTimeAsync(4_000);
    h.emit(position()); await flush(); expect(await task.result).toBe(true);
    h.register(); await flush(); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it('a replacement request wins over old cache/current/geocode results', async () => {
    const h = owner(); const cache = deferred<ExpoLocation.LocationObject>(); h.api.getLastKnownPositionAsync.mockReturnValueOnce(cache.promise);
    const first = h.start(); await flush(); const newCurrent = deferred<ExpoLocation.LocationObject>(); h.api.getCurrentPositionAsync.mockReturnValueOnce(newCurrent.promise);
    const second = h.start(); await flush(); expect(await first.result).toBe(false);
    cache.resolve(position(5.8, -0.2)); h.current.resolve(position(5.9, -0.3)); await flush(); expect(h.onCoordinate).not.toHaveBeenCalled();
    newCurrent.resolve(position(6.1, -0.4)); await flush(); expect(await second.result).toBe(true); expect(h.state.point).toEqual([6.1, -0.4]);
  });
  it('a deliberate pickup survives late geocoding and automatic foreground resume', async () => {
    const h = owner(); h.start(); await flush(); h.current.resolve(position()); await flush();
    h.manual(); h.geocode.resolve([{ name: 'Old GPS address' } as ExpoLocation.LocationGeocodedAddress]); await flush();
    h.background(); expect(h.resume()).toBeUndefined();
    expect(h.state).toEqual({ point: [6.2, -0.3], label: 'Chosen pickup', ready: true }); expect(h.onLabel).not.toHaveBeenCalled();
  });
  it('refreshes the device pickup on resume instead of retaining old GPS for booking', async () => {
    const h = owner(); h.start(); await flush(); h.current.resolve(position()); await flush(); h.background();
    expect(h.state.ready).toBe(false);
    const newCurrent = deferred<ExpoLocation.LocationObject>(); h.api.getCurrentPositionAsync.mockReturnValueOnce(newCurrent.promise);
    const task = h.resume(); await flush(); expect(h.state.ready).toBe(false);
    newCurrent.resolve(position(6.1, -0.4)); await flush(); expect(await task?.result).toBe(true);
    expect(h.state.point).toEqual([6.1, -0.4]); expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });
  it('checks owner generation even if a stale native callback arrives before explicit cancellation', async () => {
    const h = owner(); h.start(); await flush(); h.invalidateOnly(); h.current.resolve(position()); await flush();
    expect(h.onCoordinate).not.toHaveBeenCalled(); expect(h.api.watchPositionAsync).not.toHaveBeenCalled();
  });
  it('cancellation while foreground permission is pending prevents cache, GPS and provider requests', async () => {
    const h = owner(); const pending = deferred<ExpoLocation.LocationPermissionResponse>(); h.api.requestForegroundPermissionsAsync.mockReturnValue(pending.promise);
    const task = h.start(); await flush(); h.unmount(); pending.resolve(permission()); await flush();
    expect(await task.result).toBe(false); expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled(); expect(h.api.getProviderStatusAsync).not.toHaveBeenCalled();
  });
  it('immediate unmount cancels before even the foreground-permission native call starts', async () => {
    const h = owner(); const task = h.start(); h.unmount(); await flush();
    expect(await task.result).toBe(false); expect(h.api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
