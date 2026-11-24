'use strict';

const { withAppDelegate, withPodfile } = require('@expo/config-plugins');

// Maps' published plugin anchors initialization near super.application. SDK 27
// scenes require initialization at the start of launch, before any React/map work.
function reorderGoogleMapsInitialization(source) {
  const calls = source.match(/GMSServices\.provideAPIKey\(/g) || [];
  if (calls.length !== 1) {
    throw new Error('Rider SDK 27 requires exactly one native Google Maps key initialization.');
  }
  const block = /[ \t]*\/\/ @generated begin react-native-maps-init[^\n]*\n[\s\S]*?[ \t]*\/\/ @generated end react-native-maps-init[^\n]*(?:\n|$)/g;
  const blocks = [...source.matchAll(block)];
  if (blocks.length !== 1) throw new Error('Unrecognized Google Maps startup block; refusing speculative native rewrite.');
  const without = source.replace(block, '');
  const launch = /(?:public\s+)?override\s+func\s+application\(\s*_\s+application:\s*UIApplication,\s*didFinishLaunchingWithOptions\s+launchOptions:\s*\[UIApplication\.LaunchOptionsKey:\s*Any\]\?\s*=\s*nil\s*\)\s*->\s*Bool\s*\{/g;
  const matches = [...without.matchAll(launch)];
  if (matches.length !== 1) throw new Error('Unrecognized SDK 57 launch method; refusing native rewrite.');
  const at = matches[0].index + matches[0][0].length;
  const lines = blocks[0][0].trim().split('\n').map(line => `    ${line.trim()}`).join('\n');
  // Consume existing blank space only: repeated prebuild/plugin execution is byte-idempotent.
  return without.slice(0, at) + '\n' + lines + '\n\n' + without.slice(at).replace(/^\s*\n/, '');
}

function configureFirebaseStaticFramework(source) {
  const marker = '# @generated begin hy3n-rider-firebase-static';
  if (source.includes(marker)) return source;
  if (source.includes('$RNFirebaseAsStaticFramework')) {
    throw new Error('Unexpected Firebase framework override; refusing duplicate configuration.');
  }
  const target = /^target ['"][^'"]+['"] do/m;
  if (!target.test(source)) throw new Error('Could not locate Rider CocoaPods application target.');
  return source.replace(target, `${marker}\n$RNFirebaseAsStaticFramework = true\n# @generated end hy3n-rider-firebase-static\n\n$&`);
}

function withRiderIOSSDK27(config) {
  config = withAppDelegate(config, result => {
    if (result.modResults.language !== 'swift') throw new Error('Rider SDK 27 requires the audited Swift AppDelegate.');
    result.modResults.contents = reorderGoogleMapsInitialization(result.modResults.contents);
    return result;
  });
  return withPodfile(config, result => {
    result.modResults.contents = configureFirebaseStaticFramework(result.modResults.contents);
    return result;
  });
}

module.exports = withRiderIOSSDK27;
module.exports.reorderGoogleMapsInitialization = reorderGoogleMapsInitialization;
module.exports.configureFirebaseStaticFramework = configureFirebaseStaticFramework;
