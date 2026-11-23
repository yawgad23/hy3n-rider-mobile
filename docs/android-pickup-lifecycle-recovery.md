# Android Rider pickup lifecycle recovery

23 November 2026 · Manus AI

Prepared on `task/rider-android-pickup-recovery-20261123`, based on restored main `d86e557b61e4b59fe149bc4a80faea5785d27235`. This is source preparation, not an installed-app update. No build, native prebuild, upload, deployment or OTA update was started.

## The reported failure

The supplied Android Home screenshot shows pickup still displaying **Getting your location…**. It does not establish elapsed waiting time, installed version code, location permission or provider state. The image was not reopened, copied into the repository or shared externally.

The following failures were reproduced by executing the original Home pickup declarations and effects in their original order with React 19 and deferred Expo API responses. They are confirmed source defects, not a captured native trace establishing the cause on this particular phone.

1. **The Android settings dialog cancels its own acquisition.** Home formerly treated an OS permission/provider-resolution pause like any background transition. It cancelled request A, then started request B on return. Declining the provider dialog with services still off could therefore reopen it, retain the loading message and restart the application timeout instead of delivering the intended error. Android's native provider-resolution activity and React Native host pause/resume behavior support this lifecycle sequence.
2. **Startup misses a foreground transition.** Home copied AppState at render, acquired before installing its listener, and did not resynchronize current state. A background-to-active transition before passive effects could leave detection never started; the reverse transition could start a request while already backgrounded.
3. **Pickup does not resume when the last active ride clears.** An active ride cancels acquisition and clears automatic readiness, but the previous effect did nothing on the true-to-false transition. Returning to the continuously mounted Home could leave old coordinates and no usable pickup.
4. **An old safety watcher can overwrite a newer pickup.** Pending in-trip watch registration was not removed if it resolved after cleanup, and its callback ignored cancellation. A late callback could change coordinates after a manual/new automatic pickup had been selected.

## Android-only changes

`lib/rider-android-pickup.ts` now exposes ownership of the pending OS interaction. Home retains that one permission/settings outcome across the native pause, gates progress until foreground, and does not launch a duplicate acquisition on that same return. Native interaction and foreground handoff waits remain bounded. Ordinary background acquisition, manual selection, unmount and active-trip takeover still cancel immediately. No GPS or address work is started through the foreground handoff gate while backgrounded. Expo documents foreground permission, potentially slow one-shot fixes and the user-approved network-provider dialog. [1]

`app/(tabs)/index.tsx` installs the Android AppState listener and synchronizes the current native state before initial detection. A device-selected pickup refreshes once when the last ride clears; Rider-selected pickup is preserved. The Android safety callback rejects cancelled, stale, malformed or background results and removes registration arriving after cleanup. Valid foreground in-trip tracking remains covered by tests. No billing-distance or fare calculation was changed.

Automatic continuity is also improved: the existing two-minute freshness limit still invalidates booking readiness, but Home now starts one replacement foreground acquisition when the preceding acquisition has closed. A cache expiring while its original live-GPS attempt is still running does not restart it. If the replacement fails, loading stops with the existing error; there is no endless retry loop.

The freshness/accuracy limits, Balanced provider priority and precise/approximate permission policy are unchanged. A poor or over-1,000-metre approximate fix is not silently made bookable. Android limits an app to approximate accuracy when that is all the user grants. [2] No new background permission, SDK, map provider, key or environment variable is introduced.

## Verified local checks

- Full TypeScript: passed.
- Full Vitest: **69 files, 369 tests passed**, including **18 executable Home lifecycle cases** and the existing 62 Android acquisition cases.
- Red-first proof: the same first 14 lifecycle assertions produced **9 failures and 5 passes** on original `d86e557`; all 14 passed after the fix. Four further cases cover accepted provider outcomes before/after foreground return, a permission grant arriving afterward, and a paused timeout without a duplicate prompt.
- Focused ESLint: **0 errors**; 57 existing Home warnings. The helper and new test file introduce no lint warnings.
- `git diff --check`: passed.
- AST comparison: the complete non-Android pickup acquisition and every Home JSX node are byte-for-byte unchanged. NativeGoogleMap, camera helpers, app/EAS configuration, manifests/lockfile, fare/quote helpers and vehicle artwork are unchanged.

An additional Apple-native preflight did **not** pass in the reused local dependency folder: its Apple-authentication package is 58.0.2 while this repository requires ~8.0.8. Expo 54.0.37, expo-location 19.0.8, React 19.1.0 and RN 0.81.5 were verified for the location tests. No dependencies were installed or modified to conceal this mismatch. A future approved native build must use dependencies installed from the frozen lockfile and rerun native preflight; this local mismatch is not evidence that this Android change damaged iOS.

## Delivery and phone verification

A read-only EAS query at 15:44 UTC showed the latest finished Android build as **1.0.5 (58025)**, build `32d6d36c-04b7-424f-a409-631817814a81`, source `3bcb711b0d72d29a0ba4fde4ae859240b1e12507`. Its pickup helper and Home logic match this branch's base. Build 58026 exists in restored source configuration but was absent from that EAS build history. These facts do not verify the current Google Play Production version or the user's installed binary.

Before claiming the phone is fixed, obtain explicit build/release approval, verify an unused Android version code against Play and EAS, use frozen-lockfile dependencies, then test a real Android installation: cold start; permission grant before/after resume; settings acceptance/decline without repeated dialogs; ordinary background/resume; manual pickup; removal of the last ride; expired pickup while Home remains open; and late safety-watch callbacks. Confirm the booking uses the selected/current coordinate and that the existing server quote and locked trip settlement remain authoritative. No assumption is made that the user has a Mac, Xcode or an Android device available.

## References

[1]: https://docs.expo.dev/versions/v54.0.0/sdk/location/ "Expo SDK54 Location APIs"
[2]: https://developer.android.com/develop/sensors-and-location/location/permissions "Android foreground location permissions and accuracy"
