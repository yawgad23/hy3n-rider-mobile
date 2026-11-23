import { NativeModules, Platform } from 'react-native';
import {
  createMapDiagnosticsStore,
  sanitizeNativeSnapshot,
  type DiagnosticEventName,
  type DiagnosticSurface,
  type NativeDiagnosticSnapshot,
} from './maps-diagnostics-store';

const observations = createMapDiagnosticsStore();

/** The native module exists only in the explicitly diagnostic iOS binary. */
export function isIOSMapsDiagnosticsEnabled(): boolean {
  return Platform.OS === 'ios'
    && NativeModules.HY3NMapsDiagnostics?.enabled === true
    && typeof NativeModules.HY3NMapsDiagnostics?.getSnapshot === 'function';
}

export function newMapDiagnosticInstance(): number {
  return isIOSMapsDiagnosticsEnabled() ? observations.newInstance() : 0;
}

export function recordMapDiagnostic(surface: DiagnosticSurface, instanceId: number, name: DiagnosticEventName, details: Record<string, unknown> = {}): void {
  if (!isIOSMapsDiagnosticsEnabled()) return;
  // Diagnostics must never interrupt a trip, camera command or ready callback.
  try { observations.record(surface, instanceId, name, details); } catch { /* Passive observation only. */ }
}

export function getMapDiagnosticEvents() { return observations.snapshot(); }

export async function getNativeMapDiagnostics(): Promise<NativeDiagnosticSnapshot | null> {
  if (!isIOSMapsDiagnosticsEnabled()) return null;
  try { return sanitizeNativeSnapshot(await NativeModules.HY3NMapsDiagnostics.getSnapshot()); }
  catch { return null; }
}

export function validDiagnosticRegion(value: { latitude?: number; longitude?: number; latitudeDelta?: number; longitudeDelta?: number }): boolean {
  return Number.isFinite(value.latitude) && Math.abs(value.latitude!) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude!) <= 180
    && Number.isFinite(value.latitudeDelta) && value.latitudeDelta! > 0
    && Number.isFinite(value.longitudeDelta) && value.longitudeDelta! > 0;
}
