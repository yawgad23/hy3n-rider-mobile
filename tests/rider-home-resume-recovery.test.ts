import React from 'react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverActiveRide, recoverActiveRides, type RecoveredActiveRide } from '@/lib/rider-active-ride-recovery';
import { buildRiderTerminalSummary, type RiderTerminalSummary } from '@/lib/rider-terminal-summary';
import { passiveCompletionPresentation } from '@/lib/rider-completion-presentation';
import { latestRecoverableCompletedRide, mergeRecoveredRiderRides } from '@/lib/rider-resume-recovery';
import { removeRide, rideKeysMatch, updateRide } from '@/lib/rider-ride-state';
import { riderTerminalStatus } from '@/lib/rider-ride-status';
import { isExpiredRiderSearch } from '@/lib/rider-search-expiry';

/**
 * Execute the actual Home declarations, callbacks and effects, in source order.
 * No state initializer, completion presenter, selection/recovery logic or ride
 * merge is copied into this harness. Only native/network/storage boundaries and
 * the unrelated find-another-ride offer are mocked. Structural selectors fail
 * closed if a required source declaration/effect is missing or ambiguous.
 */
function extractHomeRecoveryScope() {
  const file = ts.createSourceFile(
    'index.tsx',
    readFileSync(resolve(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const unique = <T,>(items: T[], label: string): T => {
    if (items.length !== 1) throw new Error(`Home AST selector ${label}: expected one match, got ${items.length}`);
    return items[0];
  };
  const home = unique(file.statements.filter((node): node is ts.FunctionDeclaration => (
    ts.isFunctionDeclaration(node) && node.name?.text === 'RiderHomeScreen'
  )), 'RiderHomeScreen');
  if (!home.body) throw new Error('RiderHomeScreen has no body');
  const bindingNames = (name: ts.BindingName): string[] => ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
  const declaredNames = (node: ts.Statement): string[] => ts.isVariableStatement(node)
    ? node.declarationList.declarations.flatMap(declaration => bindingNames(declaration.name))
    : [];
  const declarations = [
    'activeRides', 'activeRidesRef', 'selectedRideIdRef', 'rideRecoveryOwnerRef',
    'terminalRideIdsRef', 'presentedCompletionRideIdsRef', 'rebookPromptedRideIdsRef',
    'selectedRideId', 'updateActiveRide', 'removeActiveRide', 'presentCompletedRide',
    'showRatingModal', 'showTipModal', 'ratingValue', 'ratingComment', 'selectedRatingTags',
    'pendingRatingRideId', 'pendingRatingDriverName', 'tipAmount', 'rideRated', 'tipAdded',
    'showPostRideModal', 'completedRideData', 'terminalRide', 'showReceipt', 'showChat',
  ];
  const selected = new Set<ts.Statement>();
  for (const name of declarations) {
    selected.add(unique(home.body.statements.filter(node => declaredNames(node).includes(name)), name));
  }
  const references = (node: ts.Node, name: string): boolean => {
    if (ts.isIdentifier(node) && node.text === name) return true;
    return ts.forEachChild(node, child => references(child, name) || undefined) === true;
  };
  const effects = home.body.statements.filter((node): node is ts.ExpressionStatement => (
    ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'useEffect'
  ));
  const effectWith = (predicate: (node: ts.ExpressionStatement) => boolean, label: string) => {
    selected.add(unique(effects.filter(predicate), label));
  };
  effectWith(node => references(node, 'activeRidesRef') && references(node, 'selectedRideIdRef')
    && !references(node, 'restoreActiveRides'), 'activeRidesRef/selectedRideIdRef synchronization effect');
  effectWith(node => references(node, 'setSelectedRideId') && references(node, 'activeRides')
    && !references(node, 'restoreActiveRides'), 'active ride selection effect');
  effectWith(node => node.getText(file).includes('riderSelectedRide:')
    && !references(node, 'restoreActiveRides'), 'persisted selection effect');
  effectWith(node => references(node, 'restoreActiveRides'), 'restoreActiveRides AppState owner effect');
  const statements = home.body.statements.filter(node => selected.has(node));
  const exposedNames = statements.flatMap(declaredNames);
  const compiled = ts.transpileModule(`
    function ScopedHome(props) {
      const { user, capture } = props;
      ${statements.map(node => node.getText(file)).join('\n')}
      capture({ ${exposedNames.join(', ')} });
      return null;
    }
    return ScopedHome;
  `, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    reportDiagnostics: true,
  });
  if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }));
  }
  return compiled.outputText;
}

type Renderer = {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (node: React.ReactElement) => { update: (node: React.ReactElement) => void; unmount: () => void };
};
const renderer = createRequire(import.meta.url)('react-test-renderer') as Renderer;
const compiledHome = extractHomeRecoveryScope();
type RawRide = Record<string, any> & { id: string; status: string; rider_id: string };
type LiveRide = RecoveredActiveRide & Record<string, any>;
type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
type HomeState = {
  activeRides: LiveRide[];
  activeRidesRef: React.MutableRefObject<LiveRide[]>;
  selectedRideId: string | null;
  selectedRideIdRef: React.MutableRefObject<string | null>;
  rideRecoveryOwnerRef: React.MutableRefObject<string | null>;
  terminalRideIdsRef: React.MutableRefObject<Set<string>>;
  presentedCompletionRideIdsRef: React.MutableRefObject<Set<string>>;
  rebookPromptedRideIdsRef: React.MutableRefObject<Set<string>>;
  terminalRide: RiderTerminalSummary | null;
  pendingRatingRideId: string | null;
  pendingRatingDriverName: string | null;
  showRatingModal: boolean;
  showTipModal: boolean;
  showPostRideModal: boolean;
  showReceipt: boolean;
  showChat: boolean;
  rideRated: boolean;
  tipAdded: boolean;
  completedRideData: any;
  ratingValue: number;
  ratingComment: string;
  selectedRatingTags: string[];
  tipAmount: number | null;
  setActiveRides: Setter<LiveRide[]>;
  setSelectedRideId: Setter<string | null>;
  setTerminalRide: Setter<RiderTerminalSummary | null>;
  setPendingRatingRideId: Setter<string | null>;
  setPendingRatingDriverName: Setter<string | null>;
  setShowRatingModal: Setter<boolean>;
  setShowTipModal: Setter<boolean>;
  setShowPostRideModal: Setter<boolean>;
  setShowReceipt: Setter<boolean>;
  setShowChat: Setter<boolean>;
  setRideRated: Setter<boolean>;
  setTipAdded: Setter<boolean>;
  setCompletedRideData: Setter<any>;
  setRatingValue: Setter<number>;
  setRatingComment: Setter<string>;
  setSelectedRatingTags: Setter<string[]>;
  setTipAmount: Setter<number | null>;
  presentCompletedRide: (tracked: Pick<LiveRide, 'id'> & Partial<LiveRide>, server: Record<string, unknown>) => void;
  removeActiveRide: (rideId?: string) => void;
  updateActiveRide: (id: string, updater: (ride: LiveRide) => LiveRide) => void;
};
type NativeAppState = 'active' | 'inactive' | 'background';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const active = (id = 'ride-1', extra: Record<string, unknown> = {}): RawRide => ({
  id, rider_id: 'rider-a', status: 'in_progress', category: 'standard',
  pickup: { name: 'Pickup', address: '12 Oxford Street, Accra', lat: 5.6, lng: -0.1 },
  destination: { name: 'Airport', address: 'Kotoka International Airport, Accra', lat: 5.61, lng: -0.11 },
  quoted_fare: 70, payment_method: 'cash', ...extra,
});
const completed = (id = 'ride-1', extra: Record<string, unknown> = {}): RawRide => ({
  ...active(id), status: 'completed', completed_at: new Date().toISOString(),
  final_fare: 82, driver_name: 'Kofi', ...extra,
});
const expiredSearch = (id = 'expired-search', extra: Record<string, unknown> = {}): RawRide => active(id, {
  status: 'searching', created_at: new Date(Date.now() - 10 * 60_000).toISOString(), ...extra,
});
function live(raw: RawRide): LiveRide {
  const recovered = recoverActiveRide(raw);
  if (!recovered) throw new Error(`Invalid live fixture ${raw.id}`);
  return recovered;
}
function setup(options: { uid?: string; list?: RawRide[]; appState?: NativeAppState; storage?: Map<string, string> } = {}) {
  let user: { uid: string } | null = { uid: options.uid ?? 'rider-a' };
  const list = vi.fn().mockResolvedValue(options.list ?? []);
  const storage = options.storage ?? new Map<string, string>();
  const AsyncStorage = {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  };
  const listeners = new Set<(next: NativeAppState) => void>();
  const removals: ReturnType<typeof vi.fn>[] = [];
  const AppState = {
    currentState: options.appState ?? 'active',
    addEventListener: vi.fn((event: string, listener: (next: NativeAppState) => void) => {
      if (event !== 'change') throw new Error(`Unexpected AppState event ${event}`);
      listeners.add(listener);
      const remove = vi.fn(() => { listeners.delete(listener); });
      removals.push(remove);
      return { remove };
    }),
    change(next: NativeAppState) {
      AppState.currentState = next;
      [...listeners].forEach(listener => listener(next));
    },
  };
  // Capture is populated solely by the extracted real hooks/callbacks.
  const state = {} as HomeState;
  const capture = vi.fn((next: HomeState) => Object.assign(state, next));
  const endRiderLiveActivity = vi.fn().mockResolvedValue(undefined);
  const expireStaleRiderSearch = vi.fn().mockResolvedValue(undefined);
  const offerFindAnotherRide = vi.fn(() => false);
  const warn = vi.fn();
  const environment = {
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
    firestoreDB: { list }, COLLECTIONS: { RIDES: 'rides' }, AppState, AsyncStorage,
    recoverActiveRides, buildRiderTerminalSummary, passiveCompletionPresentation,
    latestRecoverableCompletedRide, mergeRecoveredRiderRides, removeRide, rideKeysMatch, updateRide,
    riderTerminalStatus, isExpiredRiderSearch, expireStaleRiderSearch, endRiderLiveActivity,
    offerFindAnotherRide, console: { warn },
  };
  const Component = new Function(...Object.keys(environment), compiledHome)(...Object.values(environment)) as React.ComponentType<any>;
  let view: ReturnType<Renderer['create']> | undefined;
  const element = () => React.createElement(Component, { user, capture });
  const flush = async () => { await renderer.act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  const mount = async () => { await renderer.act(async () => { view = renderer.create(element()); }); await flush(); };
  const mutate = async (action: (current: HomeState) => void) => {
    await renderer.act(async () => { action(state); });
    await flush();
  };
  const change = async (next: NativeAppState) => { await renderer.act(async () => { AppState.change(next); }); await flush(); };
  const changeUser = async (uid: string | null) => {
    user = uid === null ? null : { uid };
    if (!view) throw new Error('Home must be mounted before changing account');
    await renderer.act(async () => { view!.update(element()); });
    await flush();
  };
  const settle = async (pending: ReturnType<typeof deferred<RawRide[]>>, rides: RawRide[]) => {
    await renderer.act(async () => { pending.resolve(rides); });
    await flush();
  };
  const unmount = async () => {
    if (!view) return;
    const mounted = view;
    view = undefined;
    await renderer.act(async () => { mounted.unmount(); });
  };
  return { list, state, capture, storage, AsyncStorage, AppState, listeners, removals,
    endRiderLiveActivity, expireStaleRiderSearch, offerFindAnotherRide, warn,
    mount, flush, mutate, change, changeUser, settle, unmount };
}
type Harness = ReturnType<typeof setup>;
const homes: Harness[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T12:00:00.000Z'));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  for (const h of homes.splice(0)) await h.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
function home(options?: Parameters<typeof setup>[0]) { const h = setup(options); homes.push(h); return h; }
function expectServerQuery(h: Harness, call = 1, uid = 'rider-a') {
  expect(h.list).toHaveBeenNthCalledWith(call, 'rides', { rider_id: uid }, 'created_date', 'desc', undefined, { source: 'server' });
}
function expectPassiveSummary(h: Harness, id: string, finalFare = 82) {
  expect(h.state.activeRides).toEqual([]);
  expect(h.state.selectedRideId).toBeNull();
  expect(h.state.terminalRide).toEqual(expect.objectContaining({
    firestoreId: id, finalFare,
    pickup: '12 Oxford Street, Accra', destination: 'Kotoka International Airport, Accra', driverName: 'Kofi',
  }));
  expect(h.state.pendingRatingRideId).toBe(id);
  expect(h.state.pendingRatingDriverName).toBe('Kofi');
  expect(h.state.showRatingModal).toBe(false);
  expect(h.state.showPostRideModal).toBe(false);
  expect(h.state.showTipModal).toBe(false);
  expect(h.state.showReceipt).toBe(false);
  expect(h.state.showChat).toBe(false);
  expect(h.state.completedRideData).toBeNull();
}
function expectNoOldAccountPresentation(h: Harness) {
  expect(h.state.activeRides).toEqual([]);
  expect(h.state.activeRidesRef.current).toEqual([]);
  expect(h.state.selectedRideId).toBeNull();
  expect(h.state.selectedRideIdRef.current).toBeNull();
  expect(h.state.terminalRide).toBeNull();
  expect(h.state.pendingRatingRideId).toBeNull();
  expect(h.state.pendingRatingDriverName).toBeNull();
  expect(h.state.completedRideData).toBeNull();
  expect(h.state.showRatingModal).toBe(false);
  expect(h.state.showPostRideModal).toBe(false);
  expect(h.state.showTipModal).toBe(false);
  expect(h.state.showReceipt).toBe(false);
  expect(h.state.showChat).toBe(false);
}

describe('actual Rider Home completion and foreground recovery', () => {
  it('immediately queries the full server list on foreground after Driver completion in background, with final fare/addresses and no native modal', async () => {
    const h = home({ list: [active('trip-complete')] });
    await h.mount();
    expect(h.state.activeRides[0].id).toBe('trip-complete');
    await h.change('background');
    await h.mutate(state => {
      state.setShowChat(true);
      state.setShowReceipt(true);
      state.setShowTipModal(true);
    });
    h.list.mockResolvedValue([completed('trip-complete', { final_fare: 128.75, quoted_fare: 70 })]);
    expect(h.list).toHaveBeenCalledTimes(1);
    const timeBeforeResume = Date.now();
    await h.change('active');
    expect(h.list).toHaveBeenCalledTimes(2);
    expectServerQuery(h, 1);
    expectServerQuery(h, 2);
    expect(Date.now()).toBe(timeBeforeResume);
    expect(vi.getTimerCount()).toBe(0); // No four-second fallback tick was advanced.
    // Existing platform policy rounds .75 up; the server final still wins over the 70 quote.
    expectPassiveSummary(h, 'trip-complete', 129);
    expect(h.state.terminalRide?.finalFare).not.toBe(70);
    expect(h.state.terminalRide).not.toHaveProperty('driverLocation');
    expect(h.endRiderLiveActivity).toHaveBeenCalledWith('trip-complete', true);
    expect(h.state.terminalRideIdsRef.current.has('trip-complete')).toBe(true);
  });

  it('cold-starts from only completed documents into the latest recent unrated primitive summary', async () => {
    const h = home({ list: [
      completed('older-recent', { completed_at: new Date(Date.now() - 60_000).toISOString() }),
      completed('latest', { rider_rating: null }),
      completed('historic', { completed_at: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() }),
    ] });
    await h.mount();
    expectServerQuery(h);
    expectPassiveSummary(h, 'latest');
    expect(h.state.terminalRide?.id).toBe('latest');
    expect(Object.values(h.state.terminalRide!)).toEqual(expect.arrayContaining(['latest', 82]));
    expect(Object.values(h.state.terminalRide!).every(value => ['string', 'number'].includes(typeof value))).toBe(true);
    expect(h.state.presentedCompletionRideIdsRef.current).toEqual(new Set(['latest']));
  });

  it.each(['ongoing', 'completed'] as const)('retries an initial network failure on foreground with no active IDs and recovers %s', async kind => {
    const h = home({ list: [kind === 'ongoing' ? active('retry') : completed('retry')] });
    h.list.mockRejectedValueOnce(new Error('offline'));
    await h.mount();
    expect(h.state.activeRides).toEqual([]);
    expect(h.state.terminalRide).toBeNull();
    expect(h.warn).toHaveBeenCalledWith('[Rider] Active ride restore failed:', expect.any(Error));
    await h.change('background');
    await h.change('active');
    expect(h.list).toHaveBeenCalledTimes(2);
    expectServerQuery(h, 2);
    if (kind === 'completed') expectPassiveSummary(h, 'retry');
    else {
      expect(h.state.activeRides).toEqual([expect.objectContaining({ id: 'retry', firestoreId: 'retry', status: 'in_progress' })]);
      expect(h.state.selectedRideId).toBe('retry');
      expect(h.state.terminalRide).toBeNull();
    }
  });

  it('keeps the chosen ongoing ride and a coherent GPS/road sample received after a foreground read began', async () => {
    const olderAt = new Date(Date.now() - 30_000).toISOString();
    const newerAt = new Date(Date.now() - 1_000).toISOString();
    const rawB = active('trip-b', { driver_location: { lat: 5.7, lng: -0.2, heading: 20, recorded_at: olderAt } });
    const h = home({ list: [active('trip-a'), rawB] });
    await h.mount();
    await h.mutate(state => state.setSelectedRideId('trip-b'));
    await h.change('background');
    const pending = deferred<RawRide[]>();
    h.list.mockReturnValueOnce(pending.promise);
    await h.change('active');
    await h.mutate(state => state.updateActiveRide('trip-b', ride => ({
      ...ride, driverLocation: { lat: 5.72, lng: -0.22 }, driverBearing: 95, driverLocationUpdatedAt: newerAt,
      driverRouteUpdatedAt: newerAt, driverRoutePoints: [[5.72, -0.22], [5.61, -0.11]],
      routeDistanceKm: 4.5, routeDurationMinutes: 8, routePhase: 'destination',
    })));
    await h.settle(pending, [active('trip-a'), rawB]);
    expect(h.list).toHaveBeenCalledTimes(2); // State/GPS changes must not restart recovery.
    expect(h.state.selectedRideId).toBe('trip-b');
    expect(h.state.selectedRideIdRef.current).toBe('trip-b');
    expect(h.state.activeRides).toHaveLength(2);
    expect(h.state.activeRides.find(ride => ride.id === 'trip-b')).toEqual(expect.objectContaining({
      status: 'in_progress', driverLocation: { lat: 5.72, lng: -0.22 }, driverBearing: 95,
      driverLocationUpdatedAt: newerAt, driverRouteUpdatedAt: newerAt,
      driverRoutePoints: [[5.72, -0.22], [5.61, -0.11]], routeDistanceKm: 4.5, routeDurationMinutes: 8,
    }));
    expect(h.state.activeRidesRef.current).toBe(h.state.activeRides);
    expect(h.state.terminalRide).toBeNull();
  });

  it('persists only selection identity and reselects the saved server-valid ride on a true cold relaunch', async () => {
    const storage = new Map<string, string>();
    const first = home({ list: [active('trip-a'), active('trip-b')], storage });
    await first.mount();
    await first.mutate(state => state.setSelectedRideId('trip-b'));
    expect(storage.get('riderSelectedRide:rider-a')).toBe('trip-b');
    expect(first.AsyncStorage.setItem).toHaveBeenLastCalledWith('riderSelectedRide:rider-a', 'trip-b');
    await first.unmount();
    const second = home({ list: [active('trip-a'), active('trip-b')], storage });
    await second.mount();
    expect(second.AsyncStorage.getItem).toHaveBeenCalledWith('riderSelectedRide:rider-a');
    expectServerQuery(second);
    expect(second.state.selectedRideId).toBe('trip-b');
    expect(second.state.activeRides.find(ride => ride.id === 'trip-b')?.fare).toBe(70);
    expect(second.state.terminalRide).toBeNull();
  });

  it('does not select an ID saved for a missing server ride', async () => {
    const storage = new Map([['riderSelectedRide:rider-a', 'no-longer-valid']]);
    const h = home({ list: [active('server-valid')], storage });
    await h.mount();
    expect(h.state.selectedRideId).toBe('server-valid');
    expect(storage.get('riderSelectedRide:rider-a')).toBe('server-valid');
    expect(h.state.activeRides).toHaveLength(1);
  });

  it.each(['inactive', 'background'] as const)('%s invalidates a pending read before any old summary, active state or stale-search side effect', async awayState => {
    const pending = deferred<RawRide[]>();
    const h = home({ list: [active('new-foreground')] });
    h.list.mockReturnValueOnce(pending.promise);
    await h.mount();
    await h.change(awayState);
    await h.settle(pending, [active('old-active'), completed('old-complete'), expiredSearch()]);
    expectNoOldAccountPresentation(h);
    expect(h.expireStaleRiderSearch).not.toHaveBeenCalled();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
    expect(h.state.terminalRideIdsRef.current.size).toBe(0);
    await h.change('active');
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['new-foreground']);
  });

  it('accepts the newest foreground generation and ignores an older read resolving afterward', async () => {
    const oldRead = deferred<RawRide[]>();
    const newRead = deferred<RawRide[]>();
    const h = home();
    h.list.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    await h.mount();
    await h.change('inactive');
    await h.change('active');
    await h.settle(newRead, [active('newest')]);
    await h.settle(oldRead, [completed('old-complete'), expiredSearch()]);
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['newest']);
    expect(h.state.selectedRideId).toBe('newest');
    expect(h.state.terminalRide).toBeNull();
    expect(h.expireStaleRiderSearch).not.toHaveBeenCalled();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
  });

  it('uses the actual completion presenter to tombstone both local/server IDs so a stale ongoing read cannot resurrect the ride', async () => {
    const raw = active('server-trip');
    const h = home({ list: [raw] });
    await h.mount();
    await h.mutate(state => state.updateActiveRide('server-trip', ride => ({ ...ride, id: 'local-trip' })));
    expect(h.state.selectedRideId).toBe('local-trip');
    await h.change('background');
    const pending = deferred<RawRide[]>();
    h.list.mockReturnValueOnce(pending.promise);
    await h.change('active');
    const tracked = h.state.activeRides[0];
    await h.mutate(state => state.presentCompletedRide(tracked, completed('server-trip', { final_fare: 96.5 })));
    // Existing platform policy rounds exactly .50 down, not to the prior 70 quote.
    expectPassiveSummary(h, 'server-trip', 96);
    expect(h.state.terminalRide?.id).toBe('local-trip');
    expect(h.state.terminalRideIdsRef.current).toEqual(new Set(['local-trip', 'server-trip']));
    expect(h.endRiderLiveActivity).toHaveBeenCalledWith('local-trip', true);
    expect(h.endRiderLiveActivity).toHaveBeenCalledWith('server-trip', true);
    const terminal = h.state.terminalRide;
    await h.settle(pending, [raw]);
    expect(h.state.activeRides).toEqual([]);
    expect(h.state.activeRidesRef.current).toEqual([]);
    expect(h.state.selectedRideId).toBeNull();
    expect(h.state.terminalRide).toBe(terminal);
    expect(h.endRiderLiveActivity).toHaveBeenCalledTimes(2);
  });

  it.each([null, 'rider-b'])('ignores an unresolved previous-owner read after changing account to %s, including completion/expiry side effects', async nextUid => {
    const h = home({ list: [active('old-live')] });
    await h.mount();
    await h.mutate(state => {
      state.presentCompletedRide({ id: 'previous-summary' }, completed('previous-summary'));
      state.setCompletedRideData({ id: 'old-preview' });
      state.setShowRatingModal(true);
      state.setShowPostRideModal(true);
      state.setShowTipModal(true);
      state.setShowReceipt(true);
      state.setShowChat(true);
      state.rebookPromptedRideIdsRef.current.add('old-offer');
    });
    expect(h.state.activeRides[0].id).toBe('old-live');
    await h.change('background');
    const pending = deferred<RawRide[]>();
    h.list.mockReturnValueOnce(pending.promise).mockResolvedValue([]);
    await h.change('active');
    h.endRiderLiveActivity.mockClear();
    h.expireStaleRiderSearch.mockClear();
    h.offerFindAnotherRide.mockClear();
    h.AsyncStorage.setItem.mockClear();
    await h.changeUser(nextUid);
    expectNoOldAccountPresentation(h);
    expect(h.state.rideRecoveryOwnerRef.current).toBe(nextUid);
    expect(h.state.terminalRideIdsRef.current.size).toBe(0);
    expect(h.state.presentedCompletionRideIdsRef.current.size).toBe(0);
    expect(h.state.rebookPromptedRideIdsRef.current.size).toBe(0);
    await h.settle(pending, [completed('old-live'), active('old-extra'), expiredSearch()]);
    expectNoOldAccountPresentation(h);
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
    expect(h.expireStaleRiderSearch).not.toHaveBeenCalled();
    expect(h.offerFindAnotherRide).not.toHaveBeenCalled();
    expect(h.AsyncStorage.setItem).not.toHaveBeenCalled();
    if (nextUid) expectServerQuery(h, 3, nextUid);
    expect(h.listeners.size).toBe(nextUid ? 1 : 0);
  });

  it('validates ownership again before recovery, completion presentation and stale-search API calls', async () => {
    const h = home({ list: [
      active('foreign-active', { rider_id: 'rider-b' }),
      completed('foreign-complete', { rider_id: 'rider-b' }),
      expiredSearch('foreign-search', { rider_id: 'rider-b' }),
      completed('missing-owner', { rider_id: undefined }),
    ] });
    await h.mount();
    expectNoOldAccountPresentation(h);
    expect(h.expireStaleRiderSearch).not.toHaveBeenCalled();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
    expect(h.state.terminalRideIdsRef.current.size).toBe(0);
  });

  it('does not reset explicit rating/post-ride/modal flags or submitted rating state on duplicate actual completion observations', async () => {
    const raw = completed('same-trip');
    const h = home({ list: [raw] });
    await h.mount();
    expectPassiveSummary(h, 'same-trip');
    const terminal = h.state.terminalRide;
    const preview = { id: 'same-trip', ratingSubmitted: true };
    await h.mutate(state => {
      state.setRideRated(true);
      state.setTipAdded(true);
      state.setRatingValue(3);
      state.setRatingComment('Already submitted');
      state.setSelectedRatingTags(['Friendly']);
      state.setTipAmount(10);
      state.setPendingRatingRideId(null);
      state.setPendingRatingDriverName(null);
      state.setShowRatingModal(true);
      state.setShowPostRideModal(true);
      state.setShowTipModal(true);
      state.setShowReceipt(true);
      state.setShowChat(true);
      state.setCompletedRideData(preview);
    });
    await h.mutate(state => state.presentCompletedRide({ id: 'same-trip' }, raw));
    await h.change('background');
    await h.change('active'); // The recovery effect calls the same actual presenter again.
    expect(h.state.terminalRide).toBe(terminal);
    expect(h.state.completedRideData).toBe(preview);
    expect(h.state.pendingRatingRideId).toBeNull();
    expect(h.state.pendingRatingDriverName).toBeNull();
    expect(h.state).toEqual(expect.objectContaining({
      showRatingModal: true, showPostRideModal: true, showTipModal: true, showReceipt: true, showChat: true,
      rideRated: true, tipAdded: true, ratingValue: 3, ratingComment: 'Already submitted',
      selectedRatingTags: ['Friendly'], tipAmount: 10,
    }));
    expect(h.state.presentedCompletionRideIdsRef.current).toEqual(new Set(['same-trip']));
    expect(h.endRiderLiveActivity).toHaveBeenCalledTimes(1);
  });

  it('does not reopen an explicitly dismissed summary after duplicate completion on foreground', async () => {
    const h = home({ list: [completed('dismissed')] });
    await h.mount();
    await h.mutate(state => state.setTerminalRide(null));
    await h.change('background');
    await h.change('active');
    expect(h.state.terminalRide).toBeNull();
    expect(h.state.activeRides).toEqual([]);
    expect(h.endRiderLiveActivity).toHaveBeenCalledTimes(1);
  });

  it('removes the AppState subscription on unmount and ignores its pending read without presentation side effects', async () => {
    const pending = deferred<RawRide[]>();
    const h = home();
    h.list.mockReturnValueOnce(pending.promise);
    await h.mount();
    expect(h.AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(h.listeners.size).toBe(1);
    await h.unmount();
    expect(h.listeners.size).toBe(0);
    expect(h.removals[0]).toHaveBeenCalledTimes(1);
    const renders = h.capture.mock.calls.length;
    await h.change('background');
    await h.change('active');
    await h.settle(pending, [active('late-active'), completed('late-complete'), expiredSearch()]);
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledTimes(renders);
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
    expect(h.expireStaleRiderSearch).not.toHaveBeenCalled();
    expect(h.AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  const ineligibleHistory = [
    ['incomplete timestamp', { completed_at: undefined }],
    ['already rated', { rider_rating: 5 }],
    ['older historical completion', { completed_at: '2026-11-22T12:00:00.000Z' }],
  ] as const;
  it.each(ineligibleHistory)('%s does not cover another ongoing ride', async (_label, extra) => {
    const h = home({ list: [completed('history', extra), active('ongoing')] });
    await h.mount();
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['ongoing']);
    expect(h.state.selectedRideId).toBe('ongoing');
    expect(h.state.terminalRide).toBeNull();
    expect(h.state.pendingRatingRideId).toBeNull();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
  });
  it.each(ineligibleHistory)('%s alone is not fabricated into a recoverable cold-start completion', async (_label, extra) => {
    const h = home({ list: [completed('history', extra)] });
    await h.mount();
    expectNoOldAccountPresentation(h);
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
  });

  it('even a recent unrated historical completion does not override another ongoing ride', async () => {
    const h = home({ list: [completed('recent-history'), active('ongoing')] });
    await h.mount();
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['ongoing']);
    expect(h.state.terminalRide).toBeNull();
    expect(h.state.pendingRatingRideId).toBeNull();
  });

  it('a missing list document is not a cancellation and preserves the current active ride and selection', async () => {
    const h = home({ list: [active('still-live')] });
    await h.mount();
    const tracked = h.state.activeRides[0];
    await h.change('background');
    h.list.mockResolvedValue([]);
    await h.change('active');
    expect(h.state.activeRides).toEqual([tracked]);
    expect(h.state.activeRides[0]).toBe(tracked);
    expect(h.state.selectedRideId).toBe('still-live');
    expect(h.state.terminalRide).toBeNull();
    expect(h.state.terminalRideIdsRef.current.size).toBe(0);
    expect(h.offerFindAnotherRide).not.toHaveBeenCalled();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
  });

  it('a failed foreground read is not a cancellation and keeps the already selected live ride', async () => {
    const h = home({ list: [active('still-live')] });
    await h.mount();
    await h.change('background');
    h.list.mockRejectedValueOnce(new Error('offline again'));
    await h.change('active');
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['still-live']);
    expect(h.state.selectedRideId).toBe('still-live');
    expect(h.state.terminalRide).toBeNull();
    expect(h.endRiderLiveActivity).not.toHaveBeenCalled();
  });

  it('merges the same Firestore ride without duplicating it or replacing its existing local ID/selection or regressing status', async () => {
    const raw = active('firestore-doc');
    const h = home({ list: [raw] });
    await h.mount();
    await h.mutate(state => state.updateActiveRide('firestore-doc', ride => ({ ...ride, id: 'local-ui-id' })));
    expect(h.state.selectedRideId).toBe('local-ui-id');
    await h.change('background');
    h.list.mockResolvedValue([active('firestore-doc', { status: 'driver_arriving', quoted_fare: 75 })]);
    await h.change('active');
    expect(h.state.activeRides).toHaveLength(1);
    expect(h.state.activeRides[0]).toEqual(expect.objectContaining({
      id: 'local-ui-id', firestoreId: 'firestore-doc', status: 'in_progress', fare: 75,
    }));
    expect(h.state.selectedRideId).toBe('local-ui-id');
    expect(h.state.selectedRideIdRef.current).toBe('local-ui-id');
  });

  it('does not query while mounted in background; foreground restores even when no ride was initially tracked', async () => {
    const h = home({ appState: 'background', list: [active('foreground-only')] });
    await h.mount();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.state.activeRides).toEqual([]);
    await h.change('active');
    expectServerQuery(h);
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['foreground-only']);
    await h.change('active'); // Duplicate active notification is not another foreground return.
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it('uses the real remove callback for explicit cancellation while leaving another ongoing ride alone', async () => {
    const h = home({ appState: 'background', list: [
      active('cancelled-server', { status: 'cancelled', cancelled_by: 'driver' }), active('other-live'),
    ] });
    await h.mount();
    await h.mutate(state => {
      state.setActiveRides([{ ...live(active('cancelled-server')), id: 'cancelled-local' }, live(active('other-live'))]);
      state.setSelectedRideId('cancelled-local');
    });
    await h.change('active');
    expect(h.state.activeRides.map(ride => ride.id)).toEqual(['other-live']);
    expect(h.state.selectedRideId).toBe('other-live');
    expect(h.state.terminalRideIdsRef.current).toEqual(new Set(['cancelled-server', 'cancelled-local']));
    expect(h.offerFindAnotherRide).toHaveBeenCalledWith(expect.objectContaining({ id: 'cancelled-local' }), 'driver');
    expect(h.endRiderLiveActivity).toHaveBeenCalledWith('cancelled-local', false);
    expect(h.state.terminalRide).toBeNull();
  });
});
