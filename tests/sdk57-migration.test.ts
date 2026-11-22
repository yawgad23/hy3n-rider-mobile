import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const eas = JSON.parse(readFileSync(resolve(root, "eas.json"), "utf8"));
const config = readFileSync(resolve(root, "app.config.ts"), "utf8");

describe("SDK57 scene-lifecycle migration candidate", () => {
  it("uses a scene-capable Expo patch and the matching runtime packages", () => {
    expect(manifest.dependencies.expo).toBe("~57.0.33");
    expect(manifest.dependencies["expo-build-properties"]).toBe("~57.0.23");
    expect(manifest.dependencies["react-native"]).toBe("0.86.3");
    expect(manifest.dependencies.react).toBe("19.2.3");
    expect(manifest.dependencies["react-dom"]).toBe("19.2.3");
    expect(manifest.devDependencies["react-test-renderer"]).toBe("19.2.3");
  });

  it("opts into Expo's real scene support, without a fabricated scene shim", () => {
    expect(config).toMatch(/ios:\s*\{\s*enableSceneSupport:\s*true/);
    expect(config).not.toMatch(/newArchEnabled:\s*(?:true|false)/);
    expect(config).not.toMatch(/edgeToEdgeEnabled:\s*(?:true|false)/);
    expect(config).not.toContain("UIApplicationSceneManifest");
    expect(config).not.toContain("expo-ios-scene-lifecycle-plugin");
    expect(config).not.toMatch(/deploymentTarget:\s*["']27/);
  });

  it("pins stable Xcode27 instead of the floating latest/RC image", () => {
    expect(eas.build.production.ios.image).toBe("macos-tahoe-26.6-xcode-27.0");
    expect(eas.cli.appVersionSource).toBe("local");
  });

  it("uses the SDK-matched New Architecture maps and animation stack", () => {
    expect(manifest.dependencies["react-native-maps"]).toBe("1.27.2");
    expect(manifest.dependencies["react-native-reanimated"]).toBe("4.5.1");
    expect(manifest.dependencies["react-native-worklets"]).toBe("0.10.1");
    expect(manifest.expo.install.exclude).not.toContain("react-native-reanimated");
  });

  it("separates optional compiler adoption without disabling core React checks", () => {
    const lint = readFileSync(resolve(root, "eslint.config.js"), "utf8");
    expect(config).toContain("reactCompiler: false");
    expect(lint).toContain('"react-hooks/rules-of-hooks": "error"');
    expect(lint).toContain('"react-hooks/set-state-in-render": "error"');
    for (const rule of ["immutability", "purity", "refs", "set-state-in-effect", "static-components"]) {
      expect(lint).toContain(`"react-hooks/${rule}": "warn"`);
    }
    expect(lint).not.toMatch(/"react-hooks\/[^\"]+":\s*"off"/);
  });

  it("preserves the deployed backend revision rather than pulling a new backend", () => {
    expect(manifest.dependencies["hy3n-backend"]).toBe(
      "github:yawgad23/backend#275b227a2ddeb2db157b1f6b061ffeea312e6ea1",
    );
  });

  it("uses approved iOS134 while preserving identity, theme, tablets and Android release number", () => {
    expect(config).toContain('const rawBundleId = "com.hy3n.rider"');
    expect(config).toContain('version: "1.0.4"');
    expect(config).toContain('buildNumber: "134"');
    expect(config).toContain("versionCode: 58023");
    expect(config).toContain('userInterfaceStyle: "automatic"');
    expect(config).toContain("supportsTablet: true");
    expect(config).toContain("usesAppleSignIn: true");
    expect(eas.submit.production.ios.ascAppId).toBe("6788405076");
    expect(eas.submit.production.android.track).toBe("production");
  });
});
