import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { riderMapMarkerKind } from '../lib/rider-map-marker-kind';

const nativeMap = readFileSync(path.join(process.cwd(), 'components/NativeGoogleMap.tsx'), 'utf8');
const fallbackMap = readFileSync(path.join(process.cwd(), 'components/LeafletMap.tsx'), 'utf8');

describe('Rider vehicle marker kind mapping', () => {
  it('keeps Car Delivery on the car marker and Express Delivery on the delivery bike marker', () => {
    expect(riderMapMarkerKind('car_delivery')).toBe('car');
    expect(riderMapMarkerKind('car-delivery')).toBe('car');
    expect(riderMapMarkerKind('express_delivery')).toBe('delivery');
    expect(riderMapMarkerKind('delivery')).toBe('delivery');
    expect(riderMapMarkerKind('okada')).toBe('okada');
  });

  it('uses the shared resolver in both Rider map renderers', () => {
    expect(nativeMap).toContain('const kind = riderMapMarkerKind(serviceType);');
    expect(fallbackMap).toContain('return riderMapMarkerKind(value);');
  });
});
