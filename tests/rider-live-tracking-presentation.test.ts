import { describe, expect, it } from 'vitest';
import {
  formatLiveDistance,
  formatMapDistance,
  riderDriverMarkerLabel,
  riderPickupStatusLabel,
} from '../lib/rider-live-tracking-presentation';

describe('Rider live tracking presentation', () => {
  it('uses metres for sub-kilometre distances', () => {
    expect(formatLiveDistance(0.68)).toBe('680 m');
    expect(formatLiveDistance(0.09)).toBe('< 100 m');
    expect(formatLiveDistance(1.24)).toBe('1.2 km');
    expect(formatMapDistance(0.21)).toBe('210 metres');
    expect(formatMapDistance(0.08)).toBe('< 100 metres');
  });

  it('prefers close pickup distance over a rounded one-minute ETA', () => {
    expect(riderDriverMarkerLabel({ tripStatus: 'driver_arriving', distanceKm: 0.21, etaMinutes: 1 })).toBe('210 metres');
    expect(riderDriverMarkerLabel({ tripStatus: 'driver_arriving', distanceKm: 1.24, etaMinutes: 2 })).toBe('2 min · 1.2 km');
  });

  it('never renders pickup wording once a trip has started', () => {
    expect(riderDriverMarkerLabel({ tripStatus: 'in_progress', distanceKm: 0.08, etaMinutes: 1 })).toBe('< 100 metres to destination');
    expect(riderDriverMarkerLabel({ tripStatus: 'in_progress', distanceKm: 2.4, etaMinutes: 4 })).toBe('2.4 km to destination');
  });

  it('keeps pickup arrival time distinct from the map distance callout', () => {
    expect(riderPickupStatusLabel(1, 0.21)).toBe('Pickup in 1 min');
    expect(riderPickupStatusLabel(null, 0.21)).toBe('Driver is 210 m away');
    expect(riderPickupStatusLabel(null, null)).toBe('Driver is on the way');
  });
});
