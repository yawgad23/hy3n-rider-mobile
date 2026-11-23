export type DiagnosticSurface = 'home' | 'minimal';
export type DiagnosticEventName = 'mounted' | 'unmounted' | 'layout' | 'ready-state-observed' | 'ready-callback' | 'loaded-callback' | 'region-complete' | 'camera-read' | 'camera-read-failed' | 'render-failed';
export type DiagnosticDetails = Record<string, number | boolean>;
export type MapDiagnosticEvent = {
  surface: DiagnosticSurface;
  instanceId: number;
  name: DiagnosticEventName;
  elapsedMs: number;
  details: DiagnosticDetails;
};
export type NativeDiagnosticEvent = {
  name: string;
  elapsedMs: number;
  details: Record<string, string | number | boolean | null>;
};
export type NativeDiagnosticSnapshot = {
  schemaVersion: 1;
  sessionId: string;
  bundleIdentifier: string;
  appVersion: string;
  buildNumber: string;
  events: NativeDiagnosticEvent[];
};

const DETAIL_KEYS = new Set(['width', 'height', 'validCenter', 'validRegion', 'latitudeDelta', 'longitudeDelta', 'zoom', 'validCamera']);
const NATIVE_DETAIL_KEYS = new Set(['accepted', 'onMainThread', 'created', 'instanceId', 'keyCallObserved', 'keyAccepted', 'keyCallCompleted']);
const NATIVE_EVENT_NAMES = new Set(['launch.started', 'reactNative.start.begin', 'reactNative.start.end', 'maps.key.begin', 'maps.key.end', 'maps.view.create.begin', 'maps.view.create.end']);

/** Only explicit numeric/boolean fields are retained; never coordinates or error payloads. */
export function safeDiagnosticDetails(value: Record<string, unknown>): DiagnosticDetails {
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    DETAIL_KEYS.has(key) && (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))),
  )) as DiagnosticDetails;
}

export function createMapDiagnosticsStore(clock: () => number = () => Date.now(), capacity = 160) {
  const startedAt = clock();
  const limit = Math.max(1, Math.min(256, Math.floor(capacity) || 160));
  let nextId = 0;
  let events: MapDiagnosticEvent[] = [];
  return {
    newInstance() { nextId += 1; return nextId; },
    record(surface: DiagnosticSurface, instanceId: number, name: DiagnosticEventName, details: Record<string, unknown> = {}) {
      events.push({ surface, instanceId, name, elapsedMs: Math.max(0, clock() - startedAt), details: safeDiagnosticDetails(details) });
      events = events.slice(-limit);
    },
    snapshot(): MapDiagnosticEvent[] { return events.map((event) => ({ ...event, details: { ...event.details } })); },
  };
}

function safeMetadata(value: unknown, fallback: string) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value) && !value.startsWith('AIza') ? value : fallback;
}

/** A native response is untrusted: accept known event names and safe fields only. */
export function sanitizeNativeSnapshot(value: unknown): NativeDiagnosticSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.events)) return null;
  const events: NativeDiagnosticEvent[] = [];
  for (const candidate of input.events.slice(-256)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const event = candidate as Record<string, unknown>;
    if (typeof event.name !== 'string' || !NATIVE_EVENT_NAMES.has(event.name)
      || typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) continue;
    const details: NativeDiagnosticEvent['details'] = {};
    if (event.details && typeof event.details === 'object') {
      for (const [key, item] of Object.entries(event.details)) {
        if (!NATIVE_DETAIL_KEYS.has(key)) continue;
        if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) details[key] = item;
        else if (key === 'instanceId' && typeof item === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(item) && !item.startsWith('AIza')) details[key] = item;
      }
    }
    events.push({ name: event.name, elapsedMs: event.elapsedMs, details });
  }
  return {
    schemaVersion: 1,
    sessionId: safeMetadata(input.sessionId, 'unavailable'),
    bundleIdentifier: safeMetadata(input.bundleIdentifier, 'unavailable'),
    appVersion: safeMetadata(input.appVersion, 'unavailable'),
    buildNumber: safeMetadata(input.buildNumber, 'unavailable'),
    events,
  };
}

/** Uses native events only; JS and native elapsed clocks must never be compared. */
export function nativeInitializationObservation(snapshot: NativeDiagnosticSnapshot | null): string {
  if (!snapshot) return 'Native snapshot unavailable; initialization order is unknown.';
  const keyBegin = snapshot.events.findIndex((event) => event.name === 'maps.key.begin');
  const keyEnd = snapshot.events.findIndex((event) => event.name === 'maps.key.end');
  const firstMap = snapshot.events.findIndex((event) => event.name === 'maps.view.create.begin');
  if (firstMap < 0) return 'No native Google map creation recorded yet.';
  if (keyEnd >= 0 && keyEnd < firstMap) return 'Key call completed before the first recorded Google map creation. This does not prove server authorization.';
  if (keyBegin >= 0 && keyBegin < firstMap && (keyEnd < 0 || firstMap < keyEnd)) return 'First Google map creation was recorded while the key call had not yet completed. This is ordering evidence, not a confirmed cause.';
  if (keyBegin > firstMap) return 'First Google map creation was recorded before the key call began. This is ordering evidence, not a confirmed cause.';
  return 'Map creation recorded, but key-call completion/order could not be established.';
}
