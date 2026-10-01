/**
 * Google Sign-In documents a scoped modular-header fix for the two pods that
 * AppCheckCore requires as Swift static-library dependencies. Applying
 * `use_modular_headers!` globally also modularizes React Native's source pods,
 * which can create duplicate `react_runtime` module maps on the SDK 54 legacy
 * architecture/Xcode 26 path. Keep this workaround limited to the two pods
 * named by the Google Sign-In integration guide.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# @generated begin google-signin-modular-headers';

module.exports = function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (contents.includes(MARKER)) {
        return config;
      }

      const snippet = `  ${MARKER}\n  pod 'GoogleUtilities', :modular_headers => true\n  pod 'RecaptchaInterop', :modular_headers => true\n  # @generated end google-signin-modular-headers\n`;
      const targetRegex = /(target ['"][^'"]+['"] do\s*\n)/;
      if (!targetRegex.test(contents)) {
        throw new Error('Could not locate the application target in the generated Podfile');
      }

      contents = contents.replace(targetRegex, `$1${snippet}`);
      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
