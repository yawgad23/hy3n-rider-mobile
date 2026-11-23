# Android automatic Rider pickup — source-only fix

## Scope

Implemented in `task/rider-android-auto-pickup-20261122` from `origin/main` commit `33d7666192444817246acd3fe26357eeb964d1b8`. This is an Android-only location acquisition change in the original Expo SDK54 / React Native 0.81.5 source tree.

App version **1.0.4**, iOS build **133**, Android version code **58023**, package manifests, lockfile, and app/build configuration are unchanged. No dependency install or postinstall was run. No native build, EAS build/submission request, deployment, OTA update, commit, or push was performed. The separate SDK57 / iOS134 migration worktree was not edited. The CI workflow change in this branch is parent-owned and is not part of this implementation.

## Source defects addressed

These are findings from source inspection, not a captured trace from the Rider's phone:

- Location services were checked before requesting foreground permission, and disabled services caused an immediate exit without an Android provider-settings recovery attempt.
- An eight-second one-shot timeout discarded valid later GPS results. No bounded foreground watch fallback was available for a hung native one-shot.
- Android permitted a fifteen-minute cache and a second unbounded last-known lookup. A valid coordinate could therefore be arbitrarily old.
- Booking readiness was set only after awaiting reverse geocoding. A hung Android geocoder could leave correct GPS/map coordinates visible but booking frozen indefinitely.
- Numeric coercion in the shared legacy validator accepted malformed native values such as nulls and numeric strings. Android now uses its own strict validator; the non-Android validator is unchanged.
- Startup acquisition lacked complete unmount/background cancellation and late-watch-registration cleanup.

## Implementation

`lib/rider-android-pickup.ts` is an injected async helper, tested with mocked Expo SDK54 APIs. `app/(tabs)/index.tsx` invokes it only when `Platform.OS === 'android'`; the existing non-Android acquisition behavior, layout, map styling, vehicle artwork, server routes, fares, booking API payload construction, and in-trip safety/tracking subscription remain unchanged.

Foreground permission is requested first. No background permission is requested. Permission denial and Android accuracy `none` remain unbookable. Provider checks are bounded to two seconds. If services are off, or both known GPS and network providers are unavailable, `enableNetworkProviderAsync` offers the user the Android location-settings dialog. It does not force a grant or repeatedly demand high-accuracy settings when GPS/network already work. A declined or unsupported dialog does not prevent an otherwise usable provider from supplying a fix. User-interaction waits are bounded to twenty seconds; cancellation cannot dismiss the OS dialog itself, but its late result is ignored.

Cache and one-shot GPS start concurrently, so a hung cache does not block GPS. Every received point is validated independently of the options sent to native code:

| Requirement | Policy |
| --- | --- |
| Coordinates | Actual finite numbers within latitude/longitude bounds; no null, bool, string, or `[0, 0]` placeholder |
| Timestamp | Actual finite positive number, not in the future; age strictly below 120 seconds |
| Accuracy | Actual finite nonnegative number, at most 1,000 metres |
| Cache request | Explicit `maxAge: 120000`, `requiredAccuracy: 1000`; no unbounded second lookup |

A genuine native fix in Accra is allowed; the static Accra map default alone never makes booking ready. Approximate foreground permission is accepted when the reported fix meets the same accuracy policy. This threshold is a practical acquisition bound, not a promise of precise curbside GPS. If approximate location exceeds it, the Rider can retry or deliberately choose a pickup with the existing manual chooser. No silent precise/background permission escalation is introduced.

A validated cache commits immediately as **Recent location**. A validated one-shot/watch fix commits coordinates and booking readiness immediately as **Current location**, without waiting for address lookup. A late cache cannot replace a live fix. Live reverse geocoding is separate, bounded to three seconds, and revision/generation guarded. Empty, failed, hung, or late address results do not block booking or replace a deliberate pickup.

If one-shot GPS fails/returns an unusable fix, or has not produced a usable fix after four seconds, one short foreground `watchPositionAsync` is registered. Acquisition closes after sixteen seconds from starting the native cache/GPS attempts. A valid live fix closes acquisition and removes the watch immediately. The one-shot remains eligible until that deadline, including after the former eight-second cutoff. Native one-shot/cache/geocode promises are not abortable through these Expo APIs; late callbacks are made inert. A watch registered after timeout, replacement, manual choice, unmount, background, or its own first successful callback is removed as soon as registration resolves.

Every committed automatic point expires according to its original native timestamp, not its retrieval time. Expiry clears booking readiness and asks the Rider to update the current location. It is not labeled current forever. Startup and foreground return request fresh coordinates for device-selected pickup; an explicit manual pickup remains selected on resume. Replacement requests and explicit current-location retries cancel the previous acquisition. Android background/unmount invalidates generations, clears timers, and removes watches. A recovered/active ride cancels home pickup acquisition without changing its locked pickup or the separate live safety tracking.

Native acquisition errors trigger a bounded, non-prompting foreground-permission/services recheck. A confirmed revocation or disabled service invalidates even a recent cache. There is no continuous background monitor or permission polling. A services/permission change after acquisition with no native error will be checked on resume or retry; automatic pickup is still bounded by the two-minute expiry.

## Validation performed

Tests used a temporary worktree-local `node_modules` symlink to the existing **read-only SDK54 overlay**. Versions verified: Expo **54.0.37**, expo-location **19.0.8**, React **19.1.0**, Vitest **2.1.9**. No SDK57 dependencies were used. The temporary symlink was removed after validation and must not be committed.

| Check | Result |
| --- | --- |
| `node_modules/.bin/vitest run --cache=false` | **68 test files / 350 tests passed**, including **62 new Android behavioral/validation cases**; original suite was 288 tests |
| `node_modules/.bin/tsc --noEmit` | Passed |
| Focused ESLint: helper, new tests, updated pickup tests, Home | 0 errors; 57 existing Home warnings, matching baseline Home warning count; helper/new tests introduce no lint warnings |
| Full `node_modules/.bin/eslint .` | 1 existing unrelated error / 121 warnings; the error is `react/display-name` at `tests/rider-history-screen-render.test.ts:10` (unchanged from base) |
| Read-only `node scripts/check-apple-auth-integration.mjs` | Passed; SDK54-compatible Apple authentication 8.0.8 and source autolinking verified; not a build or binary verification |
| `git diff --check` | Passed |

The tests exercise cold/null/hung cache, warm cache, strict malformed-value rejection, cache age/accuracy bounds, live GPS, empty/rejected/hung/late geocoding, slow one-shot GPS, stale native GPS, hung/failed watch registration, late registration removal, fallback deadline, original timestamp expiry, foreground permission denial/revocation, services-off/provider dialog decline and retry, fine/coarse permission, provider-status stalls, manual choice, replacement, background/resume, active-ride cancellation, and immediate/pending-request unmount. The real helper is invoked with mocked Expo APIs and bounded fake timers, not only source regexes. Booking readiness is verified against the existing `riderPickupIsReadyForBooking` rule using the committed native coordinate.

Validation logs are available outside the source tree at `/home/ubuntu/android-pickup-vitest.log`, `/home/ubuntu/android-pickup-tsc.log`, `/home/ubuntu/android-pickup-lint.log`, `/home/ubuntu/android-pickup-full-lint.log`, and `/home/ubuntu/android-pickup-native-preflight.log`.

## Still required before claiming the phone is fixed

No physical Android device, emulator, Play Store installation, or native binary was tested. The installed Play Store binary does **not** change from this source-only work. Delivery requires a separately approved Android build/release later, followed by real-device testing. No build/release is authorized or initiated here.

On a future approved Android binary, verify cold outdoor and indoor launch; fresh/missing/stale cache; fine and approximate permission; permanent denial and retry after Settings; services disabled with dialog accept/decline; devices with and without working Google Play provider support; slow GPS and failed address lookup; manual pickup during acquisition; foreground/background/unmount while a watch registers; resume after walking to a new location; expiry while staying foregrounded; and a recovered/active trip without moving its locked pickup. Confirm the map point and submitted booking pickup match the real current coordinates and that address lookup cannot freeze booking. Preserve the existing server-authoritative quote/booking and safety behavior.

## SDK54 reference

The supplied official [Expo SDK54 Location documentation](https://docs.expo.dev/versions/v54.0.0/sdk/location/) describes potentially slow `getCurrentPositionAsync`, potentially stale last-known positions, the user-approved Android network-provider dialog, foreground-only `watchPositionAsync`, provider-status APIs, and Android foreground-permission requirements for geocoding. API and field compatibility was additionally checked against installed `expo-location` 19.0.8 declarations (`build/Location.d.ts` and `build/Location.types.d.ts`). An older Expo49 issue is not used as evidence of an SDK54 defect.
