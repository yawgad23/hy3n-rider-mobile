import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyAppleAuthentication } from './patch-apple-authentication.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(`[Apple native preflight] ${message}`);
};
function satisfiesTilde(version, range) {
  const minimum = /^~(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return minimum && actual && actual[1] === minimum[1] && actual[2] === minimum[2]
    && Number(actual[3]) >= Number(minimum[3]);
}

export async function checkAppleAuthenticationIntegration(projectRoot = root) {
  const require = createRequire(join(projectRoot, 'package.json'));
  const manifest = json(join(projectRoot, 'package.json'));
  const expoRoot = dirname(require.resolve('expo/package.json'));
  const expo = json(join(expoRoot, 'package.json'));
  assert(expo.version === '57.0.33',
    `Installed Expo ${expo.version} is not the reviewed SDK 57.0.33; reinstall from the frozen lockfile.`);
  const supported = json(join(expoRoot, 'bundledNativeModules.json'));
  const auditedRanges = {
    'expo-apple-authentication': '~57.0.2',
    'expo-crypto': '~57.0.4',
    'expo-modules-core': '~57.0.26',
  };
  const installed = {};
  for (const [name, expectedRange] of Object.entries(auditedRanges)) {
    assert(supported[name] === expectedRange,
      `Expo's ${name} catalog range ${supported[name]} differs from the reviewed ${expectedRange}.`);
    if (name === 'expo-modules-core') {
      assert(expo.dependencies?.[name] === expectedRange,
        `Expo's Core dependency must remain ${expectedRange}.`);
    } else {
      assert(manifest.dependencies?.[name] === expectedRange,
        `Declared ${name} must match Expo's supported range ${expectedRange}.`);
    }
    installed[name] = json(require.resolve(`${name}/package.json`));
    assert(installed[name].name === name && satisfiesTilde(installed[name].version, expectedRange),
      `Installed ${name} ${installed[name].version} is incompatible with ${expectedRange}; reinstall from the frozen lockfile.`);
  }
  // Read-only: requires the exact reviewed Apple/Core publication and complete
  // safety backport. A valid tilde range alone never authorizes unreviewed Swift.
  const native = await verifyAppleAuthentication(projectRoot);
  const runExpo = (entry, arguments_) => JSON.parse(execFileSync(process.execPath,
    [join(expoRoot, 'bin', entry), ...arguments_],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }));
  const config = runExpo('cli', ['config', '--type', 'public', '--json']);
  // SDK55 removed newArchEnabled: SDK57 always uses the New Architecture.
  assert(!Object.hasOwn(config, 'newArchEnabled'),
    'Remove the obsolete newArchEnabled config property; SDK 57 cannot use the legacy renderer.');
  assert(config.ios?.supportsTablet === true, 'iPhone/iPad support must remain enabled.');
  assert(config.ios?.usesAppleSignIn === true, 'ios.usesAppleSignIn must remain enabled.');
  assert(Array.isArray(config.ios?.entitlements?.['com.apple.developer.applesignin'])
    && config.ios.entitlements['com.apple.developer.applesignin'].includes('Default'),
    'Apple Sign-In entitlement is missing.');
  assert(config.plugins?.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-apple-authentication'),
    'The Apple authentication config plugin is missing.');
  const buildProperties = config.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
  assert(buildProperties?.[1]?.ios?.enableSceneSupport === true,
    'expo-build-properties ios.enableSceneSupport must be enabled for the Xcode 27 / iOS 27 lifecycle.');
  const result = runExpo('autolinking', ['resolve', '--platform', 'ios', '--json']);
  const module = result.modules?.find((item) => item.packageName === 'expo-apple-authentication');
  assert(module?.packageVersion === native.appleVersion,
    'iOS autolinking discovered a different Apple package version.');
  // SDK57 autolinking resolves native classes as { name, class } records.
  // Keep validating the real registration, not the old SDK54 string schema.
  assert(module.modules?.some((item) => item?.class === 'AppleAuthenticationModule')
    && module.swiftModuleNames?.includes('ExpoAppleAuthentication')
    && module.pods?.some((pod) => pod.podName === 'ExpoAppleAuthentication'),
    'The Apple Swift module and CocoaPod are not discoverable for iOS.');
  console.log(`[Apple native preflight] SDK 57 Apple ${native.appleVersion} / Core ${native.coreVersion}, audited safety sources, capability, scene config and source autolinking verified.`);
  console.log('[Apple native preflight] This is not compilation, binary or device verification. Check the generated provider, signed entitlements and physical iPhone/iPad authentication before review.');
  return native;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkAppleAuthenticationIntegration().catch((error) => {
    console.error(`[Apple native preflight] ${error.message}`);
    process.exitCode = 1;
  });
}
