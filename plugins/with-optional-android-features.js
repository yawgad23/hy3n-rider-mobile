const { withAndroidManifest } = require('@expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.screen.portrait',
];

/**
 * Keep the Rider UI portrait-only while preventing Google Play from treating
 * portrait capability as a required hardware feature. Some phones, tablets,
 * desktop devices, and Android XR devices do not advertise this feature even
 * though the app can still run correctly on them.
 */
module.exports = function withOptionalAndroidFeatures(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const features = manifest['uses-feature'] || [];

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find(
        (feature) => feature.$?.['android:name'] === name,
      );
      const attributes = {
        ...(existing?.$ || {}),
        'android:name': name,
        'android:required': 'false',
        'tools:replace': 'android:required',
      };

      if (existing) {
        existing.$ = attributes;
      } else {
        features.push({ $: attributes });
      }
    }

    manifest['uses-feature'] = features;
    return androidConfig;
  });
};
