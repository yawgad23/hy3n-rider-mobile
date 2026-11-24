import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const expo = JSON.parse(readFileSync(path.join(expoRoot, 'package.json'), 'utf8'));
const core = JSON.parse(readFileSync(require.resolve('expo-modules-core/package.json'), 'utf8'));
const supported = JSON.parse(readFileSync(path.join(expoRoot, 'bundledNativeModules.json'), 'utf8'));
const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const config = readFileSync(path.join(root, 'app.config.ts'), 'utf8');
const eas = JSON.parse(readFileSync(path.join(root, 'eas.json'), 'utf8'));

describe('Apple native dependency and release safeguards', () => {
  it('uses the exact Apple patch range recommended by the installed Expo SDK57', () => {
    expect(expo.version).toBe('57.0.34');
    expect(core.version).toBe('57.0.26');
    expect(supported['expo-modules-core']).toBe('~57.0.26');
    expect(manifest.dependencies['expo-apple-authentication']).toBe(supported['expo-apple-authentication']);
    expect(supported['expo-apple-authentication']).toBe('~57.0.2');
    expect(lock).toContain('expo-apple-authentication:\n        specifier: ~57.0.2\n        version: 57.0.2(');
    expect(lock).not.toContain('expo-apple-authentication@58.');
    expect(lock).not.toContain('expo-apple-authentication@8.');
  });

  it('keeps SDK57 mandatory new architecture and the iPhone/iPad Apple capability safeguards', () => {
    // SDK57 / React Native 0.86 have no legacy-architecture opt-out.
    expect(config).not.toMatch(/\bnewArchEnabled\s*:\s*false\b/);
    expect(config).toContain('supportsTablet: true');
    expect(config).toContain('usesAppleSignIn: true');
    expect(config).toContain('"com.apple.developer.applesignin": ["Default"]');
    expect(config).toContain('"expo-apple-authentication"');
  });

  it('requires scene support and a pinned Xcode27 production image for scene-only presentation', () => {
    expect(config).toMatch(/\benableSceneSupport\s*:\s*true\b/);
    // An explicit versioned image is required; auto/latest must never select Xcode26.
    expect(eas.build.production.ios.image).toMatch(/^macos-[a-z]+-\d+\.\d+(?:\.\d+)?-xcode-27\.\d+(?:\.\d+)?$/);
  });

  it('runs the native source integration check in CI and before an EAS native build', () => {
    expect(manifest.scripts['check:apple-native']).toBe('node scripts/check-apple-auth-integration.mjs');
    expect(manifest.scripts.postinstall).toContain('&& node scripts/patch-apple-authentication.mjs');
    expect(manifest.scripts['eas-build-post-install']).toBe('node scripts/patch-apple-authentication.mjs && node scripts/check-apple-auth-integration.mjs && node scripts/check-rider-ios-sdk27-native.mjs');
    expect(manifest.scripts['check:ios-sdk27-native']).toBe('node scripts/check-rider-ios-sdk27-native.mjs');
    const ci = readFileSync(path.join(root, '.github/workflows/rider-ci.yml'), 'utf8');
    expect(ci).toContain('run: pnpm check:apple-native');
  });
});
