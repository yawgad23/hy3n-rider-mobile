# HY3N Rider SDK57 scene-lifecycle migration

**Build134 authorization update:** On November22,2026 at11:36UTC, the user explicitly approved one SDK57/Xcode27 Rider1.0.4(134) iOS build and upload of that exact successful build to TestFlight. Source now assigns iOS134; Android58023 remains unchanged. No automatic paid retry, Android build, Apple App Review submission or store-availability change is authorized. The preparation notes below describe the earlier source-only stage; native build and physical-device results must be reported separately rather than inferred from source CI.

The SDK migration is prepared on `task/rider-xcode27-configuration-20261122`, based on Rider main commit `33d7666192444817246acd3fe26357eeb964d1b8`. This is a source-only candidate, not a released app. No new EAS build, native prebuild, upload, store submission, or Android deployment was started. Main and the delivered Rider1.0.4 build133 remain unchanged.

Build133 is already valid and available to internal TestFlight testers. Apple’s ITMS-90725 warning concerns its older build SDK; source changes cannot remove the warning from that existing binary. A later, separately approved Xcode27/iOS27-SDK binary will be needed. Do not rebuild133: this preparation branch intentionally retains the existing release numbers until a new build is authorized and an unused iOS build number is assigned.

## Supported scene-lifecycle configuration

The candidate uses Expo57.0.33, React Native0.86.3 and React19.2.3, with Expo’s matching native dependency catalog. `expo-build-properties`57.0.23 enables `ios.enableSceneSupport: true`. Expo’s supported SDK57 option requires Expo57.0.23 or newer. It generates the scene manifest and moves window/React Native startup into Expo’s scene runtime; declaring a scene protocol or installing an unverified SDK54 shim would not be equivalent.[1] [2]

The production iOS profile pins the stable `macos-tahoe-26.6-xcode-27.0` image, not the floating latest/Xcode27.1 release-candidate image. Raising the app’s minimum OS to27 was not used as a substitute for building against the new SDK.[3]

SDK55 and newer cannot retain the old Legacy Architecture workaround. Removed `newArchEnabled` and `android.edgeToEdgeEnabled` settings are omitted, as required by the newer framework. The New Architecture and Android edge-to-edge behavior are mandatory. SDK56 also raises the supported iOS minimum to16.4; older iOS devices must therefore be considered when deciding to release this migration. Existing Android minSdk24 and compile/target SDK36 settings are preserved.[4] [5]

## Authentication, maps, styling and Live Activities

The Apple package is SDK-matched57.0.2, not an unsupported cross-SDK58 package. Its relevant native source still contains the older presentation behavior, so the reviewed safety backport remains necessary. The script now checks exact Apple57.0.2/Core57.0.26 versions and source hashes before any write. It retains main-queue execution, foreground-active visible-window selection, a retained presentation anchor, and catchable errors instead of a fatal presentation trap. Writes use replacement files rather than altering pnpm-store hardlinks. The preflight checks capabilities, scene configuration and native source autolinking; these checks are not proof of a signed binary or successful physical-device authentication.[6]

`lib/apple-sign-in.ts` and `lib/firebase.ts` are unchanged. Fresh nonce/token checks, cancellation handling, returning-user name/email preservation, saved Firebase sessions, mandatory profile completion and server-owned phone/email uniqueness remain intact. The existing profile-photo regression suite is retained.

Maps use the SDK-matched1.27.2 release and its config plugin with the existing platform-restricted EAS key resolution. The audit found and corrected invalid native coordinate coercion, dropped bends in booking-route framing, stale animation callbacks after unmount, and public camera commands issued before map readiness. Server route geometry, travelled-route trimming, vehicle artwork, dark map styling and Android’s Google renderer selection remain intact. Version compatibility declarations do not establish that the previous Fabric native crash is resolved on Rider devices. iOS Google camera duration behavior and Android marker rendering require particular attention during native testing.[7]

NativeWind stays on stable v4.2.7, which documents SDK57 support, with its exact css-interop0.2.7 dependency and Tailwind3. The matching Reanimated4.5.1/Worklets0.10.1 stack replaces the previous Reanimated3 exclusion. NativeWind already owns the animation Babel transform, so a duplicate plugin was not added. Native appearance now stays in `system` mode rather than pinning the last observed light/dark value; web palette/class updates remain unchanged.[8]

The iOS adaptive Home-category layout and Android’s compact Home dimensions are unchanged from the delivered fix. System colors and tablet support are preserved.

Live Activities retain exact `expo-live-activity`0.4.2 and existing HY3N native/branding/terminal-state safeguards. Published-source fixtures confirm that the module’s APIs remain available in Core57 and that the widget extension does not inherit the app’s Expo scene runtime. However, this third-party package is now deprecated; retaining it is a least-change compatibility decision, not a claim of vendor support. Its synchronous JavaScript stop method starts an unawaited Swift task, so JavaScript success alone still does not prove ActivityKit dismissal.[9]

The backend dependency remains at revision `275b227a2ddeb2db157b1f6b061ffeea312e6ea1`. tRPC server/client versions are pinned to11.7.2 to prevent an unrelated backend/peer refresh during SDK resolution. Expo Router imports were migrated to its own supported entry points, and unused external React Navigation dependencies were removed.[10]

The final SDK57 type corrections use the public `expo-router/react-navigation` entry for `PlatformPressable`, widen native icon/tab colors to React Native `ColorValue`, extract string symbol names from the newer string/object union, declare CSS side-effect assets for TypeScript6 and replace removed `absoluteFillObject` with equivalent `absoluteFill`. The Apple autolinking preflight now recognizes SDK57's module records such as `{ name: null, class: "AppleAuthenticationModule" }`, while preserving negative checks for a missing or wrong native module.[11] [12]

## Validation and release gates

Clean GitHub source-only CI at code commit `ae068244702876cdcc2cd2bf38fb58578396d6ca` passed on November22,2026: [run45016339346](https://github.com/yawgad23/hy3n-rider-mobile/actions/runs/45016339346). It installed the frozen actual SDK57 graph, passed `expo install --check`, verified Apple native-source patching, capabilities, scenes and native autolinking, passed the full TypeScript check, and passed **347 tests in71 files**. Lint passed with **0 errors and164 warnings**, not a zero-warning result. A subsequent documentation-only commit does not change the validated code; its own CI result must be distinguished from this code-commit result.

SDK57 exposes additional React Compiler diagnostics through its updated recommended lint configuration. Compiler adoption is a separate refactor, so `experiments.reactCompiler` is explicitly `false`. The five compiler-readiness rules—immutability, purity, refs, set-state-in-effect and static-components—remain visible as warnings rather than being disabled. Core `rules-of-hooks` and `set-state-in-render` remain errors. Regression tests protect that policy. The remaining warnings must be resolved or consciously reviewed before any broader compiler adoption; this migration is not described as lint-clean.[13]

Local source regressions also passed347 tests using the restored SDK54 JavaScript tooling with published SDK57 fixtures and mocked native boundaries. Those local results are distinct from the clean CI's installed SDK57 dependency/type checks. Neither proves native compilation, signed entitlements, scene behavior, or that the earlier Apple/Maps crashes are fixed on physical devices. No TestFlight or Play Store workflow is dispatched by this branch push.

During local lockfile preparation, pnpm removed task-overlay dependency links before its paused operation was interrupted. The original dependency directory and repository source stayed intact. The task-owned SDK54 overlay links and its exact Apple8.0.8 safety backport were restored; subsequent lock resolution uses fresh temporary directories without shared dependency links. No production app or delivered binary was affected.

Before a future release, obtain separate build approval, assign an unused build number and perform native compilation and binary/capability checks. Then test physical iPhone and iPad cold launch, foreground/background and window transitions, cold/warm links, Apple new/returning-user sign-in and cancellation, saved sessions, profile-photo selection/upload with permissions granted/denied, maps mid-animation completion/cancellation/remount, and Live Activity token updates/dismissal. Android needs location, Google login, Home visibility, maps/vehicle markers, permissions and completion-sheet regressions because the framework upgrade is shared. Examine native crash logs for the previous ObjC/TurboModule/Fabric abort. Do not submit to Apple App Review before the required physical-device checks are verified.

## References

[1]: https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md "Official Expo UIKit scene lifecycle migration"
[2]: https://expo.dev/changelog/sdk-57 "Expo SDK57 release and scene-support requirements"
[3]: https://docs.expo.dev/build-reference/infrastructure/ "EAS build infrastructure and Xcode images"
[4]: https://expo.dev/changelog/sdk-55 "SDK55 removed architecture and edge-to-edge switches"
[5]: https://expo.dev/changelog/sdk-56 "SDK56 minimum iOS and tooling changes"
[6]: https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-57.0.2.tgz "Published SDK57 Apple authentication source"
[7]: https://github.com/react-native-maps/react-native-maps/tree/v1.27.2 "React Native Maps1.27.2 source and Fabric compatibility"
[8]: https://www.nativewind.dev/docs/getting-started/installation "NativeWind4.2.7 SDK57 installation guidance"
[9]: https://registry.npmjs.org/expo-live-activity/0.4.2 "Live Activity0.4.2 publication and deprecation metadata"
[10]: https://docs.expo.dev/router/migrate/sdk-55-to-56/ "Expo Router supported replacement entry points"
[11]: https://unpkg.com/expo-router@57.0.31/build/react-navigation/index.d.ts "SDK57 Expo Router public React Navigation entry"
[12]: https://registry.npmjs.org/expo-modules-autolinking/-/expo-modules-autolinking-57.0.18.tgz "Published SDK57 autolinking module-record schema"
[13]: https://react.dev/reference/eslint-plugin-react-hooks "React Hooks lint rules and compiler diagnostic guidance"
