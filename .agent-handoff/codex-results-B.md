# Codex job B results — native MapKit and local notifications

## Checkout and ownership

- Repo: `/Users/christiannunez/flagler-fishing-ios`
- Branch: `feature/capacitor-ios`
- HEAD at start: `200f9716d09a6e24a2080932ee10d6215028e3a6` (the task file's `b307ce0` was stale)
- No commit created. Job R's edits under `site/v5/proto/**` and `scripts/**` were preserved.
- I did not edit `scripts/**`; its ownership belongs to Job R.

## Changes

- Added `FFMapPlugin` in `ios/App/App/FFMapPlugin.swift`, registered by the existing bridge controller and added to the Xcode project. MapKit pins use the requested verdict colors, favorite star, closure subtitle, selected marker emphasis, hybrid map type, and page-theme appearance. The map is a `WKWebView.scrollView` child; native content-offset observation masks it under the sticky header and tab bar.
- Added `FFNativeMap` lifecycle, resize/scroll handling, sheet and tab transition fades, and notification tap forwarding in `ios/bridge.js`. Notification taps dispatch `ffnotify:open` with `{spotId, mode}`; the prototype does not currently handle that event, so it still needs a route-to-Today integration.
- Installed `@capacitor/local-notifications@8.3.1`; npm metadata reports peer requirement `@capacitor/core >=8.0.0`. Capacitor sync added the iOS package product.
- Added the pure `buildNotificationSchedule` helper. It combines GO forecast windows with GO per-location recommendations, filters favorite spot and closed mode pairs, checks the next 48 hours, skips starts under 10 minutes away, uses a 60-minute alert lead or 10 minutes for nearer windows, and caps at eight. Permission is requested only from `toggle(true)`; a denied permission resets `v5proto.notifications` to false.
- The bridge no longer caches JSON under `/api/v5/`; offline cache responses expose the saved timestamp in `x-flagler-ios-cache` as an ISO value.
- Added `ios/test-bridge-native.mjs` because `scripts/**` is owned by Job R. The script checks the scheduler and cache-header behavior.
- Added DEBUG-only launch hooks for Spots, the More sheet, and a 30-cycle map lifecycle attempt. No production behavior is added by those hooks.

## Verification

Commands and results:

- `npm install @capacitor/local-notifications@^8.3.1` — exit 0; npm reported 3 moderate advisories in the dependency tree.
- `node --check ios/bridge.js && node scripts/test-ios-bridge.mjs && node ios/test-bridge-native.mjs` — exit 0; bridge fallback, scheduler, tomorrow-run inclusion, closure filtering, lead times, and saved-at cache header passed. Job R updated the shared bridge test during the parallel run; the final run uses the new timestamp contract.
- `npm run ios:web && npx cap sync ios` — exit 0; Capacitor included `@capacitor/local-notifications@8.3.1` among seven iOS plugins.
- `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'id=A488F352-DB47-40AE-8C25-D256D90FB728' CODE_SIGNING_ALLOWED=NO build -quiet` — exit 0. Xcode printed its `IDERunDestination` supported-platform metadata warning; no Swift compiler warnings were emitted.
- `xcrun simctl install ... App.app` and `xcrun simctl launch ... --flagler-spots` — exit 0. The existing simulator app was overwritten in place; it was not uninstalled.
- `curl .../api/v5/today.json` — HTTP 200 from the host.

## Simulator evidence and limits

- A simulator launch displayed “Couldn't read the report” despite the host GET to the live report returning HTTP 200. The retained screenshot is `.agent-handoff/shots/b/spots-report-read-error.png`; it is not a map screenshot.
- The requested map-at-top, map-under-header, and sheet-over-map screenshots were not obtained. The DEBUG launch hooks were attempted through both arguments and `SIMCTL_CHILD_FLAGLER_IOS_DEBUG`, but the visible state did not confirm route automation or the 30-cycle native lifecycle test. Treat map rendering, mask behavior, and leak-free 30-cycle behavior as unverified in the simulator.
- No notification permission prompt or notification delivery was exercised. The pure scheduling logic passed; native scheduling and tap routing remain unverified. As required, alerts refresh only while the app is open; there is no push server.
- System Node was v26.8.1; the project notes Node 22, and no Node 22 installation was present in this environment.

## Files changed by this job

- `ios/App/App/FFMapPlugin.swift`
- `ios/App/App/SceneDelegate.swift`
- `ios/App/App/Base.lproj/Main.storyboard`
- `ios/App/App.xcodeproj/project.pbxproj`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/bridge.js`
- `ios/test-bridge-native.mjs`
- `package.json`
- `package-lock.json`
- `.agent-handoff/codex-results-B.md`
- `.agent-handoff/shots/b/spots-report-read-error.png`

Current Git state remains uncommitted. Review the native scroll-view masking and permission-denial switch state independently; the simulator did not provide live-map or delivered-notification acceptance evidence.
