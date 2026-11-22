import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const root = process.cwd();
const requireFromProject = createRequire(resolve(root, "package.json"));
const source = (file: string) => readFileSync(resolve(root, file), "utf8");

function babelConfig() {
  const module = { exports: undefined as any };
  runInNewContext(source("babel.config.js"), { module });
  const cache = vi.fn();
  const config = module.exports({ cache });
  return { config, cache };
}

// Published-source verification, not a claim of native/runtime validation:
// NativeWind 4.2.7 supports SDK 57 and pins react-native-css-interop 0.2.7.
// https://www.nativewind.dev/docs/getting-started/installation
// Its preset ends with the Reanimated compatibility alias, which Reanimated
// 4.5.1 forwards to react-native-worklets/plugin. Do not inject it twice.
// https://unpkg.com/react-native-css-interop@0.2.7/babel.js
// https://unpkg.com/react-native-reanimated@4.5.1/plugin/index.js

describe("SDK 57 styling configuration", () => {
  it("keeps NativeWind v4 JSX styling and one preset-owned animation transform", () => {
    const { config, cache } = babelConfig();
    expect(cache).toHaveBeenCalledWith(true);
    expect(config.presets).toEqual([
      [
        "babel-preset-expo",
        { jsxImportSource: "nativewind", reanimated: false, worklets: false },
      ],
      "nativewind/babel",
    ]);
    expect(config.plugins ?? []).toEqual([]);
  });

  it("keeps the animation plugin last inside the NativeWind preset", () => {
    const nativewindPreset = requireFromProject("nativewind/babel")();
    const animationPlugins = nativewindPreset.plugins.filter((plugin: any) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return (
        typeof name === "string" &&
        /react-native-(reanimated|worklets)\/plugin/.test(name)
      );
    });
    expect(animationPlugins).toEqual(["react-native-reanimated/plugin"]);
    expect(nativewindPreset.plugins.at(-1)).toBe(
      "react-native-reanimated/plugin",
    );
  });

  it("executes JSX styling and a captured worklet with the installed JS toolchain", () => {
    // This executes whichever dependencies are installed. A pass on the shared
    // SDK 54 toolchain does not verify an uninstalled SDK 57 native dependency graph.
    const babel = requireFromProject("@babel/core");
    const { config } = babelConfig();
    const transformed = babel.transformSync(
      `import { View } from "react-native";
       const opacity = 0.5;
       export const animatedStyle = () => { "worklet"; return { opacity }; };
       export const card = <View className="bg-background dark:bg-surface rounded-2xl" />;`,
      {
        ...config,
        cwd: root,
        // The plugin reads this existing path for source maps. No fixture file
        // or application source is created or modified by transformSync.
        filename: resolve(root, "app/_layout.tsx"),
        babelrc: false,
        configFile: false,
        caller: {
          name: "metro",
          platform: "ios",
          supportsStaticESM: true,
          isDev: true,
        },
      },
    );
    expect(transformed.code).toMatch(
      /(?:nativewind|react-native-css-interop)\/jsx(?:-dev)?-runtime/,
    );
    expect(transformed.code).toContain(
      "bg-background dark:bg-surface rounded-2xl",
    );
    expect(transformed.code).toContain("__workletHash");
    expect(transformed.code).toContain("__closure");
    expect(transformed.code).not.toMatch(/["']worklet["'];/);
  });

  it("wraps existing Metro CSS configuration without invoking generators", () => {
    const module = { exports: undefined as any };
    const base = { resolver: {} as any };
    const withNativeWind = vi.fn((config, options) => ({ config, options }));
    const mockRequire = (name: string) => {
      if (name === "expo/metro-config") return { getDefaultConfig: () => base };
      if (name === "nativewind/metro") return { withNativeWind };
      if (name === "path") return requireFromProject("node:path");
      throw new Error(`Unexpected Metro dependency: ${name}`);
    };
    runInNewContext(source("metro.config.js"), {
      module,
      require: mockRequire,
      __dirname: root,
    });
    expect(withNativeWind).toHaveBeenCalledOnce();
    expect(module.exports.config).toBe(base);
    expect(module.exports.options).toEqual({
      input: "./global.css",
      forceWriteFileSystem: true,
    });
    const fallback = vi.fn(() => ({
      type: "sourceFile",
      filePath: "original-module.js",
    }));
    const context = { resolveRequest: fallback };
    const resolver = base.resolver.resolveRequest;
    expect(resolver(context, "react-native-maps", "web").filePath).toBe(
      resolve(root, "lib/react-native-maps-web-stub.js"),
    );
    resolver(context, "react-native-maps", "ios");
    expect(fallback).toHaveBeenLastCalledWith(
      context,
      "react-native-maps",
      "ios",
    );
    expect(resolver(context, "firebase/auth", "ios").filePath).toBe(
      resolve(root, "node_modules/@firebase/auth/dist/rn/index.js"),
    );
    resolver(context, "firebase/auth", "web");
    expect(fallback).toHaveBeenLastCalledWith(context, "firebase/auth", "web");
  });

  it("preserves Tailwind 3 directives, custom colors, and the v4 preset", () => {
    const css = source("global.css");
    expect(css).toContain("@tailwind base;");
    expect(css).toContain("@tailwind components;");
    expect(css).toContain("@tailwind utilities;");
    const tailwind = source("tailwind.config.js");
    expect(tailwind).toContain('require("nativewind/preset")');
    expect(tailwind).toContain('darkMode: "class"');
    expect(tailwind).toContain("var(--color-${name})");
    expect(tailwind).toContain("light: swatch.light");
    expect(tailwind).toContain("dark: swatch.dark");
  });

  it("retains the existing v4 Pressable remapping safeguard", () => {
    expect(source("lib/_core/nativewind-pressable.ts")).toContain(
      "remapProps(Pressable, { className: false });",
    );
    expect(source("app/_layout.tsx")).toContain("nativewind-pressable");
  });

  it("retains system appearance subscription and both variable palettes", () => {
    // Keep native Appearance following the system instead of pinning it to
    // the last observed light/dark value in NativeWind's setter.
    const theme = source("lib/theme-provider.tsx");
    expect(theme).toContain("useColorScheme as useSystemColorScheme");
    expect(theme).toContain(
      'useSystemColorScheme() === "dark" ? "dark" : "light"',
    );
    expect(theme).toContain("[colorScheme]");
    expect(theme).toContain(
      'nativewindColorScheme.set(Platform.OS === "web" ? colorScheme : "system")',
    );
    expect(theme).not.toContain("nativewindColorScheme.set(colorScheme)");
    expect(theme).not.toContain("AsyncStorage");
    for (const token of [
      "primary",
      "background",
      "surface",
      "foreground",
      "muted",
      "border",
      "success",
      "warning",
      "error",
    ]) {
      expect(theme).toContain(
        `"color-${token}": SchemeColors[colorScheme].${token}`,
      );
    }
  });
});
