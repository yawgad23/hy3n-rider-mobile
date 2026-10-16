const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TRIP_PROGRESS_WIDGET_MARKER = '// HY3N trip-progress presentation v3';
const TRIP_PROGRESS_LOCK_SCREEN_MARKER = '// HY3N trip-progress Lock Screen presentation v3';

function replaceRequired(source, startMarker, endMarker, replacement, description) {
  const start = source.indexOf(startMarker);
  const end = start === -1 ? -1 : source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not locate the Expo Live Activity ${description}.`);
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function brandedWidgetSource(source) {
  if (source.includes(TRIP_PROGRESS_WIDGET_MARKER)) return source;

  const replacement = `    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading, priority: 1) {
          ${TRIP_PROGRESS_WIDGET_MARKER}
          hy3nExpandedTripText(
            title: context.state.title,
            subtitle: context.state.subtitle,
            endDate: context.state.timerEndDateInMilliseconds
          )
          .dynamicIsland(verticalPlacement: .belowIfTooWide)
          .padding(.leading, 5)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
        DynamicIslandExpandedRegion(.bottom) {
          hy3nTripProgress(
            progress: context.state.progress ?? 0,
            progressViewTint: context.attributes.progressViewTint
          )
          .padding(.horizontal, 5)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
      } compactLeading: {
        // The compact Island remains intentionally simple: the original HY3N
        // vehicle identifies the trip while the live ETA stays on the right.
        resizableImage(imageName: "hy3n_trip_car")
          .frame(width: 25, height: 15)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      } compactTrailing: {
        if let date = context.state.timerEndDateInMilliseconds {
          hy3nArrivalTime(endDate: date)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
      } minimal: {
        resizableImage(imageName: "hy3n_trip_car")
          .frame(width: 18, height: 12)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      }
    }
    }

    private func hy3nArrivalTime(endDate: Double) -> some View {
      Text(Date(timeIntervalSince1970: endDate / 1000), style: .time)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(.white)
        .monospacedDigit()
        .frame(maxWidth: 56, alignment: .trailing)
    }

    private func hy3nExpandedTripText(title: String, subtitle: String?, endDate: Double?) -> some View {
      VStack(alignment: .leading, spacing: 2) {
        Text("HY3N")
          .font(.caption2.weight(.bold))
          .tracking(0.8)
          .foregroundStyle(Color(hex: "D4AF37"))
        Text(title)
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        if let subtitle {
          Text(subtitle)
            .font(.caption)
            .foregroundStyle(.white.opacity(0.72))
            .lineLimit(1)
        }
        if let endDate {
          hy3nArrivalTime(endDate: endDate)
            .foregroundStyle(Color(hex: "D4AF37"))
        }
      }
    }

    private func hy3nTripProgress(progress: Double, progressViewTint: String?) -> some View {
      GeometryReader { proxy in
        let clampedProgress = min(max(progress, 0), 1)
        let carWidth: CGFloat = 36
        let carHeight: CGFloat = 18
        // The vehicle's centre, rather than its leading edge, is the actual
        // route position. That keeps the line visibly running through the
        // middle of the owned top-down HY3N car, like a route progress marker.
        let routePosition = proxy.size.width * clampedProgress
        let carOffset = min(
          max(0, routePosition - carWidth / 2),
          max(0, proxy.size.width - carWidth)
        )
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.22))
            .frame(height: 6)
          Capsule()
            .fill(progressViewTint.map { Color(hex: $0) } ?? Color(hex: "D4AF37"))
            .frame(width: max(0, min(proxy.size.width, routePosition)), height: 6)
          resizableImage(imageName: "hy3n_trip_car")
            .frame(width: carWidth, height: carHeight)
            .offset(x: carOffset)
            .animation(.easeInOut(duration: 0.65), value: clampedProgress)
        }
        .frame(height: 22, alignment: .center)
      }
      .frame(height: 22)
    }
`;

  return replaceRequired(
    source,
    '    } dynamicIsland: { context in',
    '  @ViewBuilder\n  private func compactTimer',
    replacement,
    'Dynamic Island layout',
  );
}

function brandedLockScreenSource(source) {
  if (source.includes(TRIP_PROGRESS_LOCK_SCREEN_MARKER)) return source;

  const replacement = `    ${TRIP_PROGRESS_LOCK_SCREEN_MARKER}
    private var hy3nDisplayProgress: Double {
      min(max(contentState.progress ?? 0, 0), 1)
    }

    private func hy3nTripProgressLine(progress: Double) -> some View {
      GeometryReader { proxy in
        let carWidth: CGFloat = 42
        let carHeight: CGFloat = 21
        // Keep the car centred on the exact journey point. The coloured line
        // ends under its centre instead of looking like the car has fallen to
        // one side of the track.
        let routePosition = proxy.size.width * progress
        let carOffset = min(
          max(0, routePosition - carWidth / 2),
          max(0, proxy.size.width - carWidth)
        )
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.22))
            .frame(height: 7)
          Capsule()
            .fill(progressViewTint ?? Color(hex: "D4AF37"))
            .frame(width: max(0, min(proxy.size.width, routePosition)), height: 7)
          // This is an owned HY3N vehicle asset, not a third-party ride-hailing
          // mark. It advances only when the server sends lower remaining distance.
          resizableImage(imageName: "hy3n_trip_car")
            .frame(width: carWidth, height: carHeight)
            .offset(x: carOffset)
            .animation(.easeInOut(duration: 0.65), value: progress)
        }
        .frame(height: 27, alignment: .center)
      }
      .frame(height: 27)
    }

    var body: some View {
      let defaultPadding = 24
      let top = CGFloat(
        attributes.paddingDetails?.top
          ?? attributes.paddingDetails?.vertical
          ?? attributes.padding
          ?? defaultPadding
      )
      let bottom = CGFloat(
        attributes.paddingDetails?.bottom
          ?? attributes.paddingDetails?.vertical
          ?? attributes.padding
          ?? defaultPadding
      )
      let leading = CGFloat(
        attributes.paddingDetails?.left
          ?? attributes.paddingDetails?.horizontal
          ?? attributes.padding
          ?? defaultPadding
      )
      let trailing = CGFloat(
        attributes.paddingDetails?.right
          ?? attributes.paddingDetails?.horizontal
          ?? attributes.padding
          ?? defaultPadding
      )

      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 3) {
            Text("HY3N")
              .font(.caption.weight(.bold))
              .tracking(1)
              .foregroundStyle(progressViewTint ?? Color(hex: "D4AF37"))
            Text(contentState.title)
              .font(.title3.weight(.semibold))
              .lineLimit(1)
              .minimumScaleFactor(0.78)
              .modifier(ConditionalForegroundViewModifier(color: attributes.titleColor))
            if let subtitle = contentState.subtitle {
              Text(subtitle)
                .font(.subheadline)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .modifier(ConditionalForegroundViewModifier(color: attributes.subtitleColor))
            }
          }
          Spacer(minLength: 4)
          if let date = contentState.timerEndDateInMilliseconds {
            Text(Date(timeIntervalSince1970: date / 1000), style: .time)
              .font(.headline.weight(.semibold))
              .foregroundStyle(progressViewTint ?? Color(hex: "D4AF37"))
              .monospacedDigit()
              .multilineTextAlignment(.trailing)
          }
        }
        hy3nTripProgressLine(progress: hy3nDisplayProgress)
      }
      .padding(EdgeInsets(top: top, leading: leading, bottom: bottom, trailing: trailing))
    }
`;

  // LiveActivityView.swift also has a small DebugLog view with its own body.
  // Start after the actual LiveActivityView declaration so the custom Lock
  // Screen layout cannot ever be inserted into that debug helper.
  const liveActivityViewStart = source.indexOf('struct LiveActivityView: View {');
  const bodyStart = liveActivityViewStart === -1
    ? -1
    : source.indexOf('    var body: some View {', liveActivityViewStart);
  const viewEnd = source.lastIndexOf('\n  }\n\n#endif');
  if (bodyStart === -1 || viewEnd === -1 || viewEnd <= bodyStart) {
    throw new Error('Could not locate the Expo Live Activity Lock Screen layout.');
  }
  return `${source.slice(0, bodyStart)}${replacement}${source.slice(viewEnd + 1)}`;
}

/**
 * The maintained Expo Live Activity module provides the ActivityKit extension.
 * This project-specific plugin gives the Lock Screen and Dynamic Island an
 * original HY3N trip-progress presentation. It receives display-only ETA and
 * remaining-route progress; it has no fare, wallet, or ride-state authority.
 */
module.exports = function withHy3nLiveActivityBranding(config) {
  return withFinalizedMod(config, ['ios', async (mod) => {
    // Finalized mods run after the package has generated its ActivityKit
    // extension, so this can safely replace only the module's two view files.
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

    // HY3N sends throttled ETA updates while a ride is active. Apple requires
    // this flag for timely Dynamic Island / Lock Screen updates in the background.
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
    const lockScreenPath = path.join(
      mod.modRequest.platformProjectRoot,
      'LiveActivity',
      'LiveActivityView.swift',
    );
    if (!fs.existsSync(widgetPath) || !fs.existsSync(lockScreenPath)) {
      throw new Error('The Expo Live Activity extension views were not generated before HY3N branding was applied.');
    }

    fs.writeFileSync(widgetPath, brandedWidgetSource(fs.readFileSync(widgetPath, 'utf8')));
    fs.writeFileSync(lockScreenPath, brandedLockScreenSource(fs.readFileSync(lockScreenPath, 'utf8')));
    return mod;
  }]);
};
