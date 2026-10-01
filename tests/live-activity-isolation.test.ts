import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Rider trip-completion native safety', () => {
  it('keeps the unstable Live Activity bridge out of the completion release', () => {
    const appConfig = source('app.config.ts');
    const rootLayout = source('app/_layout.tsx');
    const riderHome = source('app/(tabs)/index.tsx');
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(appConfig).not.toContain('expo-live-activity');
    expect(appConfig).not.toContain('withLiveActivityReleaseSettings');
    expect(appConfig).not.toContain('NSSupportsLiveActivities');
    expect(rootLayout).not.toContain('listenForRiderLiveActivity');
    expect(riderHome).not.toContain('syncRiderLiveActivity');
    expect(riderHome).not.toContain('endRiderLiveActivity');
    expect(packageJson.dependencies?.['expo-live-activity']).toBeUndefined();
    expect(packageJson.devDependencies?.['expo-live-activity']).toBeUndefined();
  });
});
