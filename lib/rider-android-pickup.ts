import type * as ExpoLocation from 'expo-location';
import { currentPickupLabel } from './rider-current-pickup';

export const ANDROID_PICKUP_MAX_AGE_MS = 120_000;
export const ANDROID_PICKUP_MAX_ACCURACY_METRES = 1_000;
const PROVIDER_TIMEOUT_MS = 2_000;
const USER_PROMPT_TIMEOUT_MS = 20_000;
const WATCH_FALLBACK_DELAY_MS = 4_000;
const ACQUISITION_TIMEOUT_MS = 16_000;
const GEOCODE_TIMEOUT_MS = 3_000;

type AndroidLocationAPI = Pick<typeof ExpoLocation,
  'requestForegroundPermissionsAsync' | 'getForegroundPermissionsAsync' | 'hasServicesEnabledAsync' |
  'getProviderStatusAsync' | 'enableNetworkProviderAsync' |
  'getLastKnownPositionAsync' | 'getCurrentPositionAsync' |
  'watchPositionAsync' | 'reverseGeocodeAsync' | 'Accuracy'>;

export type AndroidPickupCallbacks = {
  /** Checked before every callback, including native results arriving after cancellation. */
  isCurrent: () => boolean;
  onCoordinate: (point: [number, number], label: string) => void;
  onLabel: (label: string) => void;
  onUnavailable: (label: string) => void;
  onExpired: () => void;
};

/** Never coerce native nulls, strings or booleans into booking coordinates. */
export function isFreshAndroidPickup(location: ExpoLocation.LocationObject | null | undefined, now = Date.now()): location is ExpoLocation.LocationObject {
  const coords = location?.coords;
  return Boolean(coords
    && typeof coords.latitude === 'number' && Number.isFinite(coords.latitude) && Math.abs(coords.latitude) <= 90
    && typeof coords.longitude === 'number' && Number.isFinite(coords.longitude) && Math.abs(coords.longitude) <= 180
    && !(coords.latitude === 0 && coords.longitude === 0)
    && typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)
    && coords.accuracy >= 0 && coords.accuracy <= ANDROID_PICKUP_MAX_ACCURACY_METRES
    && typeof location?.timestamp === 'number' && Number.isFinite(location.timestamp)
    && location.timestamp > 0 && now >= location.timestamp && now - location.timestamp < ANDROID_PICKUP_MAX_AGE_MS);
}

/**
 * Foreground-only acquisition, not continuous tracking. Native one-shot and
 * geocoder promises cannot be aborted; cancellation removes our timers/watch
 * and makes their late results inert. A successful result does not wait for an
 * address. The owner must cancel on replacement, manual choice and unmount.
 */
export function acquireAndroidPickup(api: AndroidLocationAPI, callbacks: AndroidPickupCallbacks) {
  let cancelled = false;
  let acquisitionClosed = false;
  let committed: ExpoLocation.LocationObject | null = null;
  let revision = 0;
  let watchStarted = false;
  let subscription: ExpoLocation.LocationSubscription | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let geocodeCancel: (() => void) | undefined;
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let settled = false;
  let resolveResult: (value: boolean) => void = () => {};
  const result = new Promise<boolean>((resolve) => { resolveResult = resolve; });
  const active = () => !cancelled && callbacks.isCurrent();
  const settle = (value: boolean) => {
    if (!settled) { settled = true; resolveResult(value); }
  };
  const removeWatch = () => {
    try { subscription?.remove(); } catch { /* Already removed by the native provider. */ }
    subscription = null;
  };
  const later = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.set(timer, () => {});
    return timer;
  };
  const clearTimer = (timer: ReturnType<typeof setTimeout> | undefined) => {
    if (timer === undefined) return;
    clearTimeout(timer);
    const stop = timers.get(timer);
    timers.delete(timer);
    stop?.();
  };
  const bounded = <T,>(request: () => Promise<T>, timeout: number) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { timers.delete(timer); reject(new Error('LOCATION_TIMEOUT')); }, timeout);
    timers.set(timer, () => reject(new Error('LOCATION_CANCELLED')));
    Promise.resolve().then(() => {
      if (!active()) throw new Error('LOCATION_CANCELLED');
      return request();
    }).then(
      (value) => { clearTimeout(timer); timers.delete(timer); resolve(value); },
      (error) => { clearTimeout(timer); timers.delete(timer); reject(error); },
    );
  });
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    revision += 1;
    removeWatch();
    for (const timer of [...timers.keys()]) clearTimer(timer);
    settle(false);
  };
  let watchDelay: ReturnType<typeof setTimeout> | undefined;
  let acquisitionDeadline: ReturnType<typeof setTimeout> | undefined;
  const closeAcquisition = () => {
    acquisitionClosed = true;
    clearTimer(watchDelay);
    clearTimer(acquisitionDeadline);
    removeWatch();
  };
  const commit = (location: ExpoLocation.LocationObject | null, live: boolean) => {
    if (!active() || acquisitionClosed || !isFreshAndroidPickup(location)) return false;
    // A late cache must never pull the pickup back from a live fix.
    if (!live && committed) return false;
    committed = location;
    const pointRevision = ++revision;
    clearTimer(expiry);
    geocodeCancel?.();
    const label = live ? 'Current location' : 'Recent location';
    callbacks.onCoordinate([location.coords.latitude, location.coords.longitude], label);
    settle(true);
    expiry = later(() => {
      if (!active() || revision !== pointRevision) return;
      committed = null;
      revision += 1;
      geocodeCancel?.();
      callbacks.onExpired();
    }, ANDROID_PICKUP_MAX_AGE_MS - (Date.now() - location.timestamp));
    if (live) {
      closeAcquisition();
      // Separate and bounded: GPS readiness must never depend on Android's geocoder.
      let labelActive = true;
      geocodeCancel = () => { labelActive = false; clearTimer(labelDeadline); };
      const labelDeadline = later(() => { labelActive = false; }, GEOCODE_TIMEOUT_MS);
      Promise.resolve().then(() => {
        if (!active() || !labelActive) throw new Error('LOCATION_CANCELLED');
        return api.reverseGeocodeAsync({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      }).then((addresses) => {
        if (active() && labelActive && revision === pointRevision) callbacks.onLabel(currentPickupLabel(addresses));
        clearTimer(labelDeadline);
      }, () => { clearTimer(labelDeadline); });
    }
    return true;
  };
  const startWatch = () => {
    if (!active() || acquisitionClosed || watchStarted) return;
    watchStarted = true;
    Promise.resolve().then(() => {
      if (!active() || acquisitionClosed) throw new Error('LOCATION_CANCELLED');
      return api.watchPositionAsync(
        { accuracy: api.Accuracy.Balanced, timeInterval: 1_000, distanceInterval: 0, mayShowUserSettingsDialog: false },
        (location) => { commit(location, true); },
        () => { void checkAccessAfterError(); },
      );
    }).then((registered) => {
      // Registration can resolve after the watch's first callback or cancellation.
      if (!active() || acquisitionClosed) {
        try { registered.remove(); } catch { /* No active subscription remains. */ }
      } else subscription = registered;
    }, () => { void checkAccessAfterError(); });
  };
  const fail = (label: string) => {
    if (!active()) { cancel(); return; }
    closeAcquisition();
    if (!committed) { callbacks.onUnavailable(label); settle(false); }
  };
  let checkingAccess = false;
  const checkAccessAfterError = async () => {
    if (!active() || acquisitionClosed || checkingAccess) return;
    checkingAccess = true;
    try {
      // No second prompt and no background permission. A native provider error
      // may mean permission was revoked or services disabled during acquisition.
      const permission = await bounded(() => api.getForegroundPermissionsAsync(), PROVIDER_TIMEOUT_MS);
      if (!active() || acquisitionClosed) return;
      let label: string | undefined;
      if (permission.status !== 'granted' || permission.android?.accuracy === 'none') label = 'Location permission needed';
      else {
        const enabled = await bounded(() => api.hasServicesEnabledAsync(), PROVIDER_TIMEOUT_MS);
        if (!active() || acquisitionClosed) return;
        if (!enabled) label = 'Turn on location services';
      }
      if (label) {
        committed = null;
        revision += 1;
        clearTimer(expiry);
        fail(label);
      }
    } catch { /* Unknown error: the existing acquisition deadline still applies. */ }
    finally { checkingAccess = false; }
  };
  void (async () => {
    try {
      // Permission comes first: an initially disabled provider must not skip the
      // foreground permission request or the user-approved Android settings dialog.
      const permission = await bounded(() => api.requestForegroundPermissionsAsync(), USER_PROMPT_TIMEOUT_MS);
      if (!active()) return cancel();
      if (permission.status !== 'granted' || permission.android?.accuracy === 'none') {
        fail('Location permission needed'); return;
      }
      let servicesEnabled = await bounded(() => api.hasServicesEnabledAsync(), PROVIDER_TIMEOUT_MS);
      if (!active()) return cancel();
      let provider: ExpoLocation.LocationProviderStatus | undefined;
      try { provider = await bounded(() => api.getProviderStatusAsync(), PROVIDER_TIMEOUT_MS); } catch { /* GPS may still work without provider details. */ }
      if (!active()) return cancel();
      // Ask, never force. Avoid repeatedly prompting when GPS/network already work.
      if (!servicesEnabled || (provider?.gpsAvailable === false && provider?.networkAvailable === false)) {
        try { await bounded(() => api.enableNetworkProviderAsync(), USER_PROMPT_TIMEOUT_MS); } catch { /* Declining does not revoke a usable GPS provider. */ }
        if (!active()) return cancel();
        servicesEnabled = await bounded(() => api.hasServicesEnabledAsync(), PROVIDER_TIMEOUT_MS);
        if (!active()) return cancel();
      }
      if (!servicesEnabled) { fail('Turn on location services'); return; }
      acquisitionDeadline = later(() => fail('Location unavailable'), ACQUISITION_TIMEOUT_MS);
      watchDelay = later(startWatch, WATCH_FALLBACK_DELAY_MS);
      // Start both immediately; even a hung cache lookup cannot delay live GPS.
      Promise.resolve().then(() => {
        if (!active() || acquisitionClosed) throw new Error('LOCATION_CANCELLED');
        return api.getLastKnownPositionAsync({
          maxAge: ANDROID_PICKUP_MAX_AGE_MS, requiredAccuracy: ANDROID_PICKUP_MAX_ACCURACY_METRES,
        });
      }).then((location) => { commit(location, false); }, () => {});
      Promise.resolve().then(() => {
        if (!active() || acquisitionClosed) throw new Error('LOCATION_CANCELLED');
        return api.getCurrentPositionAsync({ accuracy: api.Accuracy.Balanced, mayShowUserSettingsDialog: false });
      }).then((location) => { if (!commit(location, true)) startWatch(); }, () => {
        void checkAccessAfterError();
        startWatch();
      });
    } catch {
      fail('Location unavailable');
    }
  })();
  return { result, cancel };
}
