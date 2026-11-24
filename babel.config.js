module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 57 uses Reanimated 4 and its supported Worklets plugin. Android's
    // released SDK 54/legacy configuration stays on its separate release branch.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
