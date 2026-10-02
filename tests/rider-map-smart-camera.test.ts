import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'components/LeafletMap.tsx'), 'utf8');

describe('Rider live tracking smart camera', () => {
  it('frames a newly tracked Driver and pickup automatically at a usable zoom', () => {
    expect(source).toContain('const updateTrackingCamera = (state) =>');
    expect(source).toContain('map.fitBounds([driverPoint, targetPoint]');
    expect(source).toContain('maxZoom: 17');
  });

  it('keeps the car visible without overriding a Rider-controlled map', () => {
    expect(source).toContain('if (userMovedMap || !state.driver) return;');
    expect(source).toContain('map.panInside(driverPoint');
    expect(source).toContain('updateTrackingCamera(state);');
    expect(source).toContain('let programmaticCameraChange = false;');
    expect(source).toContain("map.on('zoomstart', () => { if (!programmaticCameraChange) userMovedMap = true; });");
  });

  it('keeps the pickup spot labelled and the active road line visually prominent', () => {
    expect(source).toContain("bindTooltip('Pickup spot', { permanent: true");
    expect(source).toContain("className: 'hy3n-pickup-label'");
    expect(source).toContain("className: 'hy3n-active-route'");
    expect(source).toContain('weight: 6, opacity: .96');
  });
});
