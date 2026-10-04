const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BRAND_MARKER = '// HY3N Dynamic Island wordmark';

/**
 * The maintained Expo Live Activity module provides the ActivityKit extension.
 * This project-specific plugin gives that extension its real HY3N presentation
 * while app.config.ts owns the environment-specific APNs entitlement.
 */
module.exports = function withHy3nLiveActivityBranding(config) {
  return withFinalizedMod(config, ['ios', async (mod) => {
      // Finalized mods run after the package has generated its ActivityKit
      // extension, so this can safely replace only its compact Island artwork.
      // expo-live-activity defaults this entitlement to development. TestFlight
      // requires production APNs in order to accept remote Live Activity updates.
      if (process.env.EAS_BUILD_PROFILE === 'production') {
        const entitlementsPath = path.join(
          mod.modRequest.platformProjectRoot,
          mod.modRequest.projectName,
          `${mod.modRequest.projectName}.entitlements`,
        );
        if (!fs.existsSync(entitlementsPath)) {
          throw new Error('The Rider APNs entitlement file was not generated before Live Activity configuration.');
        }
        const entitlements = fs.readFileSync(entitlementsPath, 'utf8');
        const productionEntitlements = entitlements.replace(
          /(<key>aps-environment<\/key>\s*<string>)development(<\/string>)/,
          '$1production$2',
        );
        if (!productionEntitlements.includes('<key>aps-environment</key>') || !productionEntitlements.includes('<string>production</string>')) {
          throw new Error('The Rider production aps-environment entitlement could not be verified.');
        }
        fs.writeFileSync(entitlementsPath, productionEntitlements);
      }

      // HY3N sends low-priority, throttled ETA updates while a ride is active.
      // Apple requires this flag for Dynamic Island / Lock Screen updates that
      // must remain timely when the Rider backgrounds the app.
      const infoPlistPath = path.join(
        mod.modRequest.platformProjectRoot,
        mod.modRequest.projectName,
        'Info.plist',
      );
      if (!fs.existsSync(infoPlistPath)) {
        throw new Error('The Rider Info.plist was not generated before Live Activity configuration.');
      }
      const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
      const frequentUpdatesInfoPlist = infoPlist.replace(
        /(<key>NSSupportsLiveActivitiesFrequentUpdates<\/key>\s*)<false\/>/,
        '$1<true/>',
      );
      if (!/<key>NSSupportsLiveActivitiesFrequentUpdates<\/key>\s*<true\/>/.test(frequentUpdatesInfoPlist)) {
        throw new Error('The Rider Live Activity frequent-update setting could not be verified.');
      }
      fs.writeFileSync(infoPlistPath, frequentUpdatesInfoPlist);

      const widgetPath = path.join(
        mod.modRequest.platformProjectRoot,
        'LiveActivity',
        'LiveActivityWidget.swift',
      );
      if (!fs.existsSync(widgetPath)) {
        throw new Error('The Expo Live Activity extension was not generated before HY3N branding was applied.');
      }

      let source = fs.readFileSync(widgetPath, 'utf8');
      if (!source.includes(BRAND_MARKER)) {
        const replacement = `compactLeading: {
          ${BRAND_MARKER}
          // Use the bundled HY3N wordmark rather than a generic glyph so the
          // compact Dynamic Island reads as a HY3N trip at a glance.
          resizableImage(imageName: "hy3n_wordmark")
            .frame(width: 62, height: 24)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        } compactTrailing: {`;
        const compactLeading = /compactLeading: \{[\s\S]*?\n\s*\} compactTrailing: \{/;
        if (!compactLeading.test(source)) {
          throw new Error('Could not locate the Expo Live Activity compact Dynamic Island region.');
        }
        source = source.replace(compactLeading, replacement);
        fs.writeFileSync(widgetPath, source);
      }
      return mod;
  }]);
};
