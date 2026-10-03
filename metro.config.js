const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const config = getDefaultConfig(__dirname);
// react-native-maps is a native module on iOS and Android. Only the web
// bundle uses the lightweight placeholder, so native Rider releases retain
// MapView, Marker, Polyline, and AnimatedRegion at runtime.
config.resolver = config.resolver || {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-maps" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "lib/react-native-maps-web-stub.js"),
      type: "sourceFile",
    };
  }
  // Force firebase/auth to use the React Native build so getReactNativePersistence is available
  if (moduleName === "firebase/auth" && platform !== "web") {
    return {
      filePath: path.resolve(__dirname, "node_modules/@firebase/auth/dist/rn/index.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
