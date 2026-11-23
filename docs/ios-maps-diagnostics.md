# HY3N Rider iOS Maps: diagnostic-only preparation

**Status:** source preparation and local checks only. This is not a map fix. The persistent blank-map root cause remains unconfirmed. No prebuild, native compilation, EAS build, app upload or submission is authorized by this change.

## Isolation and unchanged behavior

Branch: `diagnostics/ios-maps-observability-20261123`, based on restored main `d86e557b61e4b59fe149bc4a80faea5785d27235` (the restored build-136 source).

The source metadata stays **1.0.5 / iOS build 136 / Android version code 58026**. The previously tested installed iPhone app is **1.0.6 (138)**; these are different artifacts. The preserved source metadata is not an instruction to reuse build 136 for a future upload. Any later diagnostic build needs separate explicit approval and a verified unused iOS build number.

No Maps key, environment variable, production EAS profile, dependency version, Android configuration, fare logic, trip settlement, route geometry or vehicle-motion logic is changed. Android continues receiving its existing `LEGACY` renderer configuration. The diagnostic plugin registers iOS-only mods. The Account entry and diagnostic observations run only when iOS exposes the enabled native diagnostic module; a JS-only update cannot enable them in the existing release.

## What is prepared

- `plugins/withIOSMapsDiagnostics.js` and `plugins/ios-maps-diagnostics/HY3NMapsDiagnostics.m`: a native recorder and future iOS prebuild instrumentation. The plugin preserves the existing single `GMSServices.provideAPIKey` call, its argument and its position. It observes the existing Bool return; it does not call the SDK again or reorder initialization. It observes app launch, React Native start and actual AIRGoogleMap native-view creation. The native module is registered with the app's Xcode Sources phase.
- `lib/maps-diagnostics-store.ts` and `lib/ios-maps-diagnostics.ts`: bounded, whitelisted JS observations and sanitized native snapshots. No personal coordinates, keys, trip/driver IDs or raw error messages are retained in the diagnostic report.
- `components/NativeGoogleMap.tsx`: passive lifecycle, layout, ready-state, tile-finish callback, region-validity and read-only camera observations. Existing map-ready behavior and camera writes are retained. Diagnostic camera failures are isolated.
- `app/maps-diagnostics.tsx` and the gated Account menu: an iPhone-readable screen, an explicitly started minimal map, visual-result buttons, native event order and manual copying of a redacted report.

The minimal map uses fixed public Accra coordinates. It has no custom map style, markers, route overlays, tracking inputs or GPS permission request. It does not book a ride.

## Local checks, not native/device verification

Final local run on 23 November 2026: **72 test files / 411 tests passed**, TypeScript passed, plugin syntax passed and `git diff --check` passed. Scope review confirmed only the diagnostic plugin block was added to app configuration, with no other configuration-value changes.

Run from the Rider repository:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --check plugins/withIOSMapsDiagnostics.js
node node_modules/vitest/vitest.mjs run
git diff --check
```

Tests cover strict/idempotent native source transformations, unchanged key-call order, disabled-plugin behavior, Xcode source registration using Expo's installed Xcode API, privacy whitelists and bounds, native initialization-order interpretation, iOS/Android/release gating, on-demand minimal-map controls, polling cleanup and the existing repository regression suites.

These checks do **not** compile Swift/Objective-C or verify the Maps SDK on a physical iPhone. Native compilation, bridge behavior, actual tiles and physical-device behavior remain unverified. No prebuild is run during this preparation.

## iPhone procedure — only after a separately approved diagnostic binary exists

The currently installed build 138 will not gain these controls from this preparation.

### Test A: minimal map first

1. Force-close and reopen the diagnostic app. Use an existing signed-in session if available.
2. Go straight to **Account → iOS Maps diagnostics**, before opening a destination preview on Home. Opening address-first Home does not intentionally mount its normal map; check the native event history rather than assuming which view was first.
3. Tap **Start minimal map**. Wait 45 seconds and inspect actual streets and labels, not just a ready/loaded indicator.
4. Tap **Minimal streets visible** or **Minimal map blank**, matching what you see.
5. Tap **Copy redacted diagnostic report** before leaving this screen and paste it into this private investigation. Copying is manual; the screen does not send it automatically.

### Test B: normal Home map first

1. Force-close and reopen the diagnostic app again.
2. On Home, choose a destination to display a normal map preview. **Do not request a ride.** Wait 45 seconds and inspect streets and labels.
3. Return to **Account → iOS Maps diagnostics**. Tap **Home streets visible** or **Home map blank**, matching your observation.
4. Copy a second report. A minimal map is optional for this second run; if started, record its visual result too and copy the report again.

Each fresh process has a different native session ID. Record whether the run was minimal-first or Home-first when sharing its report. Visual selections are screen state rather than persisted history: select and copy before navigating away. Missing Home observations may mean the address-first Home never mounted a map, not that a map failed.

## Interpretation and limits

The native recorder preserves the **first 128 events** to retain launch, key-call and first-map history. The JS store retains the **last 160 events**. All data is in memory and is lost if the process exits or crashes. The report contains app identity and an ephemeral process session ID, but not an account identifier.

Compare native event times with native event times only. JS elapsed time uses a separate, unsynchronized clock. Native map instances have UUIDs but no Home/minimal JS surface label; identify the first view using the controlled procedure and recorded event order. History truncation or missing events must not be interpreted as successful initialization.

A `true` key-return Bool is local SDK acceptance, **not proof of server authorization, valid billing or successful tile requests**. `onMapReady` and `onMapLoaded` observations do not by themselves prove visible streets. The screen does not capture native Google SDK authorization/error log messages and cannot catch or recover a native fatal exception.

If minimal streets display while Home stays blank, that narrows investigation toward Home-specific rendering/camera/overlay behavior in that run; it is not a confirmed root cause. If both stay blank, use the observed native initialization order and any independently obtained SDK error messages to choose the next investigation. Do not infer an API-key failure solely from missing callbacks.

Instrumentation can affect timing. A future diagnostic result describes that instrumented binary and process; it does not retrospectively prove what caused blank Maps in old build 138.

## Safe removal before any normal release

This branch must not be merged into restored main or shipped as a normal release without an explicit decision. Reverting the diagnostic commit removes tracked source changes; disabling `{ enabled: true }` makes the plugin register no new mods. **Disabling or deleting the plugin alone does not undo instrumentation already written by a future prebuild.**

For a future normal release, also regenerate the iOS project from a clean non-diagnostic source and use an unpatched `react-native-maps` dependency checkout. Verify AppDelegate, AIRGoogleMap and the Xcode Sources phase no longer contain diagnostic instrumentation/module references. This cleanup is a future requirement; no generated native project or dependency checkout is modified during this preparation.
