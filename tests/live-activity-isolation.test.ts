import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Rider HY3N Dynamic Island integration', () => {
  it('configures the native Live Activity extension without coupling it to ride authority', () => {
    const appConfig = source('app.config.ts');
    const rootLayout = source('app/_layout.tsx');
    const riderHome = source('app/(tabs)/index.tsx');
    const liveActivity = source('lib/rider-live-activity.ts');
    const brandingPlugin = source('plugins/withHy3nLiveActivityBranding.js');
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(appConfig).toContain('expo-live-activity');
    expect(appConfig).toContain('withHy3nLiveActivityBranding');
    expect(appConfig).toContain('"aps-environment"');
    expect(brandingPlugin).toContain('hy3n_wordmark');
    expect(brandingPlugin).toContain('aps-environment');
    expect(riderHome).toContain('syncRiderLiveActivity');
    expect(riderHome).toContain('endRiderLiveActivity');
    expect(liveActivity).toContain('/api/live-activities/token');
    expect(liveActivity).toContain('riderLiveActivityEligible');
    expect(rootLayout).not.toContain('live-activities/token');
    expect(packageJson.dependencies?.['expo-live-activity']).toBe('0.4.2');
  });
});
