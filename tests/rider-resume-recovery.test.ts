import { describe, expect, it } from 'vitest';
import { latestRecoverableCompletedRide, mergeRecoveredRiderRides, riderCompletionTimestamp } from '@/lib/rider-resume-recovery';
import { buildRiderTerminalSummary } from '@/lib/rider-terminal-summary';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const rawCompletion = (id: string, extra: Record<string, unknown> = {}) => ({
  id, rider_id: 'rider-a', status: 'completed', completed_at: new Date(NOW - 1_000).toISOString(), rider_rating: null, ...extra,
});
const active = (extra: Record<string, any> = {}): Record<string, any> & { id: string; firestoreId: string; status: string } => ({ id: 'local-a', firestoreId: 'server-a', status: 'in_progress', ...extra });

describe('Rider completion selection on resume', () => {
  it('selects by completion time, not creation order', () => {
    const newest = rawCompletion('newest');
    const older = rawCompletion('older', { completed_at: new Date(NOW - 3_000).toISOString(), created_date: new Date(NOW).toISOString() });
    expect(latestRecoverableCompletedRide([older, newest], 'rider-a', NOW)).toBe(newest);
  });
  it.each([
    { rider_id: 'rider-b' }, { status: 'cancelled' }, { status: 'in_progress' },
    { rider_rating: 5 }, { id: '' }, { id: null },
    { completed_at: new Date(NOW - 25 * 3600_000).toISOString() },
    { completed_at: 'invalid' }, { completed_at: new Date(NOW + 3600_000).toISOString() },
  ])('does not restore an ineligible completion %j', (extra) => {
    expect(latestRecoverableCompletedRide([rawCompletion('bad', extra)], 'rider-a', NOW)).toBeNull();
  });
  it('handles actual Firestore Timestamp and serialized seconds shapes', () => {
    expect(riderCompletionTimestamp({ toMillis: () => NOW })).toBe(NOW);
    expect(riderCompletionTimestamp({ seconds: NOW / 1000, nanoseconds: 2_000_000 })).toBe(NOW + 2);
    expect(riderCompletionTimestamp({ _seconds: NOW / 1000, _nanoseconds: 2_000_000 })).toBe(NOW + 2);
    expect(riderCompletionTimestamp(new Date(NOW))).toBe(NOW);
    expect(riderCompletionTimestamp(NOW)).toBe(NOW);
    expect(riderCompletionTimestamp({ toMillis: () => { throw new Error('bad'); } })).toBeNull();
    expect(riderCompletionTimestamp({})).toBeNull();
  });
  it('accepts the existing updated_date fallback and applies deterministic tie ordering', () => {
    expect(latestRecoverableCompletedRide([
      rawCompletion('b', { completed_at: null, updated_date: new Date(NOW - 1000).toISOString() }),
      rawCompletion('a'),
    ], 'rider-a', NOW)?.id).toBe('a');
  });
  it('builds a primitive summary from a completed-only document without spoofing an active trip', () => {
    const summary = buildRiderTerminalSummary({ id: 'server-a' }, {
      ...rawCompletion('server-a'), quoted_fare: 70, final_fare: 82.35, waiting_fee: 4.5,
      pickup: { name: 'Market', address: 'Market Road', lat: 5.6, lng: -0.1 },
      destination: { name: 'Airport', address: 'Airport Road', lat: 5.7, lng: -0.2 },
      driver_name: 'Kofi', driver_phone: '0241234567', actual_distance_km: 12, actual_duration_minutes: 24,
    });
    expect(summary).toMatchObject({ id: 'server-a', finalFare: 82, waitingFee: 4.5, pickup: 'Market Road', destination: 'Airport Road', driverName: 'Kofi', driverPhone: '0241234567', distanceKm: 12, durationMinutes: 24 });
    expect(Object.values(summary).every((value) => ['string', 'number'].includes(typeof value))).toBe(true);
  });
});

describe('ordered Rider active-trip merge on resume', () => {
  it('preserves local ride identity and the newer live GPS and road line', () => {
    const current = active({ driverLocation: { lat: 5.7, lng: -0.2 }, driverBearing: 90, driverLocationUpdatedAt: '2026-11-24T12:00:10Z', driverRouteUpdatedAt: '2026-11-24T12:00:10Z', driverRoutePoints: [[5.7, -0.2]], routePhase: 'destination' });
    const server = active({ id: 'server-a', driverLocation: { lat: 5.6, lng: -0.1 }, driverLocationUpdatedAt: '2026-11-24T12:00:05Z', driverRouteUpdatedAt: '2026-11-24T12:00:05Z', driverRoutePoints: [[5.6, -0.1]], routePhase: 'destination' });
    expect(mergeRecoveredRiderRides([current], [server], new Set())).toEqual([expect.objectContaining({ id: 'local-a', driverLocation: current.driverLocation, driverBearing: 90, driverRoutePoints: current.driverRoutePoints })]);
  });
  it('does not infer cancellation from absent records or erase another booking', () => {
    const current = active();
    expect(mergeRecoveredRiderRides([current], [], new Set())).toEqual([current]);
    expect(mergeRecoveredRiderRides([current], [active({ id: 'b', firestoreId: 'b' })], new Set()).map((ride) => ride.id)).toEqual(['local-a', 'b']);
  });
  it('uses both local and server terminal identities to prevent stale resurrection', () => {
    expect(mergeRecoveredRiderRides([active()], [active({ id: 'server-a' })], new Set(['server-a']))).toEqual([]);
    expect(mergeRecoveredRiderRides([active()], [], new Set(['local-a']))).toEqual([]);
  });
  it('does not regress an ongoing trip or replace its destination line with an older pickup leg', () => {
    const current = active({ driverRoutePoints: [[5.7, -0.2]], driverRouteUpdatedAt: '2026-11-24T12:00:05Z', routePhase: 'destination', routeTarget: { kind: 'destination' } });
    const older = active({ id: 'server-a', status: 'matched', driverRoutePoints: [[5.6, -0.1]], driverRouteUpdatedAt: '2026-11-24T12:00:10Z', routePhase: 'pickup' });
    expect(mergeRecoveredRiderRides([current], [older], new Set())[0]).toMatchObject({ id: 'local-a', status: 'in_progress', routePhase: 'destination', driverRoutePoints: current.driverRoutePoints, routeTarget: current.routeTarget });
  });
  it('retains the legitimate server-owned assignment-release redispatch', () => {
    const server = active({ id: 'server-a', status: 'searching', assignmentReleaseActor: 'driver', reassignmentCount: 1 });
    expect(mergeRecoveredRiderRides([active({ status: 'matched' })], [server], new Set())[0].status).toBe('searching');
  });
});
