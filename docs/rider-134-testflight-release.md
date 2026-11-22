# HY3N Rider 1.0.4 (134): TestFlight release

Rider1.0.4(134) is successfully built, uploaded and verified as available to internal TestFlight testers on November22,2026. Apple processing is `VALID`, internal testing is `IN_BETA_TESTING`, and external status is `READY_FOR_BETA_SUBMISSION`. It has not been submitted to Apple App Review or external beta review.

## Exact build and source

The user approved one SDK57/Xcode27 iOS build and upload of that exact successful build to TestFlight at11:36UTC. One build was created, with no automatic replacement build or repeat upload.

The EAS build is `b67b7a26-1a4c-456c-9c0f-47c06e1b8410`, source commit `d7301ae098175b9cd560f5ccf943813be59c6343`, on branch `task/rider-xcode27-configuration-20261122` in `yawgad23/hy3n-rider-mobile`. Version is1.0.4, iOS build number134, and bundle identifier is `com.hy3n.rider`. The build finished at `2026-11-22T11:50:45.679Z`.[1]

Exact-build submission `c7c3ac33-1315-4db6-9458-8b5d801a9a2e` uploaded that same EAS build. Apple lists the upload at `2026-11-22T03:52:26-08:00`; its processed metadata identifies the expected EAS build and submission IDs. Build133 remains untouched. Android version code58023, Android binaries and store availability were not changed.[2]

## SDK, native compilation and signing evidence

The clean source CI for the actual build commit passed frozen SDK57 dependency installation, Expo alignment, Apple native source/capability/scene/autolinking preflight, TypeScript and347 tests in71 files. Lint passed with0 errors and164 warnings; this is not a zero-warning result. React Compiler remains disabled independently of the SDK migration.[3]

The local EAS launch was evaluated using an actual isolated Expo57.0.33/React Native0.86.3 dependency graph, not the former SDK54 dependency link. Resolved EAS configuration verified SDK57, build134, the correct Rider project, supported scene enablement and production image `macos-tahoe-26.6-xcode-27.0`. The original SDK54 dependencies were preserved.

Completed EAS native logs confirm **Xcode27.0, build27A266a**, and compilation against **`iPhoneOS27.0.sdk`**. They show `ExpoAppSceneDelegate.swift` and scene forwarding source being compiled, followed by a successful native archive and export. This is native build evidence, not merely a configured image name. Existing Rider and `com.hy3n.rider.LiveActivity` signing credentials were used. A full IPA entitlement inspection was not performed; successful signing/export and Apple processing do not replace that or physical-device testing.

This new binary addresses the older build-SDK basis of ITMS-90725. It does not erase the warning from already-delivered build133. No claim is made that every authentication, map or Live Activity behavior has been physically verified.

## Photo-save fix and Android work are separate

The approved Firestore-only profile-photo compatibility rule was deployed earlier to Firebase project `hy3n26`, with its exact source verified live. It permits only the existing owner's photo and client timestamp fields, with the exact owned Storage URL. Identity/contact/financial rules remain protected; Storage and functions were unchanged. The rule supports both the unchanged build133 photo-save flow and this new134 build. Phone-level upload/save persistence still needs testing.

The subsequent Android automatic-pickup source fix is being prepared on a separate stable SDK54 branch based on main33d7666. It was requested after build134 started and is **not included in this uploaded iOS binary**. No Android build, OTA update or Play Store deployment has been started for that work.

## Required checks before App Review

Install134 from TestFlight and test on physical iPhone and iPad. Verify fresh and returning Apple sign-in, cancellation, mandatory unique contact/profile completion and saved-session restoration. Verify profile-photo permission denial/grant, picker, crop, upload, save and persistence after reopening the app.

Test scene startup, background/foreground transitions and cold/warm links. Retest Google map loading, vehicle markers and camera transitions, trip completion/cancellation and Live Activity dismissal. Review crash logs for the previously reported native aborts. Apple App Review remains blocked until the required real-device checks are confirmed.

## Evidence files

The final build metadata is `/home/ubuntu/rider-134-build-latest.json`, exact submission log is `/home/ubuntu/rider-134-submission.log`, and Apple verification is `/home/ubuntu/rider-134-testflight-verification.json`. Selected native compiler evidence is `/home/ubuntu/rider-134-native-log-evidence/selected-evidence.txt`. Signed artifact URLs and credentials are intentionally not included in this report.

## References

[1]: https://expo.dev/accounts/yawgad/projects/hy3n-mobile-app/builds/b67b7a26-1a4c-456c-9c0f-47c06e1b8410 "Exact Rider134 EAS build"
[2]: https://appstoreconnect.apple.com/apps/6788405076/testflight/ios "HY3N Rider TestFlight in App Store Connect"
[3]: https://github.com/yawgad23/hy3n-rider-mobile/actions/runs/45018399431 "Clean source CI for the Rider134 build commit"
