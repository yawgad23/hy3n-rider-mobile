import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Rider HY3N Dynamic Island integration', () => {
  it('configures a branded, display-only trip-progress presentation', () => {
    const appConfig = source('app.config.ts');
    const rootLayout = source('app/_layout.tsx');
    const riderHome = source('app/(tabs)/index.tsx');
    const liveActivity = source('lib/rider-live-activity.ts');
    const brandingPlugin = source('plugins/withHy3nLiveActivityBranding.js');
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(appConfig).toContain('expo-live-activity');
    expect(appConfig).toContain('withHy3nLiveActivityBranding');
    expect(appConfig).toContain('"aps-environment"');
    expect(brandingPlugin).toContain('hy3n_trip_car');
    expect(brandingPlugin).toContain('HY3N trip-progress presentation v2');
    expect(brandingPlugin).toContain('HY3N trip-progress Lock Screen presentation v2');
    expect(brandingPlugin).toContain('NSSupportsLiveActivitiesFrequentUpdates');
    expect(brandingPlugin).toContain('aps-environment');
    expect(brandingPlugin).toContain('no fare, wallet, or ride-state authority');
    expect(riderHome).toContain('syncRiderLiveActivity');
    expect(riderHome).toContain('endRiderLiveActivity');
    expect(riderHome).toContain('activeRide?.routeDistanceKm');
    expect(liveActivity).toContain('progressBar: { date: presentation.arrivalAt, progress: presentation.progress }');
    expect(liveActivity).toContain("imageName: 'hy3n_trip_car'");
    expect(liveActivity).toContain('/api/live-activities/token');
    expect(liveActivity).toContain('riderLiveActivityEligible');
    expect(rootLayout).not.toContain('live-activities/token');
    expect(packageJson.dependencies?.['expo-live-activity']).toBe('0.4.2');
  });
});
