import { describe, expect, it } from 'vitest';
import { nextRiderDriverLocation } from '../lib/rider-driver-location';
import { measureRiderTrackingTelemetry } from '../lib/rider-tracking-telemetry';

describe('Rider Driver presence ordering', () => {
  it('measures tracking segments without exposing identity or coordinates', () => {
    const sample = measureRiderTrackingTelemetry({
      sample_id: 'sample-12345678',
      client_sent_at_ms: 1_700_000_000_000,
      server_received_at_ms: 1_700_000_000_120,
    }, 1_700_000_000_260);

    expect(sample).toMatchObject({
      sampleId: 'sample-12345678',
      driverToBackendMs: 120,
      backendToRiderMs: 140,
      endToEndMs: 260,
    });
    expect(sample).not.toHaveProperty('latitude');
    expect(sample).not.toHaveProperty('longitude');
  });

  it('ignores missing, skewed, or unreasonable telemetry timestamps', () => {
    expect(measureRiderTrackingTelemetry(null, 1_700_000_000_260)).toBeNull();
    expect(measureRiderTrackingTelemetry({
      sample_id: 'sample-12345678',
      client_sent_at_ms: 1_700_000_000_500,
      server_received_at_ms: 1_700_000_000_120,
    }, 1_700_000_000_260)).toBeNull();
    expect(measureRiderTrackingTelemetry({
      sample_id: 'sample-12345678',
      client_sent_at_ms: 1_700_000_000_000,
      server_received_at_ms: 1_700_000_000_120,
    }, 1_700_700_000_260)).toBeNull();
  });

  it('accepts a complete newer Driver location', () => {
    expect(nextRiderDriverLocation({
      latitude: 5.6037,
      longitude: -0.187,
      heading: 90,
      recorded_at: '2026-10-02T16:00:03.000Z',
    }, '2026-10-02T16:00:00.000Z')).toEqual({
      lat: 5.6037,
      lng: -0.187,
      heading: 90,
      updatedAt: '2026-10-02T16:00:03.000Z',
    });
  });

  it('normalizes Firestore Timestamp JSON and preserves ordering across updates', () => {
    const previous = '2026-10-02T16:00:03.000Z';
    expect(nextRiderDriverLocation({
      latitude: 5.604,
      longitude: -0.186,
      recorded_at: { seconds: 1790956804, nanoseconds: 250000000 },
    }, previous)).toMatchObject({
      lat: 5.604,
      lng: -0.186,
      updatedAt: new Date(1790956804250).toISOString(),
    });
  });

  it('normalizes Firestore Timestamp instances that expose toDate()', () => {
    const date = new Date('2026-10-02T16:00:04.000Z');
    expect(nextRiderDriverLocation({
      latitude: 5.604,
      longitude: -0.186,
      updated_at: { toDate: () => date },
    }, '2026-10-02T16:00:03.000Z')?.updatedAt).toBe(date.toISOString());
  });

  it('normalizes JavaScript Date, epoch, and ISO-string timestamps consistently', () => {
    const date = new Date('2026-10-02T16:00:04.000Z');
    expect(nextRiderDriverLocation({ latitude: 5.604, longitude: -0.186, recorded_at: date }, '2026-10-02T16:00:03.000Z')?.updatedAt).toBe(date.toISOString());
    expect(nextRiderDriverLocation({ latitude: 5.604, longitude: -0.186, recorded_at: 1790956805000 }, date.toISOString())?.updatedAt).toBe(new Date(1790956805000).toISOString());
    expect(nextRiderDriverLocation({ latitude: 5.604, longitude: -0.186, recorded_at: '2026-10-02T16:00:06.000Z' }, date.toISOString())?.updatedAt).toBe('2026-10-02T16:00:06.000Z');
  });

  it('rejects an older or undated presence replay after a timestamped update', () => {
    expect(nextRiderDriverLocation({ latitude: 5.6, longitude: -0.18, recorded_at: '2026-10-02T16:00:00.000Z' }, '2026-10-02T16:00:03.000Z')).toBeNull();
    expect(nextRiderDriverLocation({ latitude: 5.6, longitude: -0.18 }, '2026-10-02T16:00:03.000Z')).toBeNull();
  });

  it('keeps a fresh live-presence car position when a ride snapshot carries an older initial point', () => {
    const latest = { lat: 5.612, lng: -0.182 };
    expect(nextRiderDriverLocation({
      latitude: 5.6037,
      longitude: -0.187,
      recorded_at: '2026-10-02T16:00:01.000Z',
    }, '2026-10-02T16:00:03.000Z', latest)).toBeNull();
    expect(nextRiderDriverLocation({
      latitude: 5.6037,
      longitude: -0.187,
    }, '2026-10-02T16:00:03.000Z', latest)).toBeNull();
  });

  it('permits a stationary heartbeat but rejects two different positions with one timestamp', () => {
    const previous = { lat: 5.6037, lng: -0.187 };
    expect(nextRiderDriverLocation({
      latitude: 5.6037,
      longitude: -0.187,
      recorded_at: '2026-10-02T16:00:03.000Z',
    }, '2026-10-02T16:00:03.000Z', previous)).toMatchObject(previous);
    expect(nextRiderDriverLocation({
      latitude: 5.6047,
      longitude: -0.187,
      recorded_at: '2026-10-02T16:00:03.000Z',
    }, '2026-10-02T16:00:03.000Z', previous)).toBeNull();
  });

  it('rejects coordinates outside valid latitude and longitude bounds', () => {
    expect(nextRiderDriverLocation({ latitude: 91, longitude: -0.18, recorded_at: '2026-10-02T16:00:03.000Z' })).toBeNull();
    expect(nextRiderDriverLocation({ latitude: 5.6, longitude: 181, recorded_at: '2026-10-02T16:00:03.000Z' })).toBeNull();
  });
});
