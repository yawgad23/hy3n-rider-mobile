import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const supported = JSON.parse(readFileSync(path.join(path.dirname(require.resolve('expo/package.json')), 'bundledNativeModules.json'), 'utf8'));
const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const config = readFileSync(path.join(root, 'app.config.ts'), 'utf8');

describe('Apple native dependency and release safeguards', () => {
  it('uses the exact Apple patch range recommended by the installed Expo SDK', () => {
    expect(manifest.dependencies['expo-apple-authentication']).toBe(supported['expo-apple-authentication']);
    expect(supported['expo-apple-authentication']).toBe('~8.0.8');
    expect(lock).toContain('expo-apple-authentication:\n        specifier: ~8.0.8\n        version: 8.0.8(');
    expect(lock).not.toContain('expo-apple-authentication@58.');
  });

  it('keeps the previous legacy-architecture and iPhone/iPad capability safeguards', () => {
    expect(config).toContain('newArchEnabled: false');
    expect(config).toContain('supportsTablet: true');
    expect(config).toContain('usesAppleSignIn: true');
    expect(config).toContain('"com.apple.developer.applesignin": ["Default"]');
    expect(config).toContain('"expo-apple-authentication"');
  });

  it('runs the native source integration check in CI and before an EAS native build', () => {
    expect(manifest.scripts['check:apple-native']).toBe('node scripts/check-apple-auth-integration.mjs');
    expect(manifest.scripts.postinstall).toContain('&& node scripts/patch-apple-authentication.mjs');
    expect(manifest.scripts['eas-build-post-install']).toBe('node scripts/patch-apple-authentication.mjs && node scripts/check-apple-auth-integration.mjs');
    const ci = readFileSync(path.join(root, '.github/workflows/rider-ci.yml'), 'utf8');
    expect(ci).toContain('run: pnpm check:apple-native');
  });
});
