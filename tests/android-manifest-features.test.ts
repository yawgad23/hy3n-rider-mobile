import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');
const appConfig = readFileSync(resolve(repoRoot, 'app.config.ts'), 'utf8');
const plugin = readFileSync(
  resolve(repoRoot, 'plugins/with-optional-android-features.js'),
  'utf8',
);

describe('Android manifest hardware feature policy', () => {
  it('registers the optional-feature plugin for the Rider Android build', () => {
    expect(appConfig).toContain('"./plugins/with-optional-android-features"');
  });

  it('marks portrait capability as optional in the generated manifest', () => {
    expect(plugin).toContain("'android.hardware.screen.portrait'");
    expect(plugin).toContain("'android:required': 'false'");
    expect(plugin).toContain("'tools:replace': 'android:required'");
  });
});
