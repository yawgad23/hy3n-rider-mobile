import { describe, expect, it } from 'vitest';
import {
  formatLiveDistance,
  riderDriverMarkerLabel,
} from '../lib/rider-live-tracking-presentation';

describe('Rider live tracking presentation', () => {
  it('uses metres for sub-kilometre distances', () => {
    expect(formatLiveDistance(0.68)).toBe('680 m');
    expect(formatLiveDistance(0.09)).toBe('< 100 m');
    expect(formatLiveDistance(1.24)).toBe('1.2 km');
  });

  it('prefers close pickup distance over a rounded one-minute ETA', () => {
    expect(riderDriverMarkerLabel({ tripStatus: 'driver_arriving', distanceKm: 0.68, etaMinutes: 1 })).toBe('680 m away');
    expect(riderDriverMarkerLabel({ tripStatus: 'driver_arriving', distanceKm: 1.24, etaMinutes: 2 })).toBe('2 min away · 1.2 km');
  });

  it('never renders pickup wording once a trip has started', () => {
    expect(riderDriverMarkerLabel({ tripStatus: 'in_progress', distanceKm: 0.08, etaMinutes: 1 })).toBe('< 100 m to destination');
    expect(riderDriverMarkerLabel({ tripStatus: 'in_progress', distanceKm: 2.4, etaMinutes: 4 })).toBe('2.4 km to destination');
  });
});
