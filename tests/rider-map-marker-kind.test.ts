import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { riderMapMarkerKind } from '../lib/rider-map-marker-kind';

const nativeMap = readFileSync(path.join(process.cwd(), 'components/NativeGoogleMap.tsx'), 'utf8');
const fallbackMap = readFileSync(path.join(process.cwd(), 'components/LeafletMap.tsx'), 'utf8');

describe('Rider vehicle marker kind mapping', () => {
  it('keeps car delivery on the Standard car visual and maps all five categories distinctly', () => {
    expect(riderMapMarkerKind('car_delivery')).toBe('standard');
    expect(riderMapMarkerKind('car-delivery')).toBe('standard');
    expect(riderMapMarkerKind('standard')).toBe('standard');
    expect(riderMapMarkerKind('comfort')).toBe('comfort');
    expect(riderMapMarkerKind('kantanka')).toBe('kantanka');
    expect(riderMapMarkerKind('express_delivery')).toBe('delivery');
    expect(riderMapMarkerKind('delivery')).toBe('delivery');
    expect(riderMapMarkerKind('okada')).toBe('okada');
  });

  it('uses the shared resolver in both Rider map renderers', () => {
    expect(nativeMap).toContain('RIDER_VEHICLE_ARTWORK[riderMapMarkerKind(serviceType)]');
    expect(fallbackMap).toContain('return riderMapMarkerKind(value);');
  });
});
