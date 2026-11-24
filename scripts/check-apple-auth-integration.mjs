import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'package.json'));
const json = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(`[Apple native preflight] ${message}`);
};

const manifest = json(join(root, 'package.json'));
const expoRoot = dirname(require.resolve('expo/package.json'));
const expectedRange = json(join(expoRoot, 'bundledNativeModules.json'))['expo-apple-authentication'];
assert(manifest.dependencies['expo-apple-authentication'] === expectedRange,
  `Declared Apple package must match Expo's supported range ${expectedRange}.`);
const apple = json(require.resolve('expo-apple-authentication/package.json'));
const minimum = /^~(\d+)\.(\d+)\.(\d+)$/.exec(expectedRange);
const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(apple.version);
assert(minimum && actual && actual[1] === minimum[1] && actual[2] === minimum[2]
  && Number(actual[3]) >= Number(minimum[3]),
  `Installed Apple package ${apple.version} is incompatible with ${expectedRange}; reinstall from the frozen lockfile.`);

const runExpo = (entry, arguments_) => JSON.parse(execFileSync(process.execPath,
  [join(expoRoot, 'bin', entry), ...arguments_],
  { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
const config = runExpo('cli', ['config', '--type', 'public', '--json']);
assert(config.ios?.usesAppleSignIn === true, 'ios.usesAppleSignIn must remain enabled.');
assert(config.ios?.entitlements?.['com.apple.developer.applesignin']?.includes('Default'),
  'Apple Sign-In entitlement is missing.');
assert(config.plugins?.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-apple-authentication'),
  'The Apple authentication config plugin is missing.');

const result = runExpo('autolinking', ['resolve', '--platform', 'ios', '--json']);
const module = result.modules?.find((item) => item.packageName === 'expo-apple-authentication');
assert(module?.packageVersion === apple.version, 'iOS autolinking discovered a different Apple package version.');
assert(module.modules?.some((item) => (typeof item === 'string' ? item : item.class) === 'AppleAuthenticationModule')
  && module.swiftModuleNames?.includes('ExpoAppleAuthentication')
  && module.pods?.some((pod) => pod.podName === 'ExpoAppleAuthentication'),
  'The Apple Swift module and CocoaPod are not discoverable for iOS.');
console.log(`[Apple native preflight] SDK-compatible Apple ${apple.version}, capability and source autolinking verified.`);
console.log('[Apple native preflight] This is not binary/device verification. Check the generated provider, signed entitlements and physical iPhone/iPad authentication before review.');
