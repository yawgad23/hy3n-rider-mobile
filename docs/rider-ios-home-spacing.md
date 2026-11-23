# Rider iOS Home spacing correction

The original Android compaction commit `74c566c` changed shared idle-Home styles, so it also affected iOS. Later commits restored the pre-compaction iOS numbers, but those numbers still used two rows of minimum-height cards with small artwork. On a taller iPhone, that natural content height could leave a large unused area above the tab bar. Restoring the same values again would not address that remaining space.

The new correction measures the actual iOS Home viewport and the category grid/footer positions. It allocates the otherwise unused phone space to larger service cards and vehicle artwork, rather than inserting a blank spacer underneath. The three-column grid fills its available width. Card sizes are capped on iPad, and small screens or larger system text can scroll naturally. iOS category labels are no longer capped at one/two lines.

Android retains its current compact dimensions: 92-point minimum cards, 52-by-34 artwork, 31% card widths, and its existing spacing, fonts and wrapping. Web retains its previous dimensions. All measurement handlers and adaptive sizing are iOS-only. Device-following light/dark colors, category order, pricing, pickup logic, booking/map screens, the tab bar, authentication and the Apple Sign-In fixes are unchanged.

Validation passed: TypeScript, all 288 tests in 67 files, and lint with no errors. New tests exercise tall/short iPhone viewports, orientation changes, longer header/footer text, iPad caps and narrow widths, missing measurements, category-count changes, and Android/web invariance. Existing lint warnings remain unchanged.

The supplied screenshot was read directly in the conversation and was not reopened with file tools. Source analysis does not identify the installed app's exact revision, and Linux layout-policy tests are not a native iOS screenshot comparison. Confirm the finished layout on physical iPhone/iPad, especially large text and rotation, before release.

Source changes are to be pushed to `yawgad23/hy3n-rider-mobile`. No native build, OTA deployment, TestFlight upload or store submission was started; a build/deployment requires the user's go-ahead.
