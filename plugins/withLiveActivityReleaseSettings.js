const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

/**
 * The Live Activity package creates the extension and its initial development
 * push entitlement. Store/TestFlight signing needs the production entitlement,
 * while local development builds continue to use development APNs.
 */
module.exports = function withLiveActivityReleaseSettings(config) {
  const isStoreBuild = process.env.EAS_BUILD_PROFILE === 'production';

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['aps-environment'] = isStoreBuild ? 'production' : 'development';
    return mod;
  });

  return withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return mod;
  });
};
