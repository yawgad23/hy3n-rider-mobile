# Rider iOS map readability

23 November 2026 · Manus AI

Prepared on `task/rider-ios-map-readability-20261123`, based on restored main `d86e557b61e4b59fe149bc4a80faea5785d27235`. This is an isolated source change, not an update already installed on an iPhone. The separate Maps diagnostic branch and original-build-132 rollback branch are not merged into this branch.

## Requested appearance

The user selected clearer nearby streets, place names and buildings, with a restrained Uber/Bolt-inspired map appearance—not a wider whole-route camera or a Street View panorama. Public pickup-map references informed the neutral-road, building-aware direction. HY3N retains its own green route and existing vehicle artwork. [1]

`lib/rider-map-presentation.ts` selects native Google Maps light/dark styles only on iOS. Pale neutral roads and subdued building geometry distinguish the street network in light mode. Dark mode retains clear roads and paired high-contrast text/halo colors. Road names and nearby-place names, including business names, are explicitly enabled. Only business label icons are hidden to reduce clutter; medical, park and transit icons are not explicitly hidden.

Google controls label placement, geographic coverage and zoom-dependent detail. The change cannot guarantee every business label or building appears at every zoom. These are embedded JSON styles, with no cloud map ID, additional API or provider replacement. Google documents the selected road, POI, man-made landscape and text fill/stroke selectors. [2]

## Native support and protected behavior

The installed `react-native-maps` 1.20.1 Google iOS bridge exports `showsBuildings` and maps it to `GMSMapView.buildingsEnabled`, even though its TypeScript comment says iOS unsupported. The implementation, not that stale comment alone, supports enabling the existing native building capability. Building coverage and the actual iPhone appearance still need verification.

`showsPointsOfInterest` is not exported by this Google iOS bridge. The patch therefore does not rely on that prop alone: POI text visibility is controlled through native JSON styling. The unsupported Google scale control remains disabled, and the compass setting remains unchanged to avoid adding more UI clutter.

Android light mode remains unstyled. Android dark mode receives the exact existing dark-style array, and its building/POI flags remain false. Android’s intended LEGACY renderer is unchanged.

No camera framing, pan/zoom commands, live-follow cadence, GPS authority, marker animation, route geometry, vehicle sizes/colors, pickup ETA, fare, booking, backend, AppDelegate, SDK dependency, key, environment variable or release-number logic is changed. No native prebuild, app build, upload or store submission is authorized by this source preparation.

## Checks and device verification

Local checks cover executed presentation selection for iOS/Android themes, exact legacy Android style identity, no mutation, JSON serializability, supported style selectors, label visibility and icon-only decluttering. Specified text-to-halo color contrast is 8.05:1 for light roads, 6.18:1 for light places, 11.87:1 for dark roads and 9.71:1 for dark places. These numerical checks are not a measurement of final native map pixels.

Final local checks passed: `node node_modules/typescript/bin/tsc --noEmit`; the full Vitest suite, with 69 files and 354 tests passing; and `git diff --check`. A byte-for-byte comparison against the base commit, after reversing only the helper import/call and three display props, confirms that all other component code—including the original Android dark style, camera commands and vehicle animation—is unchanged. Native configuration, EAS profiles, camera/route/motion/artwork helpers and the Home screen are also unchanged.

Automated checks do not establish that Google accepted the style or that a physical iPhone rendered it correctly. There is no native visual preview available from this Linux environment.

Before any future build, obtain separate explicit approval and verify an unused iOS version/build combination. Do not reuse the restored build-136 number. Keep the currently working TestFlight installation until the comparison build is available.

On the approved device build, verify light and dark appearance around a familiar pickup area; street names and useful nearby-place labels; available building geometry while zooming/panning; readable HY3N route and pickup labels; vehicle artwork and live tracking unchanged; manual pan still respected; Route Details still working; cold launch/resume; Wi-Fi/cellular. Native style warnings or a returning blank basemap require stopping and inspecting that build, not speculative SDK/key changes. Android regression verification should confirm its existing appearance and behavior.

## References

[1]: https://www.uber.com/hk/en/blog/hkpickex/ "Uber: Tips on smooth pickup with Uber app"
[2]: https://developers.google.com/maps/documentation/ios-sdk/style-reference "Google Maps SDK for iOS: JSON style reference"
