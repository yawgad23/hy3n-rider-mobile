import React from 'react';
import type * as ExpoLocation from 'expo-location';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireAndroidPickup, isFreshAndroidPickup } from '@/lib/rider-android-pickup';
import { currentPickupLabel } from '@/lib/rider-current-pickup';
import { shouldRefreshRiderPickupOnForeground } from '@/lib/rider-pickup-freshness';

// Importing all of Home would boot its map, auth, networking and native UI. Instead
// execute its ORIGINAL pickup declarations/effects in their ORIGINAL order. AST
// selectors fail loudly if a hook disappears or becomes ambiguous; none of the
// lifecycle behavior below is a second implementation of Home's owner logic.
function extractHomePickupHooks() {
  const file = ts.createSourceFile(
    'index.tsx', readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const unique = <T,>(matches: T[], label: string): T => {
    if (matches.length !== 1) throw new Error(`Home AST selector ${label}: expected one match, got ${matches.length}`);
    return matches[0];
  };
  const home = unique(file.statements.filter((node): node is ts.FunctionDeclaration => (
    ts.isFunctionDeclaration(node) && node.name?.text === 'RiderHomeScreen'
  )), 'RiderHomeScreen');
  if (!home.body) throw new Error('Home has no function body');
  const statements = [...home.body.statements];
  function names(statement: ts.Statement) {
    const result: string[] = [];
    if (!ts.isVariableStatement(statement)) return result;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) result.push(declaration.name.text);
      else if (ts.isArrayBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) result.push(element.name.text);
        }
      }
    }
    return result;
  }
  const declaration = (name: string) => unique(statements.filter((node) => names(node).includes(name)), name);
  function references(node: ts.Node, name: string): boolean {
    if (ts.isIdentifier(node) && node.text === name) return true;
    return ts.forEachChild(node, (child) => references(child, name) || undefined) === true;
  }
  const effects = statements.filter((node): node is ts.ExpressionStatement => (
    ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'useEffect'
  ));
  const effect = (name: string) => unique(effects.filter((node) => references(node, name)), `useEffect(${name})`);
  const selected = new Set<ts.Statement>();
  const includeRange = (start: string, end: string) => {
    const first = statements.indexOf(declaration(start));
    const last = statements.indexOf(declaration(end));
    if (last <= first) throw new Error(`Home AST range ${start}..${end} is reversed`);
    for (const statement of statements.slice(first, last)) selected.add(statement);
  };
  includeRange('userLocation', 'handleUseCurrentPickupLocation');
  selected.delete(declaration('surge')); // unrelated networking state, not an owner hook
  selected.add(declaration('handleUseCurrentPickupLocation'));
  selected.add(unique(effects.filter((node) => references(node, 'androidPickupMountedRef')
    && !references(node, 'inProgressRideKeys')), 'pickup mount useEffect'));
  selected.add(unique(effects.filter((node) => references(node, 'AppState')
    && references(node, 'refreshCurrentPickupLocation')), 'pickup AppState useEffect'));
  // Include any added previous-active-ride ref and the actual render-time guard.
  includeRange('activeRide', 'inTripRouteChangeKind');
  selected.add(declaration('inProgressRideKeys'));
  selected.add(effect('inProgressRideKeys'));

  const handler = declaration('handleSelectLocation');
  const pickupBranches: ts.IfStatement[] = [];
  function findPickupBranch(node: ts.Node) {
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isIdentifier(node.expression.left) && node.expression.left.text === 'selectedMode'
      && ts.isStringLiteral(node.expression.right) && node.expression.right.text === 'pickup') pickupBranches.push(node);
    ts.forEachChild(node, findPickupBranch);
  }
  findPickupBranch(handler);
  const manual = unique(pickupBranches, 'handleSelectLocation pickup branch').thenStatement;
  if (!ts.isBlock(manual)) throw new Error('Home manual pickup branch is not a block');
  const original = statements.filter((node) => selected.has(node)).map((node) => node.getText(file)).join('\n');
  const source = `function ScopedHome(props) {
    const { activeRides, selectedRideId, updateActiveRide } = props;
    ${original}
    const selectPickup = (resolved) => ${manual.getText(file)};
    capture({ userLocation, pickupAddress, pickupLocationReady, refreshingPickupLocation,
      pickupSelectionSourceRef, pickupRefreshGenerationRef, riderAppStateRef,
      androidPickupRequestRef, androidPickupMountedRef, androidPickupActiveRideRef,
      refreshCurrentPickupLocation, handleUseCurrentPickupLocation, selectPickup });
    return null;
  }
  return ScopedHome;`;
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
}

// react-test-renderer has no installed declaration package in some SDK54 trees.
type Renderer = {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (node: React.ReactElement) => { update: (node: React.ReactElement) => void; unmount: () => void };
};
const renderer = createRequire(import.meta.url)('react-test-renderer') as Renderer;
const NOW = 1_795_348_000_000;
const DEFAULT_POINT: [number, number] = [5.6037, -0.187];
const MANUAL_POINT: [number, number] = [6.2, -0.3];
type Ride = { id: string; status: string; [key: string]: unknown };
type Snapshot = {
  userLocation: [number, number]; pickupAddress: string;
  pickupLocationReady: boolean; refreshingPickupLocation: boolean;
  pickupSelectionSourceRef: { current: string };
  pickupRefreshGenerationRef: { current: number };
  riderAppStateRef: { current: string | null };
  androidPickupRequestRef: { current: ReturnType<typeof acquireAndroidPickup> | null };
  androidPickupMountedRef: { current: boolean };
  androidPickupActiveRideRef: { current: boolean };
  refreshCurrentPickupLocation: (explicit?: boolean) => Promise<boolean>;
  handleUseCurrentPickupLocation: () => Promise<void>;
  selectPickup: (place: { lat: number; lng: number; address: string }) => void;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function permission(status: 'granted' | 'denied' = 'granted') {
  return { status, granted: status === 'granted', canAskAgain: true, expires: 'never', android: { accuracy: 'fine' } } as ExpoLocation.LocationPermissionResponse;
}
function position(latitude = 5.7, longitude = -0.1, age = 0): ExpoLocation.LocationObject {
  return {
    timestamp: Date.now() - age,
    coords: { latitude, longitude, accuracy: 25, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  };
}
const compiled = extractHomePickupHooks();
if (compiled.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
}

function setup(options: { initialAppState?: string; beforePassiveAppState?: string; rides?: Ride[] } = {}) {
  const listeners = new Set<(value: string) => void>();
  const AppState = {
    currentState: options.initialAppState ?? 'active',
    addEventListener: vi.fn((_event: string, listener: (value: string) => void) => {
      listeners.add(listener);
      return { remove: vi.fn(() => listeners.delete(listener)) };
    }),
  };
  const current = deferred<ExpoLocation.LocationObject>();
  const registrations: { callback: ExpoLocation.LocationCallback; pending: ReturnType<typeof deferred<ExpoLocation.LocationSubscription>>; remove: ReturnType<typeof vi.fn> }[] = [];
  const api = {
    Accuracy: { Balanced: 3 } as typeof ExpoLocation.Accuracy,
    requestForegroundPermissionsAsync: vi.fn().mockResolvedValue(permission()),
    getForegroundPermissionsAsync: vi.fn().mockResolvedValue(permission()),
    hasServicesEnabledAsync: vi.fn().mockResolvedValue(true),
    getProviderStatusAsync: vi.fn().mockResolvedValue({ locationServicesEnabled: true, backgroundModeEnabled: false, gpsAvailable: true, networkAvailable: true }),
    enableNetworkProviderAsync: vi.fn().mockResolvedValue(undefined),
    getLastKnownPositionAsync: vi.fn().mockResolvedValue(null),
    getCurrentPositionAsync: vi.fn().mockReturnValue(current.promise),
    watchPositionAsync: vi.fn().mockImplementation((_options, callback) => {
      const registration = { callback, pending: deferred<ExpoLocation.LocationSubscription>(), remove: vi.fn() };
      registrations.push(registration);
      return registration.pending.promise;
    }),
    reverseGeocodeAsync: vi.fn().mockResolvedValue([]),
  };
  const requests: ReturnType<typeof acquireAndroidPickup>[] = [];
  const acquire = vi.fn((...args: Parameters<typeof acquireAndroidPickup>) => {
    const request = acquireAndroidPickup(...args);
    vi.spyOn(request, 'cancel');
    requests.push(request);
    return request;
  });
  let state!: Snapshot;
  let props = { activeRides: options.rides ?? [], selectedRideId: options.rides?.[0]?.id ?? null as string | null, updateActiveRide: vi.fn() };
  const tracked: Ride[] = [];
  props.updateActiveRide.mockImplementation((update: (ride: Ride) => Ride) => {
    for (const ride of props.activeRides) tracked.push(update(ride));
  });
  let gapApplied = false;
  const capture = (snapshot: Snapshot) => {
    state = snapshot;
    // A native AppState transition between render and passive subscription is
    // represented by changing the GLOBAL state only, never Home's private ref.
    if (!gapApplied && options.beforePassiveAppState) {
      gapApplied = true;
      AppState.currentState = options.beforePassiveAppState;
    }
  };
  const metrics = { setRideMetrics: vi.fn(), setCurrentDynamicFare: vi.fn(), setTotalDistanceTraveled: vi.fn() };
  const environment = {
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
    AppState, Platform: { OS: 'android' }, ExpoLocation: api, acquireAndroidPickup: acquire,
    isFreshAndroidPickup, shouldRefreshRiderPickupOnForeground, currentPickupLabel,
    DEFAULT_LOCATION: DEFAULT_POINT, Haptics: { selectionAsync: vi.fn().mockResolvedValue(undefined) },
    Alert: { alert: vi.fn() }, capture, ...metrics, getQuotedRideFare: vi.fn(() => 24),
    setSearchOpen: vi.fn(), setSearchQuery: vi.fn(),
  };
  const Component = new Function(...Object.keys(environment), compiled.outputText)(...Object.values(environment)) as React.ComponentType<typeof props>;
  let view: ReturnType<Renderer['create']> | undefined;
  let unmounted = false;
  const flush = async (milliseconds = 0) => {
    await renderer.act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  };
  const mount = async () => {
    await renderer.act(async () => { view = renderer.create(React.createElement(Component, props)); });
    await flush();
  };
  const changeAppState = async (value: string) => {
    await renderer.act(async () => {
      AppState.currentState = value;
      for (const listener of listeners) listener(value);
    });
    await flush();
  };
  const rides = async (activeRides: Ride[]) => {
    props = { ...props, activeRides, selectedRideId: activeRides[0]?.id ?? null };
    await renderer.act(async () => { view!.update(React.createElement(Component, props)); });
    await flush();
  };
  const manual = async () => {
    await renderer.act(async () => { state.selectPickup({ lat: MANUAL_POINT[0], lng: MANUAL_POINT[1], address: 'Chosen pickup' }); });
    await flush();
  };
  const unmount = async () => {
    if (!view || unmounted) return;
    unmounted = true;
    await renderer.act(async () => { view!.unmount(); });
    await flush();
  };
  return {
    api, AppState, listeners, current, requests, acquire, registrations, tracked, metrics,
    get state() { return state; }, mount, flush, changeAppState, rides, manual, unmount,
    register: async (index = 0) => {
      const registration = registrations[index];
      registration.pending.resolve({ remove: registration.remove });
      await flush();
    },
    emit: async (fix: ExpoLocation.LocationObject, index = 0) => {
      await renderer.act(async () => { registrations[index].callback(fix); });
      await flush();
    },
  };
}
const homes: ReturnType<typeof setup>[] = [];
function home(options?: Parameters<typeof setup>[0]) {
  const item = setup(options); homes.push(item); return item;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  try {
    for (const item of homes) {
      await item.unmount();
      expect(item.listeners.size).toBe(0);
    }
    // Check Home's OWN unmount cancellation, before fallback test isolation.
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    for (const item of homes.splice(0)) item.requests.forEach((request) => request.cancel());
    vi.clearAllTimers(); vi.useRealTimers();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

describe('real Rider Home Android pickup lifecycle', () => {
  it('retains a provider dialog request across pause and delivers decline once on return, without re-prompting', async () => {
    const h = home(); const dialog = deferred<void>();
    h.api.hasServicesEnabledAsync.mockResolvedValue(false);
    h.api.enableNetworkProviderAsync.mockReturnValue(dialog.promise);
    await h.mount();
    expect(h.api.enableNetworkProviderAsync).toHaveBeenCalledTimes(1);
    const first = h.requests[0]; const generation = h.state.pickupRefreshGenerationRef.current;
    await h.changeAppState('background');
    expect(first.cancel).not.toHaveBeenCalled();
    expect(h.state.pickupRefreshGenerationRef.current).toBe(generation);
    dialog.reject(new Error('User declined')); await h.flush();
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(h.state.pickupLocationReady).toBe(false);
    await h.changeAppState('active');
    expect(h.requests).toHaveLength(1);
    expect(h.api.enableNetworkProviderAsync).toHaveBeenCalledTimes(1);
    expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(await first.result).toBe(false);
    expect(h.state.pickupAddress).toBe('Turn on location services');
    expect(h.state.refreshingPickupLocation).toBe(false);
  });

  it.each(['before', 'after'] as const)('accepts provider settings %s foreground return using one request and no background GPS', async (order) => {
    const h = home(); const dialog = deferred<void>();
    h.api.hasServicesEnabledAsync.mockResolvedValueOnce(false).mockResolvedValue(true);
    h.api.enableNetworkProviderAsync.mockReturnValue(dialog.promise);
    await h.mount(); const first = h.requests[0];
    await h.changeAppState('background');
    if (order === 'before') { dialog.resolve(); await h.flush(); }
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    await h.changeAppState('active');
    if (order === 'after') {
      expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
      dialog.resolve(); await h.flush();
    }
    expect(h.requests).toHaveLength(1);
    expect(h.api.enableNetworkProviderAsync).toHaveBeenCalledTimes(1);
    expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    h.current.resolve(position(6.1, -0.4)); await h.flush();
    expect(await first.result).toBe(true);
    expect(h.state.userLocation).toEqual([6.1, -0.4]);
    expect(h.state.pickupLocationReady).toBe(true);
  });

  it('does not duplicate a permission request when foreground returns before the native grant', async () => {
    const h = home(); const prompt = deferred<ExpoLocation.LocationPermissionResponse>();
    h.api.requestForegroundPermissionsAsync.mockReturnValue(prompt.promise);
    await h.mount(); const first = h.requests[0];
    await h.changeAppState('background'); await h.changeAppState('active');
    expect(h.requests).toHaveLength(1);
    expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    prompt.resolve(permission()); await h.flush();
    h.current.resolve(position()); await h.flush();
    expect(await first.result).toBe(true);
    expect(h.state.pickupLocationReady).toBe(true);
  });

  it('delivers a paused permission timeout once on return without re-prompting or accepting the late grant', async () => {
    const h = home(); const prompt = deferred<ExpoLocation.LocationPermissionResponse>();
    h.api.requestForegroundPermissionsAsync.mockReturnValue(prompt.promise);
    await h.mount(); const first = h.requests[0];
    await h.changeAppState('background'); await h.flush(21_000);
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    await h.changeAppState('active');
    expect(await first.result).toBe(false);
    expect(h.requests).toHaveLength(1);
    expect(h.state.refreshingPickupLocation).toBe(false);
    expect(h.state.pickupAddress).toBe('Location unavailable');
    prompt.resolve(permission()); await h.flush();
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(h.state.pickupLocationReady).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds a permission grant during native pause and resumes the same acquisition only in foreground', async () => {
    const h = home(); const prompt = deferred<ExpoLocation.LocationPermissionResponse>();
    h.api.requestForegroundPermissionsAsync.mockReturnValue(prompt.promise);
    await h.mount(); const first = h.requests[0];
    await h.changeAppState('inactive');
    expect(first.cancel).not.toHaveBeenCalled();
    prompt.resolve(permission()); await h.flush();
    expect(h.api.hasServicesEnabledAsync).not.toHaveBeenCalled();
    expect(h.api.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    await h.changeAppState('active');
    expect(h.requests).toHaveLength(1);
    expect(h.api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    h.current.resolve(position(6.1, -0.4)); await h.flush();
    expect(await first.result).toBe(true);
    expect(h.state.userLocation).toEqual([6.1, -0.4]);
    expect(h.state.pickupLocationReady).toBe(true);
    expect(h.state.refreshingPickupLocation).toBe(false);
  });

  it('cancels ordinary GPS work on background, ignores its late fix and creates a fresh foreground acquisition', async () => {
    const h = home(); await h.mount(); const first = h.requests[0];
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    await h.changeAppState('background');
    expect(first.cancel).toHaveBeenCalled(); expect(await first.result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    h.current.resolve(position(5.9, -0.3)); await h.flush();
    expect(h.state.userLocation).toEqual(DEFAULT_POINT);
    const replacement = deferred<ExpoLocation.LocationObject>();
    h.api.getCurrentPositionAsync.mockReturnValue(replacement.promise);
    await h.changeAppState('active');
    expect(h.requests).toHaveLength(2);
    replacement.resolve(position(6.1, -0.4)); await h.flush();
    expect(h.state.userLocation).toEqual([6.1, -0.4]); expect(h.state.pickupLocationReady).toBe(true);
  });

  it('synchronizes currentState and installs the listener before startup when render saw background but effects see active', async () => {
    const h = home({ initialAppState: 'background', beforePassiveAppState: 'active' });
    h.api.requestForegroundPermissionsAsync.mockImplementation(async () => {
      expect(h.listeners.size).toBe(1);
      return permission();
    });
    await h.mount();
    expect(h.state.riderAppStateRef.current).toBe('active');
    expect(h.requests).toHaveLength(1);
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not start detection when render saw active but global currentState is background before subscription', async () => {
    const h = home({ initialAppState: 'active', beforePassiveAppState: 'background' });
    await h.mount();
    expect(h.state.riderAppStateRef.current).toBe('background');
    expect(h.requests).toHaveLength(0);
    expect(h.api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await h.changeAppState('active');
    expect(h.requests).toHaveLength(1);
  });

  it('refreshes device pickup once on the last-active-ride true-to-false edge, not initial false or ride object updates', async () => {
    const h = home(); await h.mount();
    expect(h.requests).toHaveLength(1); // initial false must not trigger a second refresh
    const first = h.requests[0];
    await h.rides([{ id: 'ride-a', status: 'matched' }]);
    expect(first.cancel).toHaveBeenCalled(); expect(await first.result).toBe(false);
    await h.rides([{ id: 'ride-a', status: 'matched', eta: 3 }]);
    await h.rides([{ id: 'ride-b', status: 'matched' }]);
    expect(h.requests).toHaveLength(1);
    await h.rides([]);
    expect(h.requests).toHaveLength(2);
    await h.rides([]);
    expect(h.requests).toHaveLength(2);
    h.current.resolve(position(6.03, -0.22)); await h.flush();
    expect(h.state.userLocation).toEqual([6.03, -0.22]); expect(h.state.pickupLocationReady).toBe(true);
  });

  it('manual pickup cancels even a pending dialog and survives both last-ride removal and foreground return', async () => {
    const h = home(); const prompt = deferred<ExpoLocation.LocationPermissionResponse>();
    h.api.requestForegroundPermissionsAsync.mockReturnValue(prompt.promise);
    await h.mount(); const first = h.requests[0];
    await h.manual();
    expect(first.cancel).toHaveBeenCalled(); expect(await first.result).toBe(false);
    await h.rides([{ id: 'ride-a', status: 'matched' }]); await h.rides([]);
    await h.changeAppState('background'); prompt.resolve(permission()); await h.flush();
    await h.changeAppState('active');
    expect(h.requests).toHaveLength(1);
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(h.state.userLocation).toEqual(MANUAL_POINT);
    expect(h.state.pickupAddress).toBe('Chosen pickup'); expect(h.state.pickupLocationReady).toBe(true);
  });

  it('unmount cancels a paused native permission interaction and all its timers and late outcomes', async () => {
    const h = home(); const prompt = deferred<ExpoLocation.LocationPermissionResponse>();
    h.api.requestForegroundPermissionsAsync.mockReturnValue(prompt.promise);
    await h.mount(); const first = h.requests[0]; await h.changeAppState('background');
    await h.unmount();
    expect(first.cancel).toHaveBeenCalled(); expect(await first.result).toBe(false);
    expect(vi.getTimerCount()).toBe(0); expect(h.listeners.size).toBe(0);
    prompt.resolve(permission()); await h.flush();
    expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('a new active ride cancels a paused settings dialog rather than retaining it like a native-only pause', async () => {
    const h = home(); const dialog = deferred<void>();
    h.api.hasServicesEnabledAsync.mockResolvedValue(false); h.api.enableNetworkProviderAsync.mockReturnValue(dialog.promise);
    await h.mount(); const first = h.requests[0]; await h.changeAppState('background');
    await h.rides([{ id: 'ride-a', status: 'matched' }]);
    expect(first.cancel).toHaveBeenCalled(); expect(await first.result).toBe(false);
    dialog.resolve(); await h.flush(); await h.changeAppState('active');
    expect(h.requests).toHaveLength(1); expect(h.api.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(h.state.pickupLocationReady).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('removes safety-watch registration resolving after ride cleanup and ignores its callback over a newer manual pickup', async () => {
    const h = home({ rides: [{ id: 'trip-a', status: 'in_progress' }] }); await h.mount();
    expect(h.registrations).toHaveLength(1);
    await h.rides([]); await h.manual(); await h.register();
    expect(h.registrations[0].remove).toHaveBeenCalledTimes(1);
    await h.emit(position(5.8, -0.2));
    expect(h.state.userLocation).toEqual(MANUAL_POINT); expect(h.state.pickupAddress).toBe('Chosen pickup');
    expect(h.tracked).toHaveLength(0);
  });

  it('removes safety-watch registration resolving after unmount and makes late callbacks inert', async () => {
    const h = home({ rides: [{ id: 'trip-a', status: 'in_progress' }] }); await h.mount();
    await h.unmount(); await h.register(); await h.emit(position());
    expect(h.registrations[0].remove).toHaveBeenCalledTimes(1);
    expect(h.tracked).toHaveLength(0); expect(h.metrics.setRideMetrics).not.toHaveBeenCalled();
  });

  it('preserves valid in-trip foreground safety tracking but rejects stale and background callbacks', async () => {
    const h = home({ rides: [{ id: 'trip-a', status: 'in_progress', actualDistanceKm: 2, surgeMultiplier: 1 }] });
    await h.mount(); await h.register(); await h.emit(position(5.8, -0.2));
    expect(h.state.userLocation).toEqual([5.8, -0.2]);
    expect(h.tracked).toHaveLength(1);
    expect(h.tracked[0]).toEqual(expect.objectContaining({ lastRiderLocation: { lat: 5.8, lng: -0.2 }, actualDistanceKm: 2 }));
    expect(h.metrics.setRideMetrics).toHaveBeenCalledTimes(1);
    await h.emit(position(6.1, -0.4, 120_000));
    expect(h.state.userLocation).toEqual([5.8, -0.2]); expect(h.tracked).toHaveLength(1);
    const malformed = position(6.1, -0.4);
    (malformed.coords as unknown as Record<string, unknown>).latitude = null;
    await h.emit(malformed);
    expect(h.state.userLocation).toEqual([5.8, -0.2]); expect(h.tracked).toHaveLength(1);
    await h.changeAppState('background'); await h.emit(position(6.2, -0.3));
    expect(h.state.userLocation).toEqual([5.8, -0.2]); expect(h.tracked).toHaveLength(1);
    await h.changeAppState('active'); await h.emit(position(6.03, -0.22));
    expect(h.state.userLocation).toEqual([6.03, -0.22]); expect(h.tracked).toHaveLength(2);
    expect(h.registrations[0].remove).not.toHaveBeenCalled();
    await h.unmount(); expect(h.registrations[0].remove).toHaveBeenCalledTimes(1);
  });

  it('live pickup expiry starts one foreground refresh, stays unready until fresh GPS and does not loop after bounded failure', async () => {
    const h = home(); await h.mount(); h.current.resolve(position()); await h.flush();
    expect(h.state.pickupLocationReady).toBe(true);
    const next = deferred<ExpoLocation.LocationObject>();
    h.api.getCurrentPositionAsync.mockReturnValue(next.promise);
    await h.flush(120_000);
    expect(h.requests).toHaveLength(2);
    expect(h.state.pickupLocationReady).toBe(false); expect(h.state.refreshingPickupLocation).toBe(true);
    expect(h.state.pickupAddress).toBe('Update current location');
    expect(h.state.userLocation).toEqual([5.7, -0.1]);
    next.resolve(position(6.1, -0.4)); await h.flush();
    expect(h.state.pickupLocationReady).toBe(true); expect(h.state.userLocation).toEqual([6.1, -0.4]);
    h.api.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    await h.flush(120_000);
    expect(h.requests).toHaveLength(3); expect(h.state.pickupLocationReady).toBe(false);
    await h.flush(16_000);
    expect(h.state.pickupLocationReady).toBe(false); expect(h.state.refreshingPickupLocation).toBe(false);
    expect(h.state.pickupAddress).toBe('Location unavailable');
    expect(vi.getTimerCount()).toBe(0);
    await h.flush(240_000); expect(h.requests).toHaveLength(3);
  });

  it('cache expiry while the original GPS acquisition is running invalidates booking without replacing the request', async () => {
    const h = home();
    h.api.getLastKnownPositionAsync.mockResolvedValue(position(5.8, -0.2, 110_000));
    await h.mount(); const first = h.requests[0];
    expect(h.state.pickupLocationReady).toBe(true); expect(await first.result).toBe(true);
    await h.flush(10_000);
    expect(h.requests).toHaveLength(1); expect(first.cancel).not.toHaveBeenCalled();
    expect(h.api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(h.state.pickupLocationReady).toBe(false); expect(h.state.pickupAddress).toBe('Update current location');
    h.current.resolve(position(6.03, -0.22)); await h.flush();
    expect(h.requests).toHaveLength(1); expect(h.state.pickupLocationReady).toBe(true);
    expect(h.state.userLocation).toEqual([6.03, -0.22]);
  });
});
