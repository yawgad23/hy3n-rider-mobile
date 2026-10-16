import { describe, expect, it } from 'vitest';
import { nextRiderDriverLocation } from '../lib/rider-driver-location';

describe('Rider Driver presence ordering', () => {
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
});
