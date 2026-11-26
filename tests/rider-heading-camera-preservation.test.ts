import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BASE = '0b4818015f6662e7125fd8c452c62c88bb072f17';
const IOS_BASE = 'a3966ca';
const RELEASE_BASE = spawnSync('git', ['merge-base', '--is-ancestor', IOS_BASE, 'HEAD']).status === 0 ? IOS_BASE : BASE;
const MAP = 'components/NativeGoogleMap.tsx';
const baseline = (file: string, revision = BASE) => execFileSync('git', ['show', `${revision}:${file}`], {
  cwd: process.cwd(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
const current = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

/** Delimit with existing complete source statements, not brittle line numbers. */
function slice(source: string, from: string, until: string) {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start + from.length);
  expect(start, `missing source boundary: ${from}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing source boundary: ${until}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const motionFrom = '  useEffect(() => {\n    if (!displayDriverPoint) {';
const motionUntil = '\n\n  useEffect(() => {\n    previousFreshRouteRef.current = {';

// These slices deliberately exclude the camera effects and map gesture/layout
// callbacks. The iOS cherry-pick's POI typing spread is also outside every slice.
const unchangedSlices = [
  ['public tracking, ETA, booking, and marker props', 'export type NearbyDriver = {', '\nexport type NativeGoogleMapRef = {'],
  ['accepted GPS and visual marker direction derivation', '  const locationAtMs = ', '\n  const animatedDriverCoordinate = '],
  ['marker artwork and booking endpoint presentation', 'function safeColour(', '\nfunction initialRegion('],
  ['motion sample authority', '  const driverMotionAnchor = ', '\n\n'],
  ['server route retention', '  useEffect(() => {\n    previousFreshRouteRef.current = {', '\n\n  useEffect(() => {\n    // Closing the overview'],
  ['explicit route overview', '  useEffect(() => {\n    if (!routeOverview) {', '\n\n  useImperativeHandle(ref,'],
  ['green road line and all rendered marker props', '        {routeCoordinates.length > 1 && <Polyline', '\n      </MapView>'],
  ['map artwork sizes, route colour, and dark styles', 'const FALLBACK_CENTER:', '\nfunction coordinate('],
  ['existing sheet and marker styles', 'const styles = StyleSheet.create({', '\nexport default NativeGoogleMap;'],
] as const;

const unchangedFiles = [
  'components/AnimatedNearbyMarker.tsx',
  'components/LeafletMap.tsx',
  'components/map-view.tsx',
  'components/map-marker-assets.ts',
  'lib/native-map-camera.ts',
  'lib/rider-driver-marker-motion.ts',
  'lib/rider-route-animation.ts',
  'lib/rider-route-matching.ts',
  'lib/rider-live-route-display.ts',
  'lib/rider-live-tracking-presentation.ts',
  'lib/rider-vehicle-artwork.ts',
  'app/(tabs)/index.tsx',
];

describe('heading-up camera change preserves the working Rider motion and presentation', () => {
  it('keeps the entire old marker motion effect (base lines 277–385) byte-identical', () => {
    expect(slice(current(MAP), motionFrom, motionUntil)).toBe(slice(baseline(MAP), motionFrom, motionUntil));
  });

  it('uses the same motion effect on the historical iOS cherry-pick', () => {
    expect(slice(baseline(MAP, IOS_BASE), motionFrom, motionUntil)).toBe(slice(baseline(MAP), motionFrom, motionUntil));
    expect(slice(current(MAP), motionFrom, motionUntil)).toBe(slice(baseline(MAP, IOS_BASE), motionFrom, motionUntil));
  });

  it.each(unchangedSlices)('preserves %s byte-for-byte', (_name, from, until) => {
    expect(slice(current(MAP), from, until)).toBe(slice(baseline(MAP), from, until));
    expect(slice(baseline(MAP, IOS_BASE), from, until)).toBe(slice(baseline(MAP), from, until));
  });

  it.each(unchangedFiles)('does not modify %s', (file) => {
    expect(current(file)).toBe(baseline(file, RELEASE_BASE));
  });

  it('preserves artwork, GPS, backend, ETA/fare, SDK and packages except the authorised 1.0.7 release identity', () => {
    const protectedFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', RELEASE_BASE], { encoding: 'utf8' })
      .trim().split('\n').filter((file) =>
        /^(assets\/|server\/|backend\/|android\/|ios\/)/.test(file)
        || /^(app\.config\.|app\.json$|eas\.json$|package\.json$|pnpm-lock\.yaml$)/.test(file)
        || /^(lib\/.*(?:driver-location|location-service|trip-route|fare|quote|eta)|hooks\/.*(?:driver|location))/.test(file));
    expect(protectedFiles.length).toBeGreaterThan(0);
    for (const file of protectedFiles) {
      if (file === 'app.config.ts') {
        const expected = baseline(file, RELEASE_BASE)
          .replace('version: "1.0.6"', 'version: "1.0.7"')
          .replace(RELEASE_BASE === IOS_BASE ? 'buildNumber: "139"' : 'versionCode: 58028',
            RELEASE_BASE === IOS_BASE ? 'buildNumber: "140"' : 'versionCode: 58029');
        expect(current(file), 'only the approved release version and platform counter may differ').toBe(expected);
        continue;
      }
      // Compare Git blob hashes rather than decoding binary artwork as UTF-8.
      const oldHash = execFileSync('git', ['rev-parse', `${RELEASE_BASE}:${file}`], { encoding: 'utf8' }).trim();
      const newHash = execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim();
      expect(newHash, file).toBe(oldHash);
    }
  });
});
