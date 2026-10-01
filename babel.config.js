module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 54's preset otherwise prefers the Worklets plugin when its bundled
    // module metadata is present. This Rider build deliberately uses
    // Reanimated 3.19 on the Legacy Architecture, so the preset must select
    // Reanimated's own Babel plugin instead.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind", reanimated: false, worklets: false }], "nativewind/babel"],
  };
};
