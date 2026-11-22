module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind 4.2.7's Babel preset already ends with Reanimated's plugin.
    // Reanimated 4.5.1 forwards that compatibility entry to
    // react-native-worklets/plugin. Disable Expo's automatic injection so the
    // Worklets transform runs once; do not add either plugin a second time.
    presets: [
      [
        "babel-preset-expo",
        { jsxImportSource: "nativewind", reanimated: false, worklets: false },
      ],
      "nativewind/babel",
    ],
  };
};
