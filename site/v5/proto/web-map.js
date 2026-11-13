// Interactive coastal map for the web build (the iOS app uses its native MapKit plugin instead).
// One Leaflet instance is kept alive across Explore re-renders and re-attached into each new placeholder.
const LEAFLET = new URL("./vendor/leaflet/", import.meta.url);
const VERDICT_COLOR = { GO: "#74E0D4", MAYBE: "#F5C973", SKIP: "#8C98A4" };
let leafletPromise = null, state = null;

function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  leafletPromise ??= new Promise((resolve, reject) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("leaflet.css", LEAFLET).href; document.head.append(css);
    const js = document.createElement("script"); js.src = new URL("leaflet.js", LEAFLET).href;
    js.onload = () => resolve(globalThis.L); js.onerror = () => { leafletPromise = null; reject(new Error("Map library unavailable")); };
    document.head.append(js);
  });
  return leafletPromise;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pinIcon = (L, spot, selected) => L.divIcon({ className: "ff-pin-wrap", iconSize: [28, 28], iconAnchor: [14, 14],
  html: `<span class="ff-pin${selected ? " on" : ""}${spot.favorite ? " fav" : ""}" style="--pin:${VERDICT_COLOR[spot.verdict] ?? VERDICT_COLOR.SKIP}" aria-hidden="true"></span>` });

/** Mount (or move) the persistent map into `slot`. `api` = { spots, selectedId, dark, onOpen(id), onPoint({lat,lon}) }. */
export async function mountWebMap(slot, api) {
  const L = await loadLeaflet();
  if (!state) {
    const host = document.createElement("div"); host.className = "ff-map"; host.setAttribute("role", "application"); host.setAttribute("aria-label", "Map of fishing spots. Long press near the shoreline to fish a custom point.");
    const map = L.map(host, { zoomControl: true, attributionControl: true, zoomSnap: 0.5, scrollWheelZoom: false, tap: false, worldCopyJump: false, maxBounds: [[23, -89], [32.5, -78]], minZoom: 6 });
    state = { L, host, map, tiles: null, markers: new Map(), tileKind: null, fitted: false, api };
    map.on("contextmenu", (e) => state.api.onPoint?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
    map.attributionControl.setPrefix(false);
  }
  state.api = api;
  if (slot.firstChild !== state.host) slot.replaceChildren(state.host);
  updateWebMap(api);
  requestAnimationFrame(() => { state.map.invalidateSize(); });
}

export function updateWebMap(api) {
  if (!state) return;
  const { L, map } = state; state.api = api;
  const kind = api.dark ? "dark" : "light";
  if (state.tileKind !== kind) {
    state.tiles?.remove(); state.labels?.remove();
    const base = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/", name = api.dark ? "World_Dark_Gray" : "World_Light_Gray";
    const opts = { maxZoom: 16, attribution: "Tiles \u00a9 Esri \u2014 Esri, DeLorme, NAVTEQ, OpenStreetMap contributors" };
    state.tiles = L.tileLayer(`${base}${name}_Base/MapServer/tile/{z}/{y}/{x}`, opts).addTo(map);
    state.labels = L.tileLayer(`${base}${name}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: "overlayPane", opacity: 0.9 }).addTo(map);
    state.tileKind = kind;
  }
  const seen = new Set();
  for (const spot of api.spots) {
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) continue;
    seen.add(spot.id);
    const icon = pinIcon(L, spot, spot.id === api.selectedId);
    let marker = state.markers.get(spot.id);
    if (!marker) {
      marker = L.marker([spot.lat, spot.lon], { icon, keyboard: true, title: spot.name, alt: spot.name }).addTo(map);
      marker.on("click", () => state.api.onOpen?.(spot.id));
      state.markers.set(spot.id, marker);
    } else { marker.setLatLng([spot.lat, spot.lon]); marker.setIcon(icon); }
    marker.options.title = spot.name;
    marker.unbindTooltip().bindTooltip(`${esc(spot.name)} · ${esc(spot.verdictLabel ?? spot.verdict ?? "")}`, { direction: "top", offset: [0, -12] });
  }
  for (const [id, marker] of state.markers) if (!seen.has(id)) { marker.remove(); state.markers.delete(id); }
  if (!state.fitted && seen.size) { recenterWebMap(); state.fitted = true; }
}

/** Fit the map to the listed spots (the "Show locations" control). */
export function recenterWebMap() {
  if (!state) return;
  const pts = [...state.markers.values()].map((m) => m.getLatLng());
  if (!pts.length) { state.map.setView([29.6, -81.2], 9); return; }
  state.map.fitBounds(state.L.latLngBounds(pts).pad(0.25), { maxZoom: 11, animate: false });
}

export function flyToWebMap(lat, lon, zoom = 12) { state?.map.flyTo([lat, lon], zoom, { duration: 0.6 }); }
