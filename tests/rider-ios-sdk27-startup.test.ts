import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reorderGoogleMapsInitialization, configureFirebaseStaticFramework } = require('../plugins/with-rider-ios-sdk27.js');
const launch = `internal import Expo
import GoogleMaps
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    FirebaseApp.configure()
    // @generated begin react-native-maps-init - expo prebuild
    #if canImport(GoogleMaps)
    GMSServices.provideAPIKey("HY3N_TEST_ONLY")
    #endif
    // @generated end react-native-maps-init
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('Rider iOS SDK 27 native startup', () => {
  it('initializes Google Maps exactly once before factory construction and super launch', () => {
    const next = reorderGoogleMapsInitialization(launch);
    expect(next.match(/GMSServices\.provideAPIKey\(/g)).toHaveLength(1);
    expect(next.indexOf('GMSServices.provideAPIKey')).toBeLessThan(next.indexOf('let delegate'));
    expect(next.indexOf('GMSServices.provideAPIKey')).toBeLessThan(next.indexOf('return super.application'));
    expect(next).toContain('ExpoReactNativeFactoryProvider');
    expect(next.match(/FirebaseApp\.configure\(/g)).toHaveLength(1);
    expect(next).toContain('GMSServices.provideAPIKey("HY3N_TEST_ONLY")');
  });

  it('is byte-idempotent when native mods run again', () => {
    const next = reorderGoogleMapsInitialization(launch);
    expect(reorderGoogleMapsInitialization(next)).toBe(next);
  });

  it('fails closed when native Maps initialization is absent or duplicated', () => {
    expect(() => reorderGoogleMapsInitialization(launch.replace('GMSServices.provideAPIKey', 'MissingMaps'))).toThrow('exactly one');
    expect(() => reorderGoogleMapsInitialization(launch + '\nGMSServices.provideAPIKey("DUPLICATE")')).toThrow('exactly one');
  });

  it('does not silently rewrite an unrecognized upstream launch method or marker', () => {
    expect(() => reorderGoogleMapsInitialization(launch.replace('didFinishLaunchingWithOptions', 'unexpectedLaunch'))).toThrow('launch method');
    expect(() => reorderGoogleMapsInitialization(launch.replace(/react-native-maps-init/g, 'unexpected-marker'))).toThrow('startup block');
  });

  it('sets Firebase static frameworks once before the target and retains Maps subspec', () => {
    const original = "require 'json'\ntarget 'HY3N' do\n  pod 'react-native-maps/Google'\nend\n";
    const next = configureFirebaseStaticFramework(original);
    expect(next).toContain('$RNFirebaseAsStaticFramework = true');
    expect(next.indexOf('$RNFirebaseAsStaticFramework')).toBeLessThan(next.indexOf("target 'HY3N'"));
    expect(next).toContain("pod 'react-native-maps/Google'");
    expect(configureFirebaseStaticFramework(next)).toBe(next);
  });

  it('rejects ambiguous framework overrides and malformed native targets', () => {
    expect(() => configureFirebaseStaticFramework("$RNFirebaseAsStaticFramework = false\ntarget 'HY3N' do\nend\n")).toThrow('override');
    expect(() => configureFirebaseStaticFramework("require 'json'\n")).toThrow('target');
  });
});
