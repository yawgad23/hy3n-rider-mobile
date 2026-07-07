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
 * This patches the generated Podfile's post_install hook to force
 * DEFINES_MODULE = YES on exactly those three pod targets (the same effect
 * CocoaPods' own `:modular_headers => true` has), since expo-build-properties
 * has no option to target arbitrary third-party pods.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODULAR_HEADER_PODS = ['AppCheckCore', 'GoogleUtilities', 'RecaptchaInterop'];
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

      const snippet = `  ${MARKER}
  installer.pods_project.targets.each do |target|
    if ${JSON.stringify(MODULAR_HEADER_PODS)}.include?(target.name)
      target.build_configurations.each do |bc|
        bc.build_settings['DEFINES_MODULE'] = 'YES'
      end
    end
  end
  # @generated end modular-headers-fix
`;

      const postInstallRegex = /(post_install do \|installer\|\n)/;
      if (postInstallRegex.test(contents)) {
        contents = contents.replace(postInstallRegex, `$1${snippet}`);
      } else {
        contents += `\npost_install do |installer|\n${snippet}end\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
