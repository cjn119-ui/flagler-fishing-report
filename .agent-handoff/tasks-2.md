# Codex task 2 — themes, catch log, swipe navigation, polish, UX tests

Repo: /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios, HEAD df29eae. First: `pwd; git rev-parse --show-toplevel; git status --short`.
You own all file edits until done. Do not commit. Do not invoke Claude. Do not touch protected files: site/index.html, site/main.js, site/shared/*, site/v1-v4, site/style.css.
Editable: site/v5/proto/{index.html,proto.js,proto.css}, ios/*, scripts/build-ios-web.mjs, new test scripts.
The native app shows site/v5/proto via the iOS build (`npm run ios:sync`). Read architecture.md for the bridge design.

## A. Themes (move ownership into the prototype)
Preference `v5proto.theme` ∈ auto | dark | night | light. Default **auto** = Dark by day, Night after local sunset until sunrise (America/New_York, Flagler Beach 29.4738,-81.131; use `solarEvents` from site/v5/engine/astro.js; re-evaluate every 5 min and on visibilitychange).
- Applied state: light → `data-theme="light"`; dark → `data-theme="dark"`; night → `data-theme="dark"` + `data-night="1"`. Keep proto.css's existing dark/light rules working unchanged.
- No flash: tiny inline script in proto index.html <head> applies the stored pref before CSS paints (auto may approximate with 19:00–07:00 until astro loads).
- `#theme=` hash keeps working as a review override (light|dark|night) without overwriting the stored pref. Remove the code path where readHash deletes data-theme and fights the preference.
- Move the night palette from ios/bridge.css into proto.css (`:root[data-night="1"]`): true black bg, dimmed text, AA contrast for text/muted/go/mid/skip. Keep the iOS depth-layer night variables in bridge.css.
- Delete ios/theme-init.js and its build/injection; remove the bridge's injected theme button.

## B. Header: free space
Header becomes [mark][spot pill][refresh][⋯ menu]. The ⋯ button (44×44, aria-label "More") opens a sheet using the proto's existing sheet component with:
- Appearance: 4-way segmented control Auto · Dark · Night · Light, with one line: "Auto uses Dark by day and Night after sunset."
- Share report: uses `navigator.share` when available, else copies the page URL with a toast.
In ios/bridge.js: remove the injected Share button; instead, if `navigator.share` is missing and Capacitor Share exists, polyfill `navigator.share` → Capacitor Share (url = Pages base URL). Spot pill must not truncate "Best anywhere" at 375 px.

## C. Log tab (catch log)
5th tab "Log" (icon: notebook/fish-hook, same SVG style). Tab order: Today, Spots, Species, Plan, Log. Hash `tab=log`.
- Data on device only: localStorage `v5proto.catches` (array, schema version field). No network writes. Show "Saved on this device only."
- "Log a catch" primary button → sheet form: species (select of SPECIES from site/v5/species.js + "Other" with free text), spot (ACTIVE_SPOTS from site/v5/spots.js; default = current scoped spot), mode (limited to that spot's modes), date & time (datetime-local, default now, not in the future), count (stepper, 1–99), kept/released segmented, length in inches (optional, 1–80), bait/lure (optional text), notes (optional, ≤500 chars). Validate inline; 44 px targets; labels on every field; keyboard must not hide the focused field.
- On save, also store a read-only context snapshot when the current report covers that spot/day: { runGeneratedAt, verdict, fit } (null otherwise).
- List: summary row (catches this month, top species, best spot), then entries grouped by day, newest first. Tap entry → detail sheet with Edit and Delete (Delete needs a confirm step). Empty state with a short call to action.
- Export: "Export CSV" → navigator.share with a CSV text/file when supported, else download.
- Keep logic (validation, CSV, summaries, storage) in a pure module (e.g. site/v5/proto/catch-log.js) with node unit tests in scripts/test-v5-catch-log.mjs.

## D. Swipe between tabs
Horizontal swipe on the main view moves to the adjacent tab in tab order (no wrap). Finger-following translate + snap; threshold |dx| ≥ 60 px and |dx| > 1.5·|dy|; velocity flick allowed. Ignore gestures that start in: open sheets, inputs/selects/textareas, horizontally scrollable areas (best-times scrubber, hourly strips, any element with overflow-x scrolling), segmented controls, or within 20 px of the screen edge. prefers-reduced-motion → no translate animation, just switch. Dispatch `document.dispatchEvent(new CustomEvent("v5:tab", {detail:{tab}}))` on tab change; bridge triggers a light haptic on it.

## E. Polish (concrete)
- 5-item tabbar fits 320–430 px without clipped labels; active state clear in all 3 themes.
- Consistent card spacing and section headings across Today/Spots/Species/Plan/Log; no horizontal overflow at 320/375/393/430 px.
- Focus-visible rings on all custom controls; all touch targets ≥ 44 px.
- Toast component for confirmations (saved, deleted, copied), aria-live polite.

## F. Tests and evidence (no faked results)
1. Existing suites must still pass: scripts/test-logic, test-app, test-catch, test-calculations, test-validator, test-restore-last-good-api, test-refresh-status, test-tide-window, test-ios-bridge, and all scripts/test-v5-*.mjs.
2. New scripts/test-v5-catch-log.mjs (node, no deps).
3. New scripts/ux-ios.mjs using Playwright (globally installed at /opt/homebrew/bin/playwright, v1.61.1; resolve its node module; prefer WebKit, iPhone 15 Pro-like device emulation with touch). If WebKit browser binaries are missing, use an already-installed browser and say so; do not download browsers. Serve ios-www with `python3 -m http.server` on a free port; route `**/api/**` to bundled sample JSON so tests are deterministic. Cover: default theme dark (or night when clock is after sunset — freeze the clock), switching all 4 appearance options persists across reload, #theme= override, swipe left/right across all 5 tabs and that swipes inside the scrubber do not change tab, log a catch end-to-end (add, edit, delete with confirm, export button present), validation errors, no horizontal overflow at 320/375/430 for each tab, every tab renders without console errors. Save screenshots for each tab × theme to .agent-handoff/shots/ux/ (names like log-night-375.png).
4. Native: `npm run ios:sync`; xcodebuild for simulator id A488F352-DB47-40AE-8C25-D256D90FB728; install; launch; screenshot Today at +12 s to .agent-handoff/shots/ux/native-today.png.
Append a concise report to .agent-handoff/codex-results.md: files changed, every command with exit code, test pass/fail counts, anything not done and why.
