const PAGES_BASE = "https://cjn119-ui.github.io/flagler-fishing-report/";
const CACHE_PREFIX = "flagler-ios-api-v1:";

export function rewriteApiUrl(input, { base = globalThis.location?.href ?? "http://localhost/", pagesBase = PAGES_BASE } = {}) {
  let url;
  try { url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, base); }
  catch { return input; }
  const origin = new URL(base).origin;
  const apiPath = url.pathname.match(/(?:^|\/)api\/(.+)$/);
  if (url.origin !== origin || !apiPath) return input;
  const rewritten = new URL(`api/${apiPath[1]}`, pagesBase);
  rewritten.search = url.search;
  rewritten.hash = url.hash;
  return rewritten.href;
}

function safeGet(storage, key) {
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    return saved && typeof saved.savedAt === "number" && saved.json !== undefined ? saved : null;
  } catch { return null; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* localStorage may be full or disabled */ }
}

function cacheKey(url) {
  const parsed = new URL(url);
  // The root app appends a timestamp only to defeat browser caches; it does not change the API resource.
  parsed.searchParams.delete("check");
  return CACHE_PREFIX + parsed.pathname + parsed.search;
}

export function createCachedFetch({ fetchImpl, storage, onStale = () => {}, base, pagesBase = PAGES_BASE, now = () => Date.now() }) {
  return async function nativeFetch(input, init) {
    const rewritten = rewriteApiUrl(input, { base, pagesBase });
    const url = typeof rewritten === "string" || rewritten instanceof URL ? String(rewritten) : rewritten.url;
    const isApi = url.startsWith(pagesBase) && new URL(url).pathname.includes("/api/");
    try {
      const response = await fetchImpl(rewritten, init);
      if (isApi && response.ok && (response.headers?.get("content-type") ?? "").includes("json")) {
        try {
          const json = await response.clone().json();
          safeSet(storage, cacheKey(url), { savedAt: now(), json });
        } catch { /* malformed JSON is left for the caller to reject */ }
      }
      return response;
    } catch (error) {
      if (!isApi) throw error;
      const cached = safeGet(storage, cacheKey(url));
      if (!cached) throw error;
      onStale(cached.savedAt);
      return new Response(JSON.stringify(cached.json), { status: 200, headers: { "content-type": "application/json", "x-flagler-ios-cache": "stale" } });
    }
  };
}

const native = globalThis.Capacitor?.isNativePlatform?.() === true;
if (native && globalThis.fetch) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let banner;
  const showSavedBanner = (savedAt) => {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "ios-saved-data-banner";
      banner.id = "ios-saved-data-banner";
      banner.setAttribute("role", "status");
      document.body.prepend(banner);
    }
    banner.textContent = `Saved data from ${new Date(savedAt).toLocaleString()}`;
  };
  globalThis.fetch = createCachedFetch({ fetchImpl: originalFetch, storage: globalThis.localStorage, onStale: showSavedBanner });

  // The native bundle is already local; do not register the web PWA service worker in WKWebView.
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = async () => ({ scope: location.origin }); } catch {}

  const plugins = globalThis.Capacitor?.Plugins ?? {};
  if (!navigator.share && plugins.Share?.share) {
    try { Object.defineProperty(navigator, "share", { configurable: true, value: (data = {}) => plugins.Share.share({ ...data, url: PAGES_BASE, dialogTitle: data.title ?? "Share Flagler Fishing" }) }); } catch {}
  }
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (button && !button.disabled && !button.matches(".tab")) plugins.Haptics?.impact?.({ style: "LIGHT" }).catch?.(() => {});

    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    plugins.Browser?.open?.({ url: url.href }).catch?.(() => globalThis.open(url.href, "_system"));
  });

  document.addEventListener("v5:tab", () => plugins.Haptics?.impact?.({ style: "LIGHT" }).catch?.(() => {}));

  document.addEventListener("DOMContentLoaded", () => {
    const statusBar = plugins.StatusBar;
    // Capacitor naming: style "DARK" = light status-bar text (for dark pages), "LIGHT" = dark text.
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    const syncStatusBar = () => {
      const forced = document.documentElement.getAttribute("data-theme");
      const dark = forced !== "light";
      statusBar?.setStyle?.({ style: dark ? "DARK" : "LIGHT" })?.catch?.(() => {});
    };
    syncStatusBar();
    media?.addEventListener?.("change", syncStatusBar);
    new MutationObserver(syncStatusBar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }, { once: true });

  const keyboardClass = (open) => document.body?.classList.toggle("ios-keyboard-open", open);
  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.("input, textarea, select, [contenteditable=true]")) keyboardClass(true);
  });
  document.addEventListener("focusout", (event) => {
    if (event.target?.matches?.("input, textarea, select, [contenteditable=true]")) setTimeout(() => keyboardClass(false), 120);
  });
  plugins.Keyboard?.addListener?.("keyboardWillShow", () => keyboardClass(true)).catch?.(() => {});
  plugins.Keyboard?.addListener?.("keyboardWillHide", () => keyboardClass(false)).catch?.(() => {});
  plugins.App?.addListener?.("appStateChange", ({ isActive }) => {
    if (isActive) globalThis.dispatchEvent(new Event("online"));
  }).catch?.(() => {});

  // Existing pages can use navigator.geolocation unchanged; Capacitor's plugin is preferred when present.
  const geo = plugins.Geolocation;
  if (geo && navigator.geolocation) {
    const browserGeo = navigator.geolocation;
    const watches = new Map();
    let nextWatchId = 1;
    const nativeGeo = {
      getCurrentPosition(success, failure, options) {
        geo.getCurrentPosition(options ?? {}).then(success, () => browserGeo.getCurrentPosition(success, failure, options));
      },
      watchPosition(success, failure, options) {
        const id = nextWatchId++;
        const watch = { nativeId: null, browserId: null };
        watches.set(id, watch);
        geo.watchPosition(options ?? {}, (position, error) => {
          if (!watches.has(id)) return;
          if (error) failure?.(error); else success(position);
        }).then((nativeId) => {
          if (!watches.has(id)) geo.clearWatch({ id: nativeId }).catch(() => {});
          else watch.nativeId = nativeId;
        }).catch(() => {
          if (watches.has(id)) watch.browserId = browserGeo.watchPosition(success, failure, options);
        });
        return id;
      },
      clearWatch(id) {
        const watch = watches.get(id);
        if (!watch) return;
        watches.delete(id);
        if (watch.nativeId != null) geo.clearWatch({ id: watch.nativeId }).catch(() => {});
        if (watch.browserId != null) browserGeo.clearWatch(watch.browserId);
      },
    };
    try { Object.defineProperty(navigator, "geolocation", { configurable: true, value: nativeGeo }); } catch {}
  }
}
