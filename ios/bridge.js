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

export function cachedResponseHeaders(savedAt) {
  return { "content-type": "application/json", "x-flagler-ios-cache": new Date(savedAt).toISOString() };
}

export function buildNotificationSchedule({ favorites = [], run, tomorrowRun = null, closures = [], now = Date.now() } = {}) {
  const favoriteIds = new Set(favorites.map((item) => typeof item === "string" ? item : item?.spot ?? item?.id).filter(Boolean));
  const closed = (spotId, mode) => closures.some((spot) => spot.id === spotId && spot.closures?.some((item) => item.status === "closed" && item.modes?.includes(mode)));
  const result = [];
  const seen = new Set();
  const fishingDate = (value) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  const localDateKey = (value) => { const p = fishingDate(value); return `${p.year}-${p.month}-${p.day}`; };
  for (const source of [run, tomorrowRun].filter(Boolean)) {
    for (const day of source.days ?? []) {
      const windows = (day.verdict === "GO" ? day.windows ?? [] : []).map((window) => ({ ...window, verdict: day.verdict, topSpecies: window.topSpecies ?? day.topSpecies }));
      const targetDate = day.date ?? source.targetDate;
      for (const recommendation of Object.values(source.scopeViews?.byLocation ?? {}).map((item) => item.recommendation).filter((item) => item?.verdict === "GO")) {
        const startDate = Number.isFinite(Date.parse(recommendation.window?.start)) ? localDateKey(recommendation.window.start) : null;
        if (startDate === targetDate && recommendation.window) windows.push({ ...recommendation.window, locationId: recommendation.locationId, locationName: recommendation.displayName, mode: recommendation.mode, verdict: recommendation.verdict, topSpecies: recommendation.targets });
      }
      for (const window of windows) {
        const spotId = window.locationId ?? window.spotId;
        const mode = window.mode;
        const startMs = Date.parse(window.start);
        const endMs = Date.parse(window.end);
        if (!spotId || !mode || !favoriteIds.has(spotId) || closed(spotId, mode) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
        const leadMs = startMs - now;
        if (leadMs < 10 * 60_000 || leadMs > 48 * 60 * 60_000) continue;
        const species = window.topSpecies ?? day.topSpecies ?? [];
        const names = species.slice(0, 3).map((item) => item.name).filter(Boolean);
        const key = `${spotId}|${mode}|${startMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const fireAt = new Date(startMs - (leadMs > 60 * 60_000 ? 60 : 10) * 60_000);
        const timeOptions = { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" };
        result.push({
          id: 71000 + result.length,
          title: `GO at ${window.locationName ?? window.spotName ?? spotId}`,
          body: `${mode} · ${new Date(startMs).toLocaleTimeString("en-US", timeOptions)}–${new Date(endMs).toLocaleTimeString("en-US", timeOptions)}${names.length ? ` · ${names.join(", ")}` : ""}`,
          schedule: { at: fireAt },
          extra: { spotId, mode },
        });
        if (result.length >= 8) return result;
      }
    }
  }
  return result;
}

export function createCachedFetch({ fetchImpl, storage, onStale = () => {}, base, pagesBase = PAGES_BASE, now = () => Date.now() }) {
  return async function nativeFetch(input, init) {
    const rewritten = rewriteApiUrl(input, { base, pagesBase });
    const url = typeof rewritten === "string" || rewritten instanceof URL ? String(rewritten) : rewritten.url;
    const parsedUrl = new URL(url, base ?? globalThis.location?.href ?? pagesBase);
    const isApi = url.startsWith(pagesBase) && parsedUrl.pathname.includes("/api/");
    const isLargeRun = /\/api\/v5\/.*\.json$/.test(parsedUrl.pathname);
    try {
      const response = await fetchImpl(rewritten, init);
      if (isApi && !isLargeRun && response.ok && (response.headers?.get("content-type") ?? "").includes("json")) {
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
      return new Response(JSON.stringify(cached.json), { status: 200, headers: cachedResponseHeaders(cached.savedAt) });
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
  const registerPlugin = globalThis.Capacitor?.registerPlugin;
  const nativeMap = plugins.FFMap ?? registerPlugin?.("FFMap");
  if (nativeMap) {
    let mapPayload = null;
    let slotObserver;
    let resizeObserver;
    let hideTimer;
    let hiddenByTransientUI = false;
    const geometry = () => {
      const slot = document.querySelector("#spots-map");
      if (!slot || !mapPayload) return null;
      const rect = slot.getBoundingClientRect();
      const header = document.querySelector(".bar, header");
      const tabbar = document.querySelector("#tabbar");
      return {
        x: rect.left + globalThis.scrollX,
        y: rect.top + globalThis.scrollY,
        width: rect.width,
        height: rect.height,
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
        tabBarTop: tabbar?.getBoundingClientRect().top ?? globalThis.innerHeight,
        theme: document.documentElement.dataset.night === "1" ? "night" : document.documentElement.dataset.theme === "light" ? "light" : "dark",
      };
    };
    const applyMap = async () => {
      const rect = geometry();
      if (!rect || hiddenByTransientUI) return;
      await nativeMap.show({ ...mapPayload, ...rect });
    };
    const detachSlotObserver = () => { resizeObserver?.disconnect(); resizeObserver = null; };
    globalThis.FFNativeMap = {
      show(payload) {
        mapPayload = payload;
        hiddenByTransientUI = false;
        clearTimeout(hideTimer);
        const slot = document.querySelector("#spots-map");
        if (slot && !resizeObserver && globalThis.ResizeObserver) {
          resizeObserver = new ResizeObserver(() => applyMap());
          resizeObserver.observe(slot);
        }
        return applyMap();
      },
      expand() {
        return nativeMap.expand?.();
      },
      hide() {
        mapPayload = null;
        hiddenByTransientUI = true;
        detachSlotObserver();
        return nativeMap.hide();
      },
    };
    const hideForTransientUI = () => {
      if (!mapPayload || hiddenByTransientUI) return;
      hiddenByTransientUI = true;
      nativeMap.hide({ immediate: true });  // the slot's snapshot stands in and moves with the page
    };
    // The native map sends a picture of itself; the slot shows it so swipes, previews and sheets never show an empty card.
    document.addEventListener("ffmap:snapshot", (event) => {
      const image = event.image ?? event.detail?.image;
      if (typeof image === "string" && image.startsWith("data:image/")) document.documentElement.style.setProperty("--ff-map-snapshot", `url("${image}")`);
    });
    const restoreAfterTransientUI = () => {
      if (!mapPayload) return;
      hiddenByTransientUI = false;
      applyMap();
    };
    // No per-scroll work: the native map lives inside the web view's scroll view, so it scrolls natively and masks
    // itself from contentOffset. Re-sending the map on every scroll event cost frames.
    globalThis.addEventListener("resize", () => applyMap(), { passive: true });
    globalThis.addEventListener("orientationchange", () => setTimeout(applyMap, 200), { passive: true });
    document.addEventListener("v5:tab", () => { hideForTransientUI(); setTimeout(restoreAfterTransientUI, 300); });
    let gestureStart = null;
    document.addEventListener("touchstart", (event) => { gestureStart = event.touches?.[0] ? [event.touches[0].clientX, event.touches[0].clientY] : null; }, { passive: true });
    document.addEventListener("touchmove", (event) => {
      const point = event.touches?.[0];
      if (gestureStart && point && Math.abs(point.clientX - gestureStart[0]) > 14 && Math.abs(point.clientX - gestureStart[0]) > Math.abs(point.clientY - gestureStart[1]) * 1.25) hideForTransientUI();
    }, { passive: true });
    document.addEventListener("touchend", () => { gestureStart = null; setTimeout(restoreAfterTransientUI, 300); }, { passive: true });
    document.addEventListener("DOMContentLoaded", () => {
      const root = document.querySelector("#sheet-root");
      if (root && globalThis.MutationObserver) {
        slotObserver = new MutationObserver(() => {
          const open = root.childElementCount > 0;
          clearTimeout(hideTimer);
          if (open) { hideForTransientUI(); }
          else { hideTimer = setTimeout(restoreAfterTransientUI, 160); }
        });
        slotObserver.observe(root, { childList: true });
      }
      const themeObserver = new MutationObserver(() => applyMap());
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-night"] });
    }, { once: true });
  }

  const notifyPlugin = plugins.LocalNotifications ?? registerPlugin?.("LocalNotifications");
  if (notifyPlugin) {
    let closuresPromise;
    let notifyEnabled = (() => { try { return JSON.parse(localStorage.getItem("v5proto.notifications") ?? "false") === true; } catch { return false; } })();
    const status = async () => {
      try { return await notifyPlugin.checkPermissions(); }
      catch { return { display: "denied" }; }
    };
    const loadClosures = () => closuresPromise ??= import("../v5/spots.js").then((mod) => mod.SPOTS ?? mod.default ?? []).catch(() => []);
    const ownPendingIds = async () => {
      try {
        const pending = await notifyPlugin.getPending();
        return (pending.notifications ?? []).filter(({ id }) => id >= 71000 && id < 72000).map(({ id }) => ({ id }));
      } catch { return []; }
    };
    globalThis.FFNotify = {
      async status() { return status(); },
      async toggle(enabled) {
        notifyEnabled = Boolean(enabled);
        if (!notifyEnabled) {
          await notifyPlugin.cancel({ notifications: await ownPendingIds() });
          return { enabled: false, permission: (await status()).display };
        }
        const permission = await status();
        const granted = permission.display === "granted" || (await notifyPlugin.requestPermissions()).display === "granted";
        notifyEnabled = granted;
        if (!granted) {
          try { localStorage.setItem("v5proto.notifications", "false"); } catch {}
          await notifyPlugin.cancel({ notifications: await ownPendingIds() });
        }
        return { enabled: granted, permission: granted ? "granted" : "denied" };
      },
      async sync({ favorites = [], run, tomorrowRun = null } = {}) {
        if (!notifyEnabled || !run) return { scheduled: 0 };
        const permission = await status();
        if (permission.display !== "granted") {
          notifyEnabled = false;
          try { localStorage.setItem("v5proto.notifications", "false"); } catch {}
          return { scheduled: 0, permission: permission.display };
        }
        const old = await ownPendingIds();
        if (old.length) await notifyPlugin.cancel({ notifications: old });
        const closures = await loadClosures();
        let nextRun = tomorrowRun;
        if (!nextRun) {
          try {
            const response = await globalThis.fetch(new URL("../../api/v5/tomorrow.json", globalThis.location.href));
            if (response.ok) nextRun = await response.json();
          } catch { /* current forecast still schedules independently */ }
        }
        const notifications = buildNotificationSchedule({ favorites, run, tomorrowRun: nextRun, closures });
        if (notifications.length) await notifyPlugin.schedule({ notifications });
        return { scheduled: notifications.length };
      },
    };
    notifyPlugin.addListener?.("localNotificationActionPerformed", ({ notification }) => {
      const { spotId, mode } = notification?.extra ?? {};
      if (spotId) document.dispatchEvent(new CustomEvent("ffnotify:open", { detail: { spotId, mode } }));
    });
  }
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
    const savedTheme = (() => { try { return localStorage.getItem("v5proto.theme") ?? "dark"; } catch { return "dark"; } })();
    const syncNativeBackground = () => {
      let theme = savedTheme;
      try { theme = localStorage.getItem("v5proto.theme") ?? savedTheme; } catch {}
      const backgroundColor = theme === "night" ? "#000000" : theme === "light" ? "#F3F6F9" : "#0B1117";
      document.documentElement.style.backgroundColor = backgroundColor;
      document.body.style.backgroundColor = backgroundColor;
      document.querySelectorAll("#root, main").forEach((element) => { if (getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)") element.style.backgroundColor = backgroundColor; });
      globalThis.Capacitor?.Plugins?.FFMap?.setBackgroundColor?.({ color: backgroundColor }).catch?.(() => {});
    };
    syncNativeBackground();
    new MutationObserver(syncNativeBackground).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-night"] });
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
