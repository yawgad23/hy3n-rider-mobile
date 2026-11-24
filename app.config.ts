// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.hy3n.rider";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
// Native Maps SDK keys are public by design once compiled into an app, so they
// must be separately restricted in Google Cloud. They are injected only by
// EAS at build time and must never reuse the server-only Routes API key.
const nativeGoogleMaps = {
  iosApiKey:
    process.env.GOOGLE_MAPS_IOS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS?.trim() ||
    "",
  androidApiKey:
    process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID?.trim() ||
    "",
};

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "HY3N",
  appSlug: "hy3n-mobile-app",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663767879005/DOmuRrvQQNqEEdHe.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: "yawgad",
  version: "1.0.6",
  extra: {
    eas: {
      projectId: "0b06ad22-f4a1-4aa7-aab6-0e03237ad63c",
    },
  },
  orientation: "portrait",
  icon: "./assets/images/rider-ios-icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  // This isolated iOS SDK 27 branch uses SDK 57's required New Architecture
  // and its compatible native Maps package. The Android release keeps the
  // validated SDK 54/legacy graph on its separate release branch.
  ios: {
    // Tell Expo/EAS to enable the Sign in with Apple capability and provision
    // the App ID/profile accordingly; a raw entitlement alone is insufficient.
    usesAppleSignIn: true,
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    // Fresh TestFlight identity; never reuse an already uploaded build number.
    buildNumber: "139",
    googleServicesFile: "./firebase/GoogleService-Info.plist",
    // TestFlight/App Store archives need production APNs for remote Live
    // Activity updates; development profiles retain the development endpoint.
    entitlements: {
      "aps-environment":
        process.env.EAS_BUILD_PROFILE === "production"
          ? "production"
          : "development",
      "com.apple.developer.applesignin": ["Default"],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSContactsUsageDescription:
        "HY3N uses the contact you choose to fill in a passenger name and phone number when you book a ride for someone else.",
      NSPhotoLibraryUsageDescription:
        "HY3N uses your selected photo as your Rider profile picture.",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0A0A0A",
      // Keep the Android launcher artwork aligned with the iOS app icon.
      foregroundImage: "./assets/images/rider-android-adaptive-foreground.png",
      backgroundImage: "./assets/images/rider-adaptive-background.png",
      monochromeImage: "./assets/images/rider-adaptive-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    // Incremented for the Android pickup lifecycle recovery release.
    versionCode: 58027,
    googleServicesFile: "./firebase/google-services.json",
    ...(nativeGoogleMaps.androidApiKey
      ? { config: { googleMaps: { apiKey: nativeGoogleMaps.androidApiKey } } }
      : {}),
    // This explicit allow-list replaces Expo's default permissions. Keep both
    // foreground location permissions here so expo-location can obtain GPS.
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "POST_NOTIFICATIONS",
      "READ_CONTACTS",
    ],
    blockedPermissions: ["android.permission.WRITE_CONTACTS"],
    intentFilters: [
      {
        action: "VIEW",
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
    name: "HY3N Rider",
    shortName: "HY3N",
    description: "Ghana's premium ride-hailing app",
    themeColor: "#D4AF37",
    backgroundColor: "#0A0A0A",
    lang: "en",
  },
  plugins: [
    // Expo composes native mods inside-out: register this before Maps so its
    // validation/reordering sees the complete generated native startup block.
    "./plugins/with-rider-ios-sdk27",
    "expo-router",
    ["react-native-maps", { iosGoogleMapsApiKey: nativeGoogleMaps.iosApiKey }],
    "expo-apple-authentication",
    "expo-asset",
    "expo-audio",
    "expo-font",
    "expo-notifications",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "HY3N uses your location to set your pickup point and connect you with nearby drivers.",
      },
    ],
    "./plugins/with-optional-android-features",
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    [
      "expo-live-activity",
      {
        // Create the ActivityKit extension and request token-based remote
        // updates. The app uses a HY3N-specific follow-up plugin below.
        enablePushNotifications: true,
      },
    ],
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: "com.googleusercontent.apps.362594902321-tesfioc66munsekhq8ghb5jvkkhk94m5",
      },
    ],
    "expo-video",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/rider-splash-logo.png",
        imageWidth: 220,
        resizeMode: "contain",
        backgroundColor: "#0a0a0a",
        dark: {
          backgroundColor: "#0a0a0a",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.4",
          enableSceneSupport: true,
          useHermesV1: true,
          usePrecompiledModules: false,
          // Firebase 25.1's CocoaPods integration with RN's prebuilt core.
          useFrameworks: "static",
          forceStaticLinking: ["RNFBApp", "RNFBMessaging"],
        },
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          compileSdkVersion: 36,
          minSdkVersion: 24,
          targetSdkVersion: 36,
        },
      },
    ],
    ["./plugins/withPodfileModularHeaders", {}],
    ["./plugins/withHy3nLiveActivityBranding", {}],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
