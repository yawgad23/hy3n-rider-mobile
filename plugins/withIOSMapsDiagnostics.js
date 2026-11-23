'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  createRunOncePlugin,
  IOSConfig,
  withFinalizedMod,
  withXcodeProject,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'hy3n-ios-maps-diagnostics';
const NOTIFICATION_NAME = 'HY3NMapsDiagnosticsEvent';
const SOURCE_FILE = 'HY3NMapsDiagnostics.m';
const TEMPLATE_PATH = path.join(__dirname, 'ios-maps-diagnostics', SOURCE_FILE);
const PREFIX = '// HY3NMapsDiagnostics v1';

// Deliberately narrow: Expo 54 Swift AppDelegate + react-native-maps 1.20.1.
// Never include source text in errors: an AppDelegate contains the real key.
function fail(message) {
  throw new Error(`[${PLUGIN_NAME}] ${message}`);
}
function count(source, expression) {
  return [...source.matchAll(expression)].length;
}
function exactlyOne(source, expression, description) {
  const matches = [...source.matchAll(expression)];
  if (matches.length !== 1) fail(`Expected exactly one ${description}; found ${matches.length}.`);
  return matches[0];
}
function replaceOnce(source, original, replacement) {
  if (source.split(original).length !== 2) fail('Ambiguous source replacement.');
  return source.replace(original, () => replacement);
}
function swiftPost(indent, event, details = '') {
  return `${indent}NotificationCenter.default.post(name: Notification.Name("${NOTIFICATION_NAME}"), object: nil, userInfo: ["event": "${event}"${details}])`;
}
function wrap(tag, indent, body) {
  return `${indent}${PREFIX} ${tag}.begin\n${body}\n${indent}${PREFIX} ${tag}.end`;
}
function launchBlock(indent) {
  return wrap('launch', indent, swiftPost(indent, 'launch.started'));
}
function reactNativeBlock(original) {
  const indent = original.match(/^[ \t]*/)[0];
  return wrap('reactNative', indent, [
    swiftPost(indent, 'reactNative.start.begin'),
    original,
    swiftPost(indent, 'reactNative.start.end'),
  ].join('\n'));
}
function keyBlock(original) {
  const indent = original.match(/^[ \t]*/)[0];
  return wrap('key', indent, [
    swiftPost(indent, 'maps.key.begin'),
    `${indent}let hy3nMapsKeyAccepted = ${original.slice(indent.length)}`,
    // This is the local provideAPIKey Bool, NOT SDK/server authorization.
    swiftPost(indent, 'maps.key.end', ', "accepted": hy3nMapsKeyAccepted'),
  ].join('\n'));
}

const RN_CALL = /^[ \t]*factory\.startReactNative\(\n[ \t]+withModuleName: "main",\n[ \t]+in: window,\n[ \t]+launchOptions: launchOptions\)/gm;
const KEY_LINE = /^[ \t]*GMSServices\.provideAPIKey\("[^"\\\r\n]+"\)$/gm;
const CAPTURED_KEY_LINE = /^([ \t]*)let hy3nMapsKeyAccepted = (GMSServices\.provideAPIKey\("[^"\\\r\n]+"\))$/gm;

// Validate owned blocks, then recover the exact original source before applying
// the pure transform again. A marker alone must never bypass validation.
function unwrapSwift(source, tag) {
  const begin = `${PREFIX} ${tag}.begin`;
  const end = `${PREFIX} ${tag}.end`;
  const begins = source.split(begin).length - 1;
  const ends = source.split(end).length - 1;
  if (!begins && !ends) return source;
  if (begins !== 1 || ends !== 1) fail(`Incomplete or duplicate ${tag} instrumentation.`);
  const expression = new RegExp(`^([ \\t]*)// HY3NMapsDiagnostics v1 ${tag}\\.begin\\n([\\s\\S]*?)\\n\\1// HY3NMapsDiagnostics v1 ${tag}\\.end$`, 'gm');
  const block = exactlyOne(source, expression, `${tag} instrumentation block`);
  let original;
  let expected;
  if (tag === 'launch') {
    original = '';
    expected = launchBlock(block[1]);
  } else if (tag === 'reactNative') {
    original = exactlyOne(block[2], RN_CALL, 'instrumented React Native start call')[0];
    expected = reactNativeBlock(original);
  } else {
    const captured = exactlyOne(block[2], CAPTURED_KEY_LINE, 'captured local key call');
    original = captured[1] + captured[2];
    expected = keyBlock(original);
  }
  if (block[0] !== expected) fail(`Modified ${tag} instrumentation is unsupported.`);
  // Launch is an inserted block plus its following newline; other blocks wrap
  // existing calls and must preserve their original surrounding whitespace.
  return replaceOnce(source, block[0] + (tag === 'launch' ? '\n' : ''), original);
}

function transformSwiftAppDelegate(input) {
  if (typeof input !== 'string' || input.includes('\r')) fail('Expected LF Swift AppDelegate source.');
  if (count(input, /\bprovideAPIKey\b/g) !== 1) fail('Expected exactly one existing provideAPIKey call; no key calls are created.');
  let source = input;
  for (const tag of ['launch', 'reactNative', 'key']) source = unwrapSwift(source, tag);
  if (source.includes('HY3NMapsDiagnostics') || source.includes('hy3nMapsKeyAccepted')) fail('Unknown or partial Swift diagnostics instrumentation.');
  exactlyOne(source, /^public class AppDelegate: ExpoAppDelegate \{$/gm, 'Expo Swift AppDelegate class');
  const launch = exactlyOne(source, /^[ \t]*public override func application\(\n[ \t]+_ application: UIApplication,\n[ \t]+didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\n[ \t]*\) -> Bool \{/gm, 'supported launch method');
  const launchEnd = source.indexOf('\n  }', launch.index + launch[0].length);
  if (launchEnd < 0) fail('Unsupported launch method boundary.');
  const rn = exactlyOne(source, RN_CALL, 'supported factory.startReactNative call');
  if (count(source, /\bstartReactNative\b/g) !== 1) fail('Multiple or unsupported React Native start calls.');
  const key = exactlyOne(source, KEY_LINE, 'standalone Google Maps key call');
  const official = exactlyOne(source, /^\/\/ @generated begin react-native-maps-init - expo prebuild \(DO NOT MODIFY\)[^\r\n]*\n#if canImport\(GoogleMaps\)\n[ \t]*GMSServices\.provideAPIKey\("[^"\\\r\n]+"\)\n#endif\n\/\/ @generated end react-native-maps-init$/gm, 'official Expo Maps initialization block');
  const superCall = exactlyOne(source, /^[ \t]*return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)$/gm, 'launch super.application return');
  const methodStart = launch.index + launch[0].length;
  if ([rn.index, key.index, official.index, superCall.index].some(index => index <= methodStart || index >= launchEnd)) fail('Required launch calls must be inside didFinishLaunchingWithOptions.');
  if (rn.index >= superCall.index || key.index >= superCall.index) fail('Unsupported launch return ordering.');
  // RN and key are wrapped in place: either existing ordering is preserved.
  source = replaceOnce(source, key[0], keyBlock(key[0]));
  source = replaceOnce(source, rn[0], reactNativeBlock(rn[0]));
  source = replaceOnce(source, launch[0] + '\n', launch[0] + '\n' + launchBlock('    ') + '\n');
  return source;
}

const MAP_SIGNATURE = '- (instancetype)initWithMapId:(NSString *)mapId initialCamera:(GMSCameraPosition*) camera backgroundColor:(UIColor *) backgroundColor andZoomTapEnabled:(BOOL)zoomTapEnabled\n{';
const MAP_SUPER = '    self = [super initWithOptions:options];';
const MAP_BLOCK = wrap('mapView', '    ', [
  '    NSString * const hy3nMapsInstanceId = [NSUUID UUID].UUIDString;',
  '    [[NSNotificationCenter defaultCenter] postNotificationName:@"HY3NMapsDiagnosticsEvent" object:nil userInfo:@{@"event": @"maps.view.create.begin", @"instanceId": hy3nMapsInstanceId}];',
  MAP_SUPER,
  '    [[NSNotificationCenter defaultCenter] postNotificationName:@"HY3NMapsDiagnosticsEvent" object:nil userInfo:@{@"event": @"maps.view.create.end", @"instanceId": hy3nMapsInstanceId, @"created": @(self != nil)}];',
].join('\n'));

function transformAIRGoogleMap(input) {
  if (typeof input !== 'string' || input.includes('\r')) fail('Expected LF AIRGoogleMap.m source.');
  let source = input;
  if (source.includes('HY3NMapsDiagnostics')) {
    if (source.split(MAP_BLOCK).length !== 2) fail('Incomplete, modified or duplicate map instrumentation.');
    source = replaceOnce(source, MAP_BLOCK, MAP_SUPER);
    if (source.includes('HY3NMapsDiagnostics')) fail('Unknown map instrumentation.');
  }
  if (source.split(MAP_SIGNATURE).length !== 2) fail('Unsupported AIRGoogleMap initializer signature.');
  exactlyOne(source, /^@implementation AIRGoogleMap$/gm, 'AIRGoogleMap implementation');
  exactlyOne(source, /^#ifdef HAVE_GOOGLE_MAPS$/gm, 'Google Maps source guard');
  if (count(source, /\[\s*super\s+initWithOptions\s*:/g) !== 1 || source.split(MAP_SUPER).length !== 2) fail('Expected exactly one supported super initWithOptions call.');
  const start = source.indexOf(MAP_SIGNATURE);
  const end = source.indexOf('\n}\n', start);
  const superIndex = source.indexOf(MAP_SUPER);
  if (end < 0 || superIndex <= start || superIndex >= end) fail('Map super initializer is outside the supported initializer.');
  const initializer = source.slice(start, end);
  exactlyOne(initializer, /^  return self;$/gm, 'map initializer return');
  exactlyOne(initializer, /^    GMSMapViewOptions\* options = \[\[GMSMapViewOptions alloc\] init\];$/gm, 'map options construction');
  // No try/catch, return rewrite, map options, location, or SDK behavior changes.
  return replaceOnce(source, MAP_SUPER, MAP_BLOCK);
}

function getNativeModuleSource() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

/**
 * Registration contract (Expo @expo/config-plugins 54.0.5):
 * register ./plugins/withIOSMapsDiagnostics in config.plugins. Do NOT call Maps
 * withMaps again or add a second key initializer. Expo's automatic legacy Maps
 * plugin runs its AppDelegate mod in the normal phase; this plugin reads that
 * written file only in ios.finalized (precedence +1, after normal mods). Thus
 * config.plugins array order relative to automatic Maps insertion is immaterial.
 * withRunOnce/createRunOncePlugin prevents duplicate registration, not ordering.
 * Ordinary withAppDelegate actions are LIFO in this installed Expo version, so
 * merely appending a withAppDelegate plugin would NOT guarantee running after Maps.
 *
 * Source writes happen only when iOS mods are executed at a future prebuild.
 * Android gets no mods. No key values are read from config or logged. Pass
 * {enabled: false} to register no mods (not to undo an already generated build;
 * use a clean iOS prebuild/dependency checkout when removing instrumentation).
 */
function withIOSMapsDiagnostics(config) {
  config = withXcodeProject(config, mod => {
    const { projectRoot, platformProjectRoot } = mod.modRequest;
    const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
    const groupName = path.basename(sourceRoot);
    const filepath = `${groupName}/${SOURCE_FILE}`;
    const project = mod.modResults;
    // Use the installed Expo helper, which adds PBXFileReference, PBXBuildFile
    // AND PBXSourcesBuildPhase for the actual application target.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath,
      groupName,
      project,
      targetUuid: project.getTarget('com.apple.product-type.application')?.uuid,
    });
    // Guard the helper's duplicate-file short circuit: an existing reference
    // without a compilation entry is not a successfully registered module.
    const references = Object.entries(project.pbxFileReferenceSection()).filter(([id, file]) =>
      !id.endsWith('_comment') && typeof file === 'object' && String(file.path).replace(/^"|"$/g, '') === filepath,
    );
    if (references.length !== 1) fail('Native diagnostics source reference is missing or ambiguous.');
    const referenceId = references[0][0];
    const builds = Object.entries(project.pbxBuildFileSection()).filter(([id, file]) =>
      !id.endsWith('_comment') && typeof file === 'object' && file.fileRef === referenceId,
    );
    const target = project.getTarget('com.apple.product-type.application');
    if (!target) fail('Missing iOS application target.');
    const sourcePhases = target.target.buildPhases.map(phase => project.hash.project.objects.PBXSourcesBuildPhase[phase.value]).filter(Boolean);
    if (!builds.some(([id]) => sourcePhases.some(phase => phase.files.some(file => file.value === id)))) fail('Native diagnostics source is not in the application Sources build phase.');
    if (path.dirname(sourceRoot) !== platformProjectRoot) fail('Unsupported iOS source root.');
    fs.writeFileSync(path.join(sourceRoot, SOURCE_FILE), getNativeModuleSource());
    return mod;
  });
  return withFinalizedMod(config, ['ios', mod => {
    const { projectRoot } = mod.modRequest;
    const delegate = IOSConfig.Paths.getAppDelegate(projectRoot);
    if (delegate.language !== 'swift') fail('Only Expo 54 Swift AppDelegate is supported.');
    const mapsPackage = require.resolve('react-native-maps/package.json', { paths: [projectRoot] });
    const mapsVersion = JSON.parse(fs.readFileSync(mapsPackage, 'utf8')).version;
    if (mapsVersion !== '1.20.1') fail('Only react-native-maps 1.20.1 is supported; review the initializer before upgrading.');
    const mapPath = path.join(path.dirname(mapsPackage), 'ios', 'AirGoogleMaps', 'AIRGoogleMap.m');
    if (!fs.existsSync(mapPath)) fail('AIRGoogleMap.m is missing.');
    // Validate BOTH transforms before touching either source file.
    const swift = transformSwiftAppDelegate(delegate.contents);
    const mapOriginal = fs.readFileSync(mapPath, 'utf8');
    const map = transformAIRGoogleMap(mapOriginal);
    if (swift !== delegate.contents) fs.writeFileSync(delegate.path, swift);
    if (map !== mapOriginal) fs.writeFileSync(mapPath, map);
    return mod;
  }]);
}

const runOnce = createRunOncePlugin(withIOSMapsDiagnostics, PLUGIN_NAME, '1.0.0');
module.exports = function registerIOSMapsDiagnostics(config, options = {}) {
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') fail('enabled must be a boolean.');
  if (options.enabled === false) return config;
  return runOnce(config);
};
// Public pure helpers for focused in-memory tests, not runtime native APIs.
module.exports.transformSwiftAppDelegate = transformSwiftAppDelegate;
module.exports.transformAIRGoogleMap = transformAIRGoogleMap;
module.exports.getNativeModuleSource = getNativeModuleSource;
module.exports.registrationContract = Object.freeze({
  name: PLUGIN_NAME,
  iosMods: ['xcodeproj', 'finalized'],
  appDelegatePhase: 'finalized-after-official-maps',
  nativeModule: 'HY3NMapsDiagnostics',
  notificationName: NOTIFICATION_NAME,
  supportedMapsVersion: '1.20.1',
});
