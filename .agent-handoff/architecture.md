# Architecture decisions (Claude)
1. Do NOT modify protected site/ files. Add a build script scripts/build-ios-web.mjs that copies site/ -> ios-www/ (gitignored), excluding site/api, v1-v4 (keep v5), then injects ios-bridge assets into the copied index.html only.
2. Capacitor webDir = ios-www. Bundled locally; no server.url.
3. Data: injected ios/bridge.js patches window.fetch: relative or same-origin requests whose path contains `/api/` are redirected to the Pages base URL (https://cjn119-ui.github.io/flagler-fishing-report/). Successful JSON responses are stored (localStorage, key+timestamp); on network failure serve stored copy with a visible "Saved data from <time>" banner. Respect main.js's own saved-data labelling (read it first; do not double-label).
4. Service worker: not registered in the native build (WKWebView custom scheme); bundle is already offline. Web build unchanged.
5. iOS adaptation lives only in injected ios-bridge.css/js: viewport-fit=cover, safe-area padding, keyboard, no rubber-band bounce overscroll weirdness, external links open in system browser (Capacitor Browser or window.open _system), haptics on primary buttons, native Share, Geolocation w/ fallback.
6. Plugins (minimal): @capacitor/core, cli, ios, app, haptics, share, geolocation, status-bar, browser. No Ionic/React. No push.
7. Privacy: Info.plist NSLocationWhenInUseUsageDescription only. No secrets.
8. package.json: keep "type":"module"; add scripts ios:web, ios:sync, ios:open, ios:build without altering existing ones.
9. Bundle id com.trointelligence.flaglerfishing (verified none existing).
