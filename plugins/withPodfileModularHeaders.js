/**
 * expo-build-properties' `useModularHeaders` only enables modular headers for
 * Expo's own pods (ExpoModulesCore, React-Core, etc.) — it doesn't touch
 * third-party pods. @react-native-google-signin/google-signin pulls in
 * AppCheckCore, which depends on GoogleUtilities and RecaptchaInterop; none
 * of the three define modules, and CocoaPods refuses to build them as
 * static libraries without it:
 *
 *   [!] The following Swift pods cannot yet be integrated as static
 *   libraries: The Swift pod `AppCheckCore` depends upon `GoogleUtilities`
 *   and `RecaptchaInterop`, which do not define modules.
 *
 * A post_install hook is too late to fix this — CocoaPods validates static-
 * library integration during dependency resolution, before post_install
 * ever runs. The only place this can be fixed is the Podfile's own
 * top-level DSL, which is what CocoaPods' error message itself suggests
 * first: `use_modular_headers!` globally, before any `target` block.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# @generated begin modular-headers-fix';

module.exports = function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (contents.includes(MARKER)) {
        return config;
      }

      const snippet = `${MARKER}\nuse_modular_headers!\n# @generated end modular-headers-fix\n\n`;

      const targetRegex = /(target ['"])/;
      if (targetRegex.test(contents)) {
        contents = contents.replace(targetRegex, `${snippet}$1`);
      } else {
        contents = snippet + contents;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
