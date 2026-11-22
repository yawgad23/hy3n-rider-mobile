import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const config = readFileSync(path.join(root, 'app.config.ts'), 'utf8');
const patch = readFileSync(path.join(root, 'scripts/patch-apple-authentication.mjs'), 'utf8');
const preflight = readFileSync(path.join(root, 'scripts/check-apple-auth-integration.mjs'), 'utf8');

// Source migration checks deliberately do not use the installed SDK54 read-only
// overlay as an SDK57 catalog. The executable preflight validates the real installed
// Expo bundledNativeModules.json after a separately authorized frozen install.
describe('SDK57 Apple native dependency and release safeguards', () => {
  it('pins the SDK57 catalog Apple/Crypto ranges and exact reviewed native resolutions', () => {
    expect(manifest.dependencies.expo).toBe('~57.0.33');
    expect(manifest.dependencies['expo-apple-authentication']).toBe('~57.0.2');
    expect(manifest.dependencies['expo-crypto']).toBe('~57.0.4');
    expect(lock).toContain('expo-apple-authentication:\n        specifier: ~57.0.2\n        version: 57.0.2(');
    expect(lock).toContain('expo-crypto:\n        specifier: ~57.0.4\n        version: 57.0.4(');
    expect(lock).toContain('expo-modules-core@57.0.26');
    expect(lock).not.toContain('expo-apple-authentication@58.');
    expect(lock).not.toContain('expo-apple-authentication@8.');
    expect(patch).toContain('const appleVersion = "57.0.2"');
    expect(patch).toContain('const coreVersion = "57.0.26"');
    expect(preflight).toContain("bundledNativeModules.json");
    expect(preflight).toContain("'expo-apple-authentication': '~57.0.2'");
    expect(preflight).toContain("'expo-crypto': '~57.0.4'");
    expect(preflight).toContain("'expo-modules-core': '~57.0.26'");
    expect(preflight).toContain('await verifyAppleAuthentication(projectRoot)');
  });

  it('requires New Architecture and Xcode27 scenes while preserving iPhone/iPad Apple capability', () => {
    // SDK55+ always uses New Architecture and removed this app-config property.
    expect(config).not.toMatch(/\bnewArchEnabled\s*:/);
    expect(preflight).toContain("!Object.hasOwn(config, 'newArchEnabled')");
    expect(config).toContain('enableSceneSupport: true');
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
    expect(preflight).not.toMatch(/\['prebuild'|\['run:ios'|\['build'/);
  });
});
