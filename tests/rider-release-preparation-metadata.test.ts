import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const isIosSource = spawnSync('git', ['merge-base', '--is-ancestor', 'a3966ca', 'HEAD'], { cwd: root }).status === 0;
const cameraBase = isIosSource ? '54243ecec0531a056f2554818730322d09f652e4' : '9509ff40f39124f5c00a62c0315f95e49a27ec8a';
const source = (file: string) => readFileSync(path.resolve(root, file), 'utf8');
const historical = (file: string) => execFileSync('git', ['show', `${cameraBase}:${file}`], { cwd: root, encoding: 'utf8' });

function config(text: string, platform?: string) {
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  vm.runInNewContext(code, {
    exports,
    process: { env: { EAS_BUILD_PROFILE: 'production', ...(platform ? { EAS_BUILD_PLATFORM: platform } : {}), GOOGLE_MAPS_IOS_API_KEY: 'test-ios-client', GOOGLE_MAPS_ANDROID_API_KEY: 'test-android-client' } },
    require: (module: string) => { expect(module).toBe('./scripts/load-env.js'); return {}; },
  });
  return JSON.parse(JSON.stringify(exports.default));
}

describe('prepared Rider 1.0.7 release identity', () => {
  it.each(['ios', 'android', 'web', undefined])('changes only the approved version and source-platform counter with runtime platform %s', (platform) => {
    const expected = config(historical('app.config.ts'), platform);
    expected.version = '1.0.7';
    if (isIosSource) expected.ios.buildNumber = '140';
    else expected.android.versionCode = 58029;
    const actual = config(source('app.config.ts'), platform);
    expect(actual).toEqual(expected);
    expect(actual.ios.bundleIdentifier).toBe('com.hy3n.rider');
    expect(actual.android.package).toBe('com.hy3n.rider');
    expect(actual.extra.eas.projectId).toBe('0b06ad22-f4a1-4aa7-aab6-0e03237ad63c');
  });

  it('keeps both existing camera policies and the actual marker component byte-identical to the tested camera fix', () => {
    for (const file of ['components/NativeGoogleMap.tsx', 'lib/rider-heading-camera.ts', 'lib/native-map-camera.ts', 'lib/rider-route-animation.ts', 'lib/rider-driver-marker-motion.ts']) {
      expect(source(file), file).toBe(historical(file));
    }
  });

  it('allows only release identity, its native validation gate, and these release tests to differ', () => {
    const nativeGate = 'scripts/check-rider-ios-sdk27-native.mjs';
    const allowed = new Set(['app.config.ts', 'tests/rider-heading-camera-preservation.test.ts', 'tests/rider-release-preparation-metadata.test.ts', ...(isIosSource ? [nativeGate] : [])]);
    const changed = execFileSync('git', ['diff', '--name-only', cameraBase, '--'], { cwd: root, encoding: 'utf8' });
    const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    for (const file of `${changed}\n${added}`.split('\n').filter(Boolean)) expect(allowed.has(file), `unauthorised release preparation change: ${file}`).toBe(true);
    expect(source('eas.json')).toBe(historical('eas.json'));
    expect(source('package.json')).toBe(historical('package.json'));
    expect(source('pnpm-lock.yaml')).toBe(historical('pnpm-lock.yaml'));
    if (isIosSource) {
      expect(JSON.parse(source('eas.json')).build.production.ios.image).toBe('macos-tahoe-26.6-xcode-27.0');
      expect(source(nativeGate)).toBe(historical(nativeGate).replaceAll("'1.0.6'", "'1.0.7'").replaceAll("'139'", "'140'").replace('identity 1.0.6/139', 'identity 1.0.7/140'));
    }
  });
});
