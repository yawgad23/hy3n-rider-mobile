import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const fs = require('node:fs');
const expo = require('@expo/config-plugins');
const plugin = require('./plugins/withIOSMapsDiagnostics.js');
const { transformSwiftAppDelegate: swift, transformAIRGoogleMap: map } = plugin;
const safeKey = 'HY3N_TEST_ONLY_NOT_A_REAL_API_KEY';
const rnCall = `    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)`;
const swiftBase = `import Expo
import React
import ReactAppDependencyProvider
@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()
    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
FirebaseApp.configure()
${rnCall}
#endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }
}
`;
// Use the real installed official Expo pure transform, not a simulated key mod.
const swiftFixture = expo.IOSConfig.Maps.addGoogleMapsAppDelegateInit(swiftBase, safeKey).contents;
const mapPath = path.join(root, 'node_modules/react-native-maps/ios/AirGoogleMaps/AIRGoogleMap.m');
const mapFixture: string = fs.readFileSync(mapPath, 'utf8');
const originalSuper = '    self = [super initWithOptions:options];';
const events = ['launch.started', 'reactNative.start.begin', 'reactNative.start.end', 'maps.key.begin', 'maps.key.end', 'maps.view.create.begin', 'maps.view.create.end'];
const details = ['accepted', 'onMainThread', 'created', 'instanceId', 'keyCallObserved', 'keyAccepted', 'keyCallCompleted'];

function stripSwiftInstrumentation(output: string) {
  return output
    .replace(/^.*\/\/ HY3NMapsDiagnostics v1 .*\n/gm, '')
    .replace(/^.*NotificationCenter\.default\.post\(.*\n/gm, '')
    .replace(/let hy3nMapsKeyAccepted = /g, '');
}
function stripMapInstrumentation(output: string) {
  return output
    .replace(/^.*\/\/ HY3NMapsDiagnostics v1 .*\n/gm, '')
    .replace(/^.*NSString \* const hy3nMapsInstanceId = .*\n/gm, '')
    .replace(/^.*\[\[NSNotificationCenter defaultCenter\] postNotificationName:.*\n/gm, '');
}

afterEach(() => vi.restoreAllMocks());

describe('iOS Maps diagnostics Swift transformation', () => {
  it('preserves every original byte after removing only diagnostics, including key and call order', () => {
    const result = swift(swiftFixture);
    expect(stripSwiftInstrumentation(result)).toBe(swiftFixture);
    expect(result.match(/\bprovideAPIKey\b/g)).toHaveLength(1);
    expect(result).toContain(`let hy3nMapsKeyAccepted = GMSServices.provideAPIKey("${safeKey}")`);
    expect(result.indexOf('factory.startReactNative')).toBeLessThan(result.indexOf('GMSServices.provideAPIKey'));
    expect(result.indexOf('GMSServices.provideAPIKey')).toBeLessThan(result.indexOf('return super.application'));
    expect(result.indexOf('"launch.started"')).toBeLessThan(result.indexOf('let delegate = ReactNativeDelegate()'));
    expect(result.indexOf('"reactNative.start.begin"')).toBeLessThan(result.indexOf(rnCall));
    expect(result.indexOf('"reactNative.start.end"')).toBeGreaterThan(result.indexOf(rnCall));
    expect(result.indexOf('"maps.key.begin"')).toBeLessThan(result.indexOf('let hy3nMapsKeyAccepted'));
    expect(result).toContain('"event": "maps.key.end", "accepted": hy3nMapsKeyAccepted');
    expect(result.match(/NotificationCenter.default.post/g)).toHaveLength(5);
    for (const line of result.split('\n').filter((line: string) => line.includes('NotificationCenter.default.post'))) expect(line).not.toContain(safeKey);
  });

  it('is byte-idempotent and remains idempotent across official Expo Maps regeneration', () => {
    const result = swift(swiftFixture);
    expect(swift(result)).toBe(result);
    const regenerated = expo.IOSConfig.Maps.addGoogleMapsAppDelegateInit(result, safeKey).contents;
    expect(swift(regenerated)).toBe(result);
  });

  it('preserves a pre-existing key-before-RN order instead of imposing a new order', () => {
    const block = swiftFixture.match(/^\/\/ @generated begin react-native-maps-init[^]*?^\/\/ @generated end react-native-maps-init\n/gm)![0];
    const keyFirst = swiftFixture.replace(block, '').replace(rnCall, block + rnCall);
    const result = swift(keyFirst);
    expect(result.indexOf('GMSServices.provideAPIKey')).toBeLessThan(result.indexOf('factory.startReactNative'));
    expect(stripSwiftInstrumentation(result)).toBe(keyFirst);
  });

  it.each([
    ['missing key', (s: string) => s.replace(`GMSServices.provideAPIKey("${safeKey}")`, '')],
    ['duplicate key', (s: string) => s.replace('    return super.application', `GMSServices.provideAPIKey("${safeKey}")\n    return super.application`)],
    ['multiple calls on one line', (s: string) => s.replace(`GMSServices.provideAPIKey("${safeKey}")`, `GMSServices.provideAPIKey("${safeKey}"); GMSServices.provideAPIKey("${safeKey}")`)],
    ['already assigned key', (s: string) => s.replace('GMSServices.provideAPIKey', 'let originalAcceptance = GMSServices.provideAPIKey')],
    ['key expression', (s: string) => s.replace(`"${safeKey}"`, 'someRuntimeKey')],
    ['key string interpolation', (s: string) => s.replace(safeKey, '\\(someRuntimeKey)')],
    ['changed RN signature', (s: string) => s.replace('withModuleName: "main"', 'withModuleName: "unsupported"')],
    ['second RN start', (s: string) => s.replace(rnCall, rnCall + '\n' + rnCall)],
    ['missing launch method', (s: string) => s.replace('didFinishLaunchingWithOptions launchOptions:', 'wrongOptions launchOptions:')],
    ['missing super return', (s: string) => s.replace('return super.application', 'return changedSuper.application')],
    ['missing official block', (s: string) => s.replace('react-native-maps-init', 'unofficial-map-init')],
    ['CRLF input', (s: string) => s.replace(/\n/g, '\r\n')],
    ['partial marker', (s: string) => s + '// HY3NMapsDiagnostics v1 key.begin\n'],
  ])('fails loudly without leaking the key: %s', (_name, mutate) => {
    let error: Error | undefined;
    try { swift(mutate(swiftFixture)); } catch (caught) { error = caught as Error; }
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('[hy3n-ios-maps-diagnostics]');
    expect(error!.message).not.toContain(safeKey);
  });

  it('does not let a valid marker hide corrupted/repeated instrumentation or added key calls', () => {
    const result = swift(swiftFixture);
    for (const unsafe of [
      result.replace('"accepted": hy3nMapsKeyAccepted', '"accepted": true'),
      result.replace('// HY3NMapsDiagnostics v1 key.end', ''),
      result.replace('let hy3nMapsKeyAccepted = ', 'let hy3nMapsKeyAccepted = false // '),
      result + '\nGMSServices.provideAPIKey("OTHER_TEST_ONLY_KEY")\n',
      result.replace('// HY3NMapsDiagnostics v1 launch.begin', '// HY3NMapsDiagnostics v1 launch.begin\n// HY3NMapsDiagnostics v1 launch.begin'),
    ]) expect(() => swift(unsafe)).toThrow();
  });
});

describe('iOS Maps diagnostics AIRGoogleMap transformation', () => {
  it('brackets the actual installed super initializer and preserves every original byte/return', () => {
    const result = map(mapFixture);
    expect(stripMapInstrumentation(result)).toBe(mapFixture);
    expect(result.match(/\[super initWithOptions:options\]/g)).toHaveLength(1);
    expect(result.match(/return self;/g)).toHaveLength(mapFixture.match(/return self;/g)!.length);
    expect(result.indexOf('@"maps.view.create.begin"')).toBeLessThan(result.indexOf(originalSuper));
    expect(result.indexOf('@"maps.view.create.end"')).toBeGreaterThan(result.indexOf(originalSuper));
    expect(result.indexOf('@"maps.view.create.end"')).toBeLessThan(result.indexOf('    if (self) {'));
    expect(result).toContain('@"created": @(self != nil)');
    expect(result.match(/@"instanceId": hy3nMapsInstanceId/g)).toHaveLength(2);
    expect(result).not.toContain('@try');
    expect(result).not.toContain('@catch');
    expect(map(result)).toBe(result);
  });

  it.each([
    ['missing super', (s: string) => s.replace(originalSuper, '')],
    ['multiple super', (s: string) => s.replace(originalSuper, originalSuper + '\n' + originalSuper)],
    ['different super option', (s: string) => s.replace(originalSuper, '    self = [super initWithOptions:otherOptions];')],
    ['renamed initializer', (s: string) => s.replace('initWithMapId:(NSString *)mapId initialCamera:', 'initWithOtherId:(NSString *)mapId initialCamera:')],
    ['changed return', (s: string) => s.replace('  return self;', '  return nil;')],
    ['missing implementation', (s: string) => s.replace('@implementation AIRGoogleMap', '@implementation OtherMap')],
    ['missing options construction', (s: string) => s.replace('GMSMapViewOptions* options', 'GMSMapViewOptions* otherOptions')],
    ['partial instrumentation', (s: string) => s + '\n// HY3NMapsDiagnostics v1 mapView.begin\n'],
  ])('rejects unsupported map source: %s', (_name, mutate) => expect(() => map(mutate(mapFixture))).toThrow());

  it('validates full instrumentation on repeat instead of trusting a marker', () => {
    const result = map(mapFixture);
    expect(() => map(result.replace('@"created": @(self != nil)', '@"created": @YES'))).toThrow();
    expect(() => map(result.replace(originalSuper, originalSuper + '\n' + originalSuper))).toThrow();
    expect(() => map(result + '\n// HY3NMapsDiagnostics v1 mapView.end\n')).toThrow();
  });
});

describe('native module template and privacy contract', () => {
  const source: string = plugin.getNativeModuleSource();
  it('has a separate pre-bridge +load recorder without overriding RCT module +load', () => {
    const recorder = source.slice(source.indexOf('@implementation HY3NMapsDiagnosticsRecorder'), source.indexOf('@interface HY3NMapsDiagnostics :'));
    const module = source.slice(source.indexOf('@implementation HY3NMapsDiagnostics\n'));
    expect(recorder).toContain('+ (void)load');
    expect(recorder).toContain('addObserver:recorder');
    expect(recorder).toContain('dispatch_once');
    expect(module).toContain('RCT_EXPORT_MODULE(HY3NMapsDiagnostics)');
    expect(module).not.toContain('+ (void)load');
    expect(module).toContain('constantsToExport { return @{@"enabled": @YES}; }');
    expect(module).toContain('RCT_EXPORT_METHOD(getSnapshot:(RCTPromiseResolveBlock)resolve');
    expect(module).toContain('rejecter:(RCTPromiseRejectBlock)reject');
    expect(module).toContain('resolve([[HY3NMapsDiagnosticsRecorder sharedRecorder] snapshot])');
  });

  it('defines the exact schema and only allowed events/details in bounded locked memory', () => {
    expect(source).toContain('HY3NMapsMaximumEvents = 128');
    expect(source).toContain('_events.count < HY3NMapsMaximumEvents');
    expect(source).toContain('NSLock *_lock');
    expect(source).toContain('[_lock lock]');
    expect(source).toContain('[_lock unlock]');
    expect(source).toContain('NSArray *events = [_events copy]');
    expect(source).toContain('_sessionId = [NSUUID UUID].UUIDString');
    expect(source).toContain('systemUptime');
    expect(source).toContain('@"schemaVersion": @1');
    for (const field of ['sessionId', 'bundleIdentifier', 'appVersion', 'buildNumber', 'events', 'name', 'elapsedMs', 'details']) expect(source).toContain(`@"${field}"`);
    const names = [...source.matchAll(/@"((?:launch|reactNative|maps)\.[^"]+)"/g)].map(match => match[1]);
    expect(new Set(names)).toEqual(new Set(events));
    const detailNames = [...source.matchAll(/details\[@"([^"]+)"\]/g)].map(match => match[1]);
    expect(new Set(detailNames)).toEqual(new Set(details));
    expect(source).toContain('![_eventNames containsObject:name]');
    expect(source).toContain('_keyAccepted = [NSNull null]');
    expect(source).toContain('kCFBooleanTrue');
    expect(source).toContain('initWithUUIDString:instanceId');
    expect(source).not.toContain('addEntriesFromDictionary');
  });

  it('contains no actual key or private/swizzling/network/location/durable logging code', () => {
    const executable = source.replace(/\/\/[^\n]*/g, '');
    expect(executable).not.toMatch(/provideAPIKey|GMSApiKey|CLLocation|NSUserDefaults|NSURLSession|NSURLConnection|NSLog|RCTLog|method_exchangeImplementations|dlsym|performSelector|writeToFile/);
    expect(source).not.toMatch(/AIza[A-Za-z0-9_-]{20,}/);
    expect(swiftFixture).toContain(safeKey);
    expect(source).not.toContain(safeKey);
    expect(source).toContain('NOT a server authorization result');
  });
});

// Real installed Xcode project API operating on a minimal object graph. No files
// written, no native generation, no dependency or ignored-ios mutations.
function inMemoryProject() {
  const xcode = require(require.resolve('xcode', { paths: [path.dirname(require.resolve('@expo/config-plugins/package.json'))] }));
  const project = xcode.project('/unused/in-memory.xcodeproj/project.pbxproj');
  project.hash = { project: { objects: {
    PBXProject: { PROJECT: { isa: 'PBXProject', mainGroup: 'ROOT', targets: [{ value: 'APP', comment: 'HY3N' }] }, PROJECT_comment: 'Project object' },
    PBXGroup: { ROOT: { isa: 'PBXGroup', children: [{ value: 'GROUP', comment: 'HY3N' }] }, ROOT_comment: 'Root', GROUP: { isa: 'PBXGroup', name: 'HY3N', sourceTree: '"<group>"', children: [] }, GROUP_comment: 'HY3N' },
    PBXNativeTarget: { APP: { isa: 'PBXNativeTarget', name: 'HY3N', productType: '"com.apple.product-type.application"', buildPhases: [{ value: 'SOURCES', comment: 'Sources' }] }, APP_comment: 'HY3N' },
    PBXSourcesBuildPhase: { SOURCES: { isa: 'PBXSourcesBuildPhase', files: [] }, SOURCES_comment: 'Sources' },
    PBXBuildFile: {}, PBXFileReference: {},
  } } };
  return project;
}

describe('iOS-only registration and actual Expo mod-order contract', () => {
  it('registers only the documented iOS phases, no Android mods, and is run-once', () => {
    const config = plugin({ name: 'HY3N', slug: 'hy3n' }, { enabled: true });
    expect(Object.keys(config.mods)).toEqual(['ios']);
    expect(Object.keys(config.mods.ios).sort()).toEqual(['finalized', 'xcodeproj']);
    const previous = { ...config.mods.ios };
    expect(plugin(config, { enabled: true })).toBe(config);
    expect(config.mods.ios).toEqual(previous);
    expect(plugin.registrationContract.appDelegatePhase).toBe('finalized-after-official-maps');
  });

  it('disabled means no mods, no IO, no registration history; rejects non-boolean options', () => {
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('Unexpected write'); });
    const config = { name: 'HY3N', slug: 'hy3n' };
    expect(plugin(config, { enabled: false })).toBe(config);
    expect(config).not.toHaveProperty('mods');
    expect(config).not.toHaveProperty('_internal');
    expect(write).not.toHaveBeenCalled();
    expect(() => plugin(config, { enabled: 'false' })).toThrow('enabled must be a boolean');
  });

  it('adds the native source to the actual installed PBX application compilation helper in memory, idempotently', async () => {
    const project = inMemoryProject();
    vi.spyOn(expo.IOSConfig.Paths, 'getSourceRoot').mockReturnValue('/fixture/ios/HY3N');
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const config = plugin({ name: 'HY3N', slug: 'hy3n' });
    const mod = config.mods.ios.xcodeproj;
    const run = () => mod({ ...config, modResults: project, modRequest: { projectRoot: '/fixture', platformProjectRoot: '/fixture/ios' } });
    await run();
    await run();
    expect(write).toHaveBeenCalledWith('/fixture/ios/HY3N/HY3NMapsDiagnostics.m', plugin.getNativeModuleSource());
    const refs = Object.entries(project.pbxFileReferenceSection()).filter(([id]) => !id.endsWith('_comment'));
    expect(refs).toHaveLength(1);
    expect(refs[0][1]).toMatchObject({ path: '"HY3N/HY3NMapsDiagnostics.m"', lastKnownFileType: 'sourcecode.c.objc' });
    const builds = Object.entries(project.pbxBuildFileSection()).filter(([id]) => !id.endsWith('_comment'));
    expect(builds).toHaveLength(1);
    expect(builds[0][1]).toMatchObject({ fileRef: refs[0][0] });
    expect(project.hash.project.objects.PBXSourcesBuildPhase.SOURCES.files).toHaveLength(1);
    expect(project.hash.project.objects.PBXSourcesBuildPhase.SOURCES.files[0].value).toBe(builds[0][0]);
  });

  it('fails if an existing PBX source reference has no application compilation entry', async () => {
    const project = inMemoryProject();
    expo.IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: 'HY3N/HY3NMapsDiagnostics.m', groupName: 'HY3N', project });
    project.hash.project.objects.PBXSourcesBuildPhase.SOURCES.files = [];
    vi.spyOn(expo.IOSConfig.Paths, 'getSourceRoot').mockReturnValue('/fixture/ios/HY3N');
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const config = plugin({ name: 'HY3N', slug: 'hy3n' });
    await expect(config.mods.ios.xcodeproj({ ...config, modResults: project, modRequest: { projectRoot: '/fixture', platformProjectRoot: '/fixture/ios' } })).rejects.toThrow('application Sources build phase');
    expect(write).not.toHaveBeenCalled();
  });

  it('runs finalized only after the official AppDelegate action even when automatic Maps was registered later', async () => {
    const order: string[] = [];
    let writtenDelegate = swiftBase;
    const config = plugin({ name: 'HY3N', slug: 'hy3n' });
    // Models official auto Maps registered AFTER the user's plugin using the
    // installed official pure action; no prebuild compiler or native writes.
    expo.withAppDelegate(config, (mod: any) => {
      order.push('official-maps');
      mod.modResults.contents = expo.IOSConfig.Maps.addGoogleMapsAppDelegateInit(mod.modResults.contents, safeKey).contents;
      writtenDelegate = mod.modResults.contents;
      return mod;
    });
    vi.spyOn(expo.IOSConfig.Paths, 'getAppDelegate').mockImplementation(() => {
      order.push('finalized-read');
      return { path: '/fixture/ios/HY3N/AppDelegate.swift', language: 'swift', contents: writtenDelegate };
    });
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const { sortMods } = require('@expo/config-plugins/build/plugins/mod-compiler');
    const phases = sortMods(Object.entries(config.mods.ios), { dangerous: -2, xcodeproj: -1, finalized: 1 });
    expect(phases.map(([name]: [string, unknown]) => name)).toEqual(['xcodeproj', 'appDelegate', 'finalized']);
    // Execute only source actions with in-memory/mod-fixture results. Xcode is
    // tested independently above, never invoke compileModsAsync or prebuild.
    await config.mods.ios.appDelegate({ ...config, modResults: { language: 'swift', contents: swiftBase }, modRequest: { projectRoot: root } });
    await config.mods.ios.finalized({ ...config, modResults: {}, modRequest: { projectRoot: root } });
    expect(order).toEqual(['official-maps', 'finalized-read']);
    expect(write).toHaveBeenCalledWith('/fixture/ios/HY3N/AppDelegate.swift', swift(swiftFixture));
    expect(write).toHaveBeenCalledWith(mapPath, map(mapFixture));
    const compilerSource: string = fs.readFileSync(require.resolve('@expo/config-plugins/build/plugins/mod-compiler'), 'utf8');
    expect(compilerSource).toContain('finalized: 1');
  });

  it('does not write AppDelegate or map source if either transform is unsupported', async () => {
    vi.spyOn(expo.IOSConfig.Paths, 'getAppDelegate').mockReturnValue({ path: '/fixture/AppDelegate.swift', language: 'swift', contents: swiftFixture });
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args: unknown[]) => args[0] === mapPath ? mapFixture.replace(originalSuper, '') : originalRead(...args));
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const config = plugin({ name: 'HY3N', slug: 'hy3n' });
    await expect(config.mods.ios.finalized({ ...config, modResults: {}, modRequest: { projectRoot: root } })).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
