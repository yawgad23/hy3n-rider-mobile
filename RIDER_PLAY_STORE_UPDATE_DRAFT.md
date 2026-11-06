# HY3N Rider — Google Play Update Draft

**Status:** Draft only — no Android build uploaded and no release submitted.

## Proposed release

- **App:** HY3N Rider (`com.hy3n.rider`)
- **Proposed version name:** `1.0.1`
- **Proposed Android version code:** `58018`
- **Release track:** To be selected after review; do not publish yet.
- **Source reviewed:** `main` at commit `24e6534` (`Prepare Rider Android build 58017`)

The proposed version code is reserved for planning only. The project configuration remains unchanged at Android version code `58017` until the update is explicitly approved for implementation and building.

## Suggested short description

Ride with confidence with clearer vehicle markers, pickup ETAs, and a smoother live map.

## Suggested release notes

- Improved live-map vehicle visibility and movement updates.
- Added clearer vehicle markers for cars, Okada motorcycles, and delivery services.
- Corrected Car Delivery so it uses the car marker instead of the delivery-bike marker.
- Restored prominent pickup ETA information before booking when reliable data is available.
- Improved route and driver-location tracking stability.
- Improved ride-status recovery and dispatch handling.
- Updated Android compatibility for the latest supported Android platform requirements.
- General performance, reliability, and safety improvements.

## Verification completed

- Rider test suite: **58 test files passed; 219 tests passed**.
- TypeScript check (`pnpm check`): **passed**.
- Working tree before this draft: clean on `main`.

## Release safeguards

- No EAS build started.
- No AAB uploaded to Google Play.
- No Play Console release created or submitted.
- No Rider app configuration or version code changed.

## Approval needed before implementation

Confirm whether to use this draft as written. After approval, the next step would be to update the release metadata and prepare the Android build, but uploading or publishing will require separate authorization.
