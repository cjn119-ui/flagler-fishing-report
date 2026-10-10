import assert from "node:assert/strict";
import { buildNotificationSchedule, cachedResponseHeaders, createCachedFetch } from "./bridge.js";

const now = Date.parse("2026-10-10T12:00:00Z");
const day = {
  date: "2026-10-10",
  verdict: "GO",
  windows: [{ locationId: "open-beach", locationName: "Open Beach", mode: "surf", start: "2026-10-10T14:00:00Z", end: "2026-10-10T16:00:00Z" }],
  topSpecies: [{ name: "Redfish" }],
};
const run = {
  targetDate: "2026-10-10",
  days: [day],
  scopeViews: { byLocation: {
    "open-beach:surf": { recommendation: { verdict: "GO", locationId: "open-beach", displayName: "Open Beach", mode: "surf", window: { start: "2026-10-10T14:00:00Z", end: "2026-10-10T16:00:00Z" }, targets: [{ name: "Redfish" }] } },
    "staug-pier:pier": { recommendation: { verdict: "GO", locationId: "staug-pier", displayName: "St. Augustine Pier", mode: "pier", window: { start: "2026-10-10T14:00:00Z", end: "2026-10-10T16:00:00Z" }, targets: [{ name: "Sheepshead" }] } },
    "open-beach:inshore": { recommendation: { verdict: "MAYBE", locationId: "open-beach", displayName: "Open Beach", mode: "inshore", window: { start: "2026-10-10T14:00:00Z", end: "2026-10-10T16:00:00Z" } } },
  } },
};
const notifications = buildNotificationSchedule({
  favorites: ["open-beach", "staug-pier"],
  run,
  closures: [{ id: "staug-pier", closures: [{ status: "closed", modes: ["pier"] }] }],
  now,
});
assert.equal(notifications.length, 1, "schedule only open GO windows for favorites");
assert.equal(notifications[0].title, "GO at Open Beach");
assert.equal(notifications[0].body, "surf · 10:00 AM–12:00 PM · Redfish");
assert.equal(notifications[0].schedule.at.toISOString(), "2026-10-10T13:00:00.000Z", "60-minute lead when the window is more than an hour away");

const closer = buildNotificationSchedule({
  favorites: ["open-beach"],
  now: Date.parse("2026-10-10T13:40:00Z"),
  run: { days: [{ ...day, windows: [{ ...day.windows[0], start: "2026-10-10T14:00:00Z" }] }] },
});
assert.equal(closer[0].schedule.at.toISOString(), "2026-10-10T13:50:00.000Z", "10-minute lead for near windows");
const tooSoon = buildNotificationSchedule({ favorites: ["open-beach"], now: Date.parse("2026-10-10T13:51:00Z"), run });
assert.equal(tooSoon.length, 0, "skip windows starting in under ten minutes");
const tomorrow = buildNotificationSchedule({
  favorites: [{ spot: "open-beach" }],
  now,
  run: { days: [] },
  tomorrowRun: { days: [{ date: "2026-10-11", verdict: "GO", windows: [{ ...day.windows[0], start: "2026-10-11T14:00:00Z", end: "2026-10-11T16:00:00Z" }] }] },
});
assert.equal(tomorrow.length, 1, "include a passed tomorrow run when its favorite spot window is within 48 hours");
assert.equal(tomorrow[0].schedule.at.toISOString(), "2026-10-11T13:00:00.000Z");

const headers = cachedResponseHeaders(now);
assert.equal(headers["x-flagler-ios-cache"], new Date(now).toISOString());

const entries = new Map();
const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
let offline = false;
const fetcher = createCachedFetch({
  base: "capacitor://localhost/v5/proto/",
  pagesBase: "https://cjn119-ui.github.io/flagler-fishing-report/",
  storage,
  now: () => now,
  fetchImpl: async () => {
    if (offline) throw new TypeError("offline");
    return new Response(JSON.stringify({ body: "x" }), { headers: { "content-type": "application/json" } });
  },
});
await fetcher("../../api/v5/today.json");
assert.equal(entries.size, 0, "large v5 run responses are not put into the bridge localStorage cache");
await assert.rejects(() => { offline = true; return fetcher("../../api/v5/today.json"); }, TypeError);

offline = false;
await fetcher("../../api/live/small.json");
offline = true;
const cached = await fetcher("../../api/live/small.json");
assert.equal(cached.headers.get("x-flagler-ios-cache"), new Date(now).toISOString(), "served cache carries its saved-at timestamp");

console.log("iOS notification schedule and cache header checks passed.");
