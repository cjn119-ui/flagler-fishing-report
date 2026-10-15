# Redesign — implement the owner's concept (.agent-handoff/concept.webp)

Owner decisions (2026-10-10):
- Verdicts stay **GO / MAYBE / SKIP** + fit words. Restyle only (green/amber/red badge, friendly headline). No letter grades, no re-scoring. Never "chance"/"AI-powered".
- Spots map = **native Apple Maps** (MapKit) in the iOS app; web keeps a list fallback.
- Imagery = **licensed stock** (public domain / CC0 / CC BY / CC BY-SA only, credited in-app).
- In scope: **favorite spots**, **tide chart on Plan**, **hourly forecast table on Plan**, **notifications** (local, see Job B), plus the existing **Log** tab (5 tabs total: Today, Spots, Species, Plan, Log).
- Everything already queued in tasks-3.md (motion, sheet-close fix, night palette, tabbar slide, species-label fixes) is part of this redesign.

## Visual language (from concept)
- Deep navy ocean background (gradient ~#06121F → #0B1E30), translucent navy cards (radius 22–24, hairline light border, soft shadow), cyan accent (#38B6F0-ish), green/amber/red verdict colours. Large bold left-aligned page titles ("Spots", "Species", "Plan") with icon buttons on the right. Pill filter chips. Tab bar: icon + label, active = cyan tint + filled icon + sliding indicator.
- Keep the three themes: Dark (= the concept look, default by day), Night (true black variant, palette from tasks-3 §4), Light (concept translated to light surfaces; Plan's white "Daily Outlook" card shows how).
- Photography: full-bleed hero image on Today (pier at sunrise/sunset), photo thumbnails on spot cards/rows, fish images on Species. Until images exist, use tasteful gradient placeholders with the same aspect ratios — never broken images.

## Screens
**Today** — hero photo (≈42% of viewport) with overlay: location pin + spot name (tappable = spot picker), date; glass conditions strip over the hero's bottom edge: air temp + sky, wind (speed + dir), water temp. "Fishing Outlook" card: verdict badge (GO/MAYBE/SKIP) + headline + one-line reason. Horizontal species row (image, name, fit word). "Best Fishing Windows" card: smooth curve of the day's suitability (existing slots) with window markers and 2–3 window times beneath. Existing detail (targets, why, confidence, sources, alerts) follows below, restyled; nothing removed.
**Spots** — title + search + filter; mode chips (All/Surf/Pier/Inshore); native map region at top (Job B contract below; web: compact list header); selected-spot card: photo, name, ♥ favorite, verdict pill ("GO · Great right now"), target species line, 3 mini stats (surf/wave height, tide direction, wind), "View details". Full spot list below with verdict + favorites first.
**Species** — title + search; horizontal circular-avatar carousel (selected ring); large fish image; name, ♥ (optional), season + modes line; segmented tabs Overview / Techniques / Bait & Gear / Best Times (content from species.js setupFor + engine); "Fishing Outlook" card with verdict; "Best Times Today" bar chart; "Recommended Spots" rows with thumbnails + fit word. Apply tasks-3 §7 label fixes (eligibility reasons, trip rate, realistic-first). Keep an "All species" grid reachable (e.g. from search/“See all”).
**Plan** — title; 7 day chips (Today, Wed Oct 22…); "Daily Outlook" card with verdict badge + copy; 4-up conditions (temp/sky, wind, waves, water); **Tide chart** (smooth curve, high/low markers with times + heights, now-marker) from `inputs.observations` kind `tidePredictions` for the selected spot; **Hourly Fishing Forecast** table (time, sky icon, conditions text e.g. "E 8 mph, 2–3 ft", outlook word coloured) from `hourlyForecast` + `waves`/`waveForecast` + run slots. Days 3–7 keep their outlook semantics.
**Log** — same language; empty-state illustration; stats; entries with species thumbnails.
**⋯ sheet** — Appearance (Auto/Dark/Night/Light), Notifications (iOS only, Job B), Favorites management, Share, Credits (image attributions), data-source notes.

## Data rules
Only show values present in the run JSON (or the existing live fetches); hide a tile when missing; label stale/fallback data as today. Per-spot observations are in `run.inputs.observations` (kinds: alerts, gridForecast, hourlyForecast, pressureObservations, tidePredictions, waterTemperature, waves, waveForecast). Units: waves m → ft.

## Job B contract (native, after Job A)
Job A renders on Spots: `<div id="spots-map" class="native-map-slot">` (fixed height, non-scrolling region at top of the Spots tab) and calls `window.FFNativeMap?.show({ spots:[{id,name,lat,lon,verdict,favorite}], selectedId, mode })` on enter/update and `window.FFNativeMap?.hide()` on leave; listens for `document` event `ffmap:select` {detail:{id}}. When FFNativeMap is absent (web), render a list header instead.
Notifications: Job A renders the toggle only when `window.FFNotify` exists and calls `FFNotify.sync({ favorites, run })` after each successful data refresh.
