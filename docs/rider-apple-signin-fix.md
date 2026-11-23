# Rider Apple Sign-In correction

The Rider source had an unsupported dependency pairing: Expo SDK 54.0.37 with `expo-apple-authentication` 58.0.2. Expo SDK 54 recommends `~8.0.8`. The package manifest and frozen lockfile now use that supported version, without changing Expo, React Native, the app version/build number, or the backend dependency revision. [1]

The screenshot's “not available on this device” text came from HY3N's own availability guard, before Apple authorization or Firebase credential exchange. The installed package's JavaScript fallback returns false when the native Apple binding cannot be found. Its native iOS implementation returns true. The screenshot is therefore consistent with an absent or failed native binding, not proof that the iPhone cannot use Apple Sign-In.

The exact installed binary has not been identified. Source autolinking discovers the Apple module with both the previous package and the corrected package; neither the module configuration's `apple` platform name nor the lack of a separate `.ios.ts` file proves why that binary failed. The dependency mismatch is confirmed, but it is not a demonstrated binary-level root cause by itself.

## Authentication and crash safeguards

The production native flow now checks iOS platform support and the actual `ExpoAppleAuthentication` binding before the existing availability check. A missing binding produces an app-build-specific message instead of blaming the device. It does not force availability true or invoke a missing native API. Android never loads the Apple module; the existing web Apple popup remains unchanged.

The flow still generates a fresh nonce for each attempt, sends its SHA-256 hash to Apple, and sends the original nonce with the identity token to Firebase. Missing tokens are rejected before Firebase exchange. Cancellation and Firebase account-conflict errors propagate unchanged. Returning Apple users can sign in without Apple resending their name/email, and an existing display name is not overwritten. [2]

SDK 54's supported Apple package predates two newer native presentation safeguards. A narrowly version-gated backport runs authentication requests on the main queue, selects and retains a foreground presentation window, and rejects a missing window instead of reaching the old `fatalError`. It uses APIs verified in ExpoModulesCore 3.0.30 rather than a newer unavailable helper. The patch verifies exact published Swift source hashes, is idempotent, refuses unsupported or altered packages, and refuses to write outside the project. It replaces files without overwriting shared pnpm hardlinks. [3] [4]

The native patch runs during dependency installation and again at EAS's post-install hook. A read-only integration preflight checks the Expo-supported version, Apple capability/plugin/entitlement, and source discovery of the Swift class and CocoaPod. CI includes this preflight. These checks do not prove a finished binary is correctly linked or signed.

## Account rules preserved

Native Firebase authentication still uses AsyncStorage-backed persistence, so a successful session restores after reopening the app. The existing authenticated profile observer remains responsible for loading the canonical Rider profile.

New Apple users with an incomplete profile still go to `complete-profile` before accessing Home. Full name, valid email, and Ghana mobile number remain mandatory. Profile creation and unique phone/email claims remain server-owned; the Apple flow does not create a duplicate Rider profile or bypass server validation. Existing photo-picker and upload safeguards are unchanged.

## Verification completed

The baseline was 240 passing tests in 63 files. The corrected source passes 270 tests in 66 files, including 13 execution-level Apple-flow tests, 14 native-patch fixture tests, and 3 dependency/release-safeguard tests. TypeScript and lint pass; repository lint retains existing warnings and has no errors.

Validation used the actual published Apple 8.0.8 package copied into a small, task-owned dependency overlay. Other dependencies were reused without installing or modifying the original restored repository's packages. The corrected package passes capability and iOS source-autolinking preflight. The old shared 58.0.2 installation correctly fails the new compatibility gate and remains untouched.

No native build, prebuild, OTA update, deployment, TestFlight upload, or store submission was started. Source changes are intended for the Rider GitHub repository only. This is a source fix, not a fix already installed on the user's phone.

## Required before Apple review

A newly authorized iOS binary is necessary for a native package change; JavaScript-only delivery cannot add a missing native module. [2] Before release, confirm the binary's source commit/build number, `ExpoAppleAuthentication` in `Podfile.lock`, `AppleAuthenticationModule` in the generated module provider, and the signed Apple Sign-In entitlement/provisioning capability.

Linux source tests do not compile Swift or perform Apple/Firebase authentication on an iPhone. On physical iPhone and iPad, test fresh-install and returning-user sign-in, cancellation, foreground/window transitions, mandatory profile completion, session restoration, duplicate-contact rejection, and absence of crashes. Retest profile-photo selection/upload and granted/denied permission behavior. Do not resubmit until those device checks pass. A new build/deployment requires the user's explicit go-ahead.

## References

[1]: https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json "Expo SDK 54 supported native package versions"
[2]: https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/apple-authentication.mdx "Expo SDK 54 Apple Authentication guidance"
[3]: https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-8.0.8.tgz "Published SDK-54-compatible Apple package source"
[4]: https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-58.0.2.tgz "Published newer Apple presentation safeguards"
