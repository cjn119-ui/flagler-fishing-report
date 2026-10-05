# Flagler Fishing V5 — product & build spec

V5 is the foundation of a future fishing app, not a prettier report. It answers one question set, in about 10 seconds:
**Should I fish? Where? What should I target? When? What should I use?**

The user never interprets raw weather, tide, solunar, wind, pressure, swell or temperature data. The app reads it and says what to do.

| Principle | What it means in the product |
|---|---|
| Hyperlocal | St. Augustine → Flagler shore fishing only; every recommendation names a real access point from the catalog. |
| Action-oriented | Top of screen is an instruction (GO / MAYBE / SKIP + where + when + what), never a data table. |
| Species-specific | Suitability and setup are per fish, per mode; "good for pompano" can differ from "good for redfish" at the same spot. |
| Explainable | Every verdict has a plain-language "Why" one tap away; raw numbers are two taps away and optional. |
| Fast | Key answer readable in ~10 seconds, rendered from the last-known run before any network call completes. |
| Honest | Missing or stale data lowers confidence and is said out loud; suitability is never presented as a catch probability. |

Not a weather dashboard: if a screen could be mistaken for a weather app, it has drifted. Out of scope: accounts, social, chat, nationwide coverage, nautical charts, big infrastructure.

Differentiation (why not Fishbrain / Fishing Points / Fishbox): local-only depth, one decisive answer instead of maps and feeds, and an explanation tied to this week's conditions plus local survey history.

Two report concepts, one engine: **Morning** = current-day report (`horizon: today`), **Evening** = next-day report (`horizon: tomorrow`). Same `buildPredictionRun`; presentation may differ, calculation may not.

## Decisions (owner-approved 2026-10-05)

Product decisions on navigation, backups, GO at Moderate confidence, default scope, species focus and outlook labels: see `docs/v5-product-decisions.md` (owner-approved; wins over the Product spec below where they differ).

| Topic | Decision |
|---|---|
| Path | `site/v5/` alongside the current app; root `/`, v1–v3 untouched. |
| Launch region | St. Augustine → Flagler (11 active locations in `site/v5/spots.js`). Jax/Nassau rows stay cataloged with `active: false`. Volusia excluded for now. |
| Modes | surf, pier, inshore (ICW/river/inlet). |
| Headline | GO / MAYBE / SKIP. Species show a 0–100 **suitability** (labelled as such, never "chance"). Historical catch rate shown separately, counted as trips: "4 in 10 local shore trips caught one in October" when the month has ≥ 80 trips, otherwise a band ("about 3–5 in 10 trips"). (Amended 2026-10-05.) |
| Persistence | Supabase schema as versioned SQL migrations in the repo only. Do not create or write to a live project. |
| Buoys in browser | SECOORA ERDDAP CDIP mirror (CORS OK) via `buoyUrls()` in `spots.js`; NDBC copy in `api/live/marine.json` is the fallback. |
| Look | Main report (`site/style.css`) app shell — compact dark-slate cards, score ring, hourly strip, stat tiles, ranked list, 7-day bars — plus the v1/v3 sunset hero and cyan pill buttons (`site/v3/theme.css`) for the location header. Light and dark. |
| Stack | Vanilla ES modules, no framework, no build step, no npm deps (matches repo). Relative URLs, hash routing — wrappable later by Capacitor. |


## Product spec

> Owner of this part: product/UX. The technical sections below must serve it; where they can't, see **Product requirements for the technical architecture**. Priority tags: **P0** = V5 launch, **P1** = build if time allows, never at the cost of P0 polish.

### Vocabulary (use these terms in UI, code comments and tests)

| Term | Meaning |
|---|---|
| Verdict | GO / MAYBE / SKIP for one recommendation (a location + mode + window, or a day in the planner). |
| Suitability | 0–100 per species: how well conditions fit that fish *in that mode*. Shown as "Suitability". Never "chance", "odds", "probability". |
| Historical rate | Share of surveyed local shore anglers who caught the species in that month, shown as "N in 10". Independent of today's conditions. |
| Confidence | 0–100, High / Moderate / Low: how complete and fresh the data behind this answer is. It is not how sure the fish are. |
| Window | A 60–150 min stretch where conditions peak for a location + mode. |
| Scope | What Today is answering for: **Best anywhere** (default), or one **Spot**. A **Species focus** can be layered on top. |
| Backup | The next-best alternative that differs in location, mode, window or species. |
| Outlook | Days 3–7 in the planner: season-and-forecast-based, labelled as such. |

### User journeys

| Journey | Steps | Must be true |
|---|---|---|
| **First open** | Open `/v5/` → Today renders instantly from `api/v5/<horizon>.json` with scope *Best anywhere* → one dismissible line under the verdict: "Suitability = how well conditions fit each fish. It is not a catch chance." | No onboarding screens, no sign-in, no permission prompts. Geolocation and install are requested only when the user taps "Near me" / "Install". Answer visible without scrolling at 375 px. |
| **Returning user** | Open → last-known run renders at once with "Updating…" in the freshness chip → fresher run swaps in without layout jump. Remembers scope, favourites, species focus (session only), last mode, horizon override (session only). | Never a blank or spinner-only screen when a cached run exists. If the new verdict differs from the cached one, the verdict cross-fades (no flashing); aria-live announces it. |
| **"Where should I go right now?"** | Today, scope *Best anywhere*, horizon *Today* → Best bet card names spot · mode · window; if the window is open: "Fish now — until 8:25 AM". Tap *Spots* for the full ranking. | Windows already ended are never presented as the best bet; the next window is. Between windows: "Next window 5:40 PM". |
| **"I want pompano"** | Species tab → tap Pompano → species sheet (suitability now, best place/window, setup, history) → **Target this** → Today re-ranks for pompano and shows a removable "Targeting: Pompano ✕" chip. | The verdict is relative to the focus ("GO for pompano"), labelled as such. If the species is a poor fit everywhere: SKIP for that species plus a pointer to what *is* working ("Whiting is the better bet today"). Removing the chip restores *Best anywhere*. |
| **Evening: "Should I go tomorrow?"** | After the evening cutoff (default 3:00 PM local, one exported constant) Today opens on **Tomorrow**. A *Today · Tomorrow* segmented control is always visible. | Tomorrow header reads "Tomorrow morning" / "Tomorrow evening" from the window. A "vs today" line states better / similar / worse. If today still has an open window, a one-line pointer remains ("Today's window: 5:40–7:10 PM"). |

### Above the fold — Today on a 375 × 667 phone

Budget ≈ 560 px of content height (667 minus status bar and the 56 px tab bar). Order is fixed; if something has to drop below the fold, drop from the bottom of this list.

| # | Block | Content | Approx. height |
|---|---|---|---|
| 1 | Header (sunset hero, compact) | Spot pill (tap ⇒ spot sheet; shows "Best anywhere" or the spot name) · *Today / Tomorrow* segmented control · freshness chip ("Updated 6:12 AM") | 88 |
| 2 | **Verdict + headline** | Ring/badge with **GO / MAYBE / SKIP** (word + icon, not number) · one-line headline ("Pompano & whiting on the incoming tide") · when-line ("Tomorrow morning · 6:40–8:25 AM") | 150 |
| 3 | **Best bet** | Spot name · mode chip (Surf / Pier / Inshore) · window · "Fish now — until …" if open | 64 |
| 4 | **Targets** | Top 3 species, one line each: name · suitability bar · number. Label "Suitability" once in the card header | 112 |
| 5 | **Use** | One line: "Sand fleas or Fishbites on a pompano rig" | 48 |
| 6 | Confidence | One line: "Confidence: High · 78" + stale/partial chip when relevant | 40 |
| — | *Below the fold* | **Backup** (first card below the fold; keep it within one scroll) → Why → Best times timeline → Conditions → Today vs Tomorrow → Other spots teaser → Data & sources | |

Ordering rules: verdict is always the largest element; no raw units above the fold; no more than 3 targets; no tables; nothing above the fold requires a tap to make sense.

#### Today screen — card inventory (P0 unless noted)

| Card | Level shown | Notes |
|---|---|---|
| Verdict hero | Glance | Tap ⇒ scrolls to Why. |
| Best bet | Glance | Tap ⇒ spot detail sheet (access, parking, tips from catalog). |
| Targets | Glance → Card | Tap a species ⇒ species sheet. "Local history" toggle reveals the "N in 10" line per species. |
| Use | Glance → Card | Tap ⇒ full setup (where to fish, bait, lures, rig, tip) for the #1 target. |
| Backup | Card | One line + reason ("Backup: ICW redfish after 9:30 AM — wind drops and the tide turns"). Tap ⇒ makes it the scope. |
| Why | Card → Expanded | Up to 3 "helps" rows and the worst "hurts" row, each with an icon and plain words. "See all factors" expands the rest. |
| Best times (timeline) | Card → Expanded | 24–36 h strip with the best window highlighted, light band, tide curve. Scrubber (drag/tap) is Expanded level and updates Conditions and Targets for that time. |
| Conditions | Card | 4–6 tiles in plain words with a helps/neutral/hurts indicator (see below); numeric value is secondary text. |
| Today vs Tomorrow | Card | Two compact chips with verdict + best window each, and a one-line delta. |
| Other spots (P1) | Card | Top 3 from Spots with verdict chips; "See all spots". |
| Data & sources | Expanded | Source list with timestamps, stale flags, model version. |

#### Condition indicators

Each indicator = icon + plain-word value + state marker. State is carried by **shape + colour** (not colour alone): ▲/check = helps (`--go`), dash = neutral (`--none`), ▼/triangle = hurts (`--skip`/`--mid`).

| Tile | Plain-word examples | Secondary (small, muted) |
|---|---|---|
| Wind | "Light, offshore" · "Breezy, onshore" · "Too windy" | "8 mph NW" |
| Surf (ocean modes) | "Small and clean" · "Choppy" · "Too rough" | "2 ft at 8 s" |
| Tide | "Rising" · "Falling" · "Slack" | "High 7:52 AM" |
| Water | "Comfortable for pompano" · "Cold for redfish" | "71 °F" |
| Light | "Sunrise bite window" · "Midday glare" | "Sunrise 6:48 AM" |
| Sky | "Dry" · "Storms possible after 2 PM" | "Rain 10 %" |

### Navigation model

Bottom tab bar, four tabs, always visible: **Today · Spots · Species · Plan**. Sheets are used for *selection* (spot, species detail, day detail); tabs are used for *browsing*. No hamburger menu, no nested tabs.

| Pattern | Used for | Behaviour |
|---|---|---|
| Tab (full screen) | Today, Spots, Species, Plan | Scroll position remembered per tab for the session. |
| Bottom sheet (≈ 85 % height, grab handle, swipe-down or Esc closes, focus trapped) | Spot picker, species detail, day detail, share/install | Opens over the current tab; closing returns exactly where the user was. |
| Header pill | Scope control | Spot pill (opens spot sheet) and, when set, the removable species chip. Mode switcher appears under the hero only when the scoped spot offers more than one mode. |
| URL hash | Shareable state | `#spot=<id>&mode=<mode>&species=<id>&h=<today\|tomorrow>&t=<iso>`; opening a hash restores scope exactly. Invalid ids fall back to *Best anywhere* silently. |

Primary navigation dimension: **answer first, then scope** — Today is the answer for *Best anywhere*; Spot and Species are optional scopes layered on it; Mode is a secondary control inside a spot. (See open question 1.)

#### Spot picker (sheet, also the Spots tab body)

| Behaviour | Rule |
|---|---|
| Default sort | By current-horizon recommendation (best first); ties by distance if location is known, else catalog order. |
| Row | Spot name · area · mode icons · verdict chip · best window · top species ("Pompano 84"). One tap selects; star toggles favourite. |
| First row | "Best anywhere" (the default scope) — never hidden, always selectable. |
| Favourites | Pinned above the ranked list (localStorage); star is a 44 px target. |
| Mode filter | Segmented *All · Surf · Pier · Inshore*; filters rows, does not change scope. |
| Near me | Button asks for geolocation only on tap; on success re-sorts by distance *within* verdict tiers; on denial/timeout, shows "Location is off — showing best first" and stays sorted by verdict. Coordinates are never stored or sent. |
| Selecting a spot | Sets scope, closes the sheet, returns to Today. If the scoped spot is not the overall best, Today shows a line under the verdict: "Best overall today: Flagler Beach Pier (GO)". The better option is never hidden. |
| Compare (P1) | Check up to 3 rows ⇒ comparison sheet, one column per spot: verdict, window, top 2 species, wind comfort, surf comfort. |
| Inactive spots | `active: false` catalog rows never appear. |

### GO / MAYBE / SKIP presentation rules

| Rule | Detail |
|---|---|
| Source of truth | Verdict comes from the engine; the UI never recomputes, upgrades or softens it. |
| Colour + shape + word | GO = `--go`, check icon; MAYBE = `--mid`, dash/wave icon; SKIP = `--skip`, x icon. The word is always shown; colour is never the only signal. |
| Ring | Ring arc is decorative (top suitability); centre text is the verdict word. Numbers are never shown in the ring. |
| aria | Verdict container is `aria-live="polite"`; label reads "Go. Flagler Beach Pier, surf, 6:40 to 8:25 AM." |
| GO | Headline names the fish and the cause ("Pompano & whiting on the incoming tide"). If confidence is Moderate (50–74), a visible amber qualifier sits directly under the headline: "Moderate confidence — one input is missing." Never buried in a card. |
| MAYBE | Headline names the main drag: "Decent fish fit, but wind picks up after 8 AM." Always show the best window anyway. |
| SKIP | Reason first, in plain words ("Thunderstorms forecast 2–6 PM"). A SKIP is never a dead end: always show **Next best option** (backup, next window, or tomorrow's verdict). Safety-gated SKIPs (thunder, wind, warnings, surf) use the safety icon and cannot be overridden or hidden. |
| High suitability, low confidence | Engine returns MAYBE; UI copy: "Looks good on paper, but our data is thin right now." |
| Per-species vs overall | The verdict is for the scope + focus; each target has its own suitability only, never its own verdict chip (except in species sheets, where "Best for this fish" shows the verdict for that species). |
| Tomorrow vs today | Show both verdicts; delta line is "Better tomorrow", "About the same" or "Rougher tomorrow". |
| Windows | Always local time (America/New_York), 12-hour with AM/PM, en dash ("6:40–8:25 AM"). Windows that crossed midnight are not produced. |

### Progressive disclosure

| Level | What the user sees | Reached by | Contains |
|---|---|---|---|
| **L0 Glance** (~10 s) | Verdict, headline, window, best bet, top 3 targets, Use, Confidence | Opening the app | Plain words only. |
| **L1 Card** | Backup, Why (3 helps + 1 hurts), conditions tiles, "Local history" lines, full setup | Scrolling / one tap | Plain words + small secondary numbers. |
| **L2 Expanded** | All factors with helps/neutral/hurts bars and one-sentence details, timeline scrubber, confidence reasons, Tomorrow vs today detail | "See all factors", scrubber, "Why this confidence?" | Still no weights. |
| **L3 Details** | Factor value/score/weight table, raw units, sources and timestamps, model version | "Data & sources" at page bottom | The only place weights, raw units and scores appear. Optional; nothing above depends on it. |

Rules: no level requires a lower level to be understood; expansion is in place (accordion), never navigates away; every expanded block can be collapsed; open/closed state is remembered per card for the session.

### Species

**Species tab (P0):** grid of species valid for the active region, sorted by current suitability (best first), each tile: name · suitability bar · number · best mode icon. Chip filter: *All · Surf · Pier · Inshore*. Bycatch species (catfish, croaker, blue runner per catalog) appear in a collapsed "Also biting" group and are never promoted to targets.

**Species detail sheet:**

| Block | Content |
|---|---|
| Header | Name (+ alt name) · suitability now for the current scope with band label · "Target this" button (primary, cyan pill) |
| Best for this fish | Best spot · mode · window · verdict across the horizon; tap ⇒ sets scope |
| Why now | Top 2 helps and the worst hurts, plain words |
| Use | Where in the water, bait, lures, rig, one tip (from `species.js` `setupFor(species, mode)`); mode toggle if several modes apply |
| Local history | 12-month bar chart of the shrunk historical rate, current month highlighted, sentence "4 in 10 local shore anglers caught one in October", sample-size note when low, source line (see copy rules) |
| Water-temperature fit | Strip from min to max with the comfortable band shaded and today's water temp marked; one sentence ("71 °F — comfortable for pompano") |
| Rules link | "Check current FWC rules" link; the app never states size or bag limits |

Suitability bands (labels shown beside the number in sheets and L1; matches verdict thresholds): **70–100 Great fit · 50–69 Decent fit · 30–49 Poor fit · 0–29 Not a fit.**

### 7-day planner (Plan tab)

| Element | Rule |
|---|---|
| Rows | One per day: weekday + date · verdict chip · best window · top species (name only) · one-line reason ("Falling tide at sunrise, light wind"). |
| Days 1–2 (today, tomorrow) | Real predictions: GO/MAYBE/SKIP, solid chips. |
| Days 3–7 | **Outlook**: outline-style chips labelled **Promising / Mixed / Tough** (never GO), "Outlook" tag on each row, no suitability numbers. Copy at top: "Outlook for days 3–7 uses season, tides, moon and the daily forecast. It updates daily." |
| Scope | Follows the current scope and species focus; scope chip shown at top. |
| Tap a day | Day sheet: best 2 windows (spot · mode · window · top species), a "Why" row, and for days 1–2 a "Use" row. |
| Best day | The best day in the 7 gets a subtle "Best day this week" marker. |
| Empty week | If every day is Tough/SKIP: "Rough week ahead — [best day] is the least bad." |

### States and example copy

Every state keeps the tab bar and the last-known content where it exists. States never use raw error codes.

| State | When | Presentation | Example copy |
|---|---|---|---|
| **Loading, no cache** (first ever open, offline-safe) | No cached run, fetch in flight | Skeleton of the verdict hero + 3 target lines; no spinner-only screen; aria-busy | "Reading the water…" |
| **Loading, cached** | Cached run exists, refreshing | Cached content at full opacity; freshness chip shows a small spinner | Chip: "Updating…" |
| **Fresh** | Run age under 90 min (the scheduled build runs every 30 min) | Chip normal | "Updated 6:12 AM" |
| **Aging** | 90 min – 6 h | Chip muted grey, verdict unchanged | "Updated 3 hrs ago" |
| **Stale** | Over 6 h, or past `validTo` | Amber banner above the hero; verdict ring desaturated and labelled; windows already past are struck through and the next one is promoted | Banner: "This report is from yesterday evening. Pull to refresh." Ring caption: "Last known" |
| **Offline** | No network (navigator or fetch failure) and cached run | Banner with the cached run's time; refresh button disabled with explanation; everything else works | "Offline — showing the report from 6:12 AM." |
| **Offline, no cache** | No network and nothing cached | Full-screen friendly empty with retry | "No report saved yet. Connect once to download today's report." |
| **Partial data** | One or more sources missing/stale but run succeeded (`confidence` lowered) | Verdict stays; Moderate/Low confidence qualifier under the headline; amber "partial" chip; Data & sources lists exactly what's missing | "Wave data is 5 hours old, so confidence is lower." |
| **Source down at build** | Whole run carried forward from a previous build | Treated as Stale; banner explains | "Live data is unavailable. Showing the last report from 4:40 AM." |
| **Error (cannot render)** | Contract validation fails or JSON corrupt | Never white-screen; show last valid run if any, else the error empty state | "Something went wrong reading the report. Try again, or check back in a few minutes." (button: Try again) |
| **No window** | No slot meets bounds in the horizon | Verdict SKIP with no Best bet; Next best option still shown | "No good window today. Tomorrow morning looks better." |
| **Safety SKIP** | Gate active | Safety icon, reason with time range | "Skip: thunderstorms forecast 2–6 PM." |
| **Species not a fit** | Species suitability < 30 everywhere in horizon | Species sheet header band "Not a fit"; explains the limiting factor; suggests alternative | "Not a fit this week — the water is too cold for pompano. Whiting is the better bet." |
| **Spot has no window** | Scoped spot has nothing today | Spot-scoped Today shows SKIP with Best overall line | "Nothing great at Bings Landing today. Best overall: Flagler Beach Pier." |
| **Geolocation denied/unavailable** | Near me tapped | Inline message in the spot sheet, no blocking dialog | "Location is off — showing best spots first." |
| **Empty favourites** | No favourites | Hidden section (no empty box) | — |
| **Reduced motion** | `prefers-reduced-motion` | No cross-fades, ring fills instantly | — |

### Copy guidelines

| Topic | Rule | Do | Don't |
|---|---|---|---|
| Voice | Plain, local, calm, short; second person; verbs first; no hype. | "Fish the incoming tide at sunrise." | "Epic bite window!!" |
| Suitability | Always labelled "Suitability" (or "fit"); first-use hint explains it; never as a catch percentage. | "Pompano — suitability 84" · "Great fit" | "84 % chance", "odds", "likely to catch" |
| Historical rate | Separate line, "N in 10", month, who, source; rounded to the nearest tenth; never merged with suitability. | "4 in 10 local shore anglers caught one in October." | "40 % success", "you'll catch…" |
| Low sample | Say it is thin; don't hide it. | "Fewer surveys for this month, so treat this as a rough guide." | Showing a precise rate from tiny n |
| Confidence | Word + number, describes *data*, with a reason. | "Confidence: High · 78 — forecast, tides and waves are current." | "78 % sure", "guaranteed" |
| Certainty words | Hedge forecasts, not facts. | "Looks good", "should", "favours" | "guaranteed", "sure thing", "can't miss", "will bite" |
| Words to avoid in UI | chance, probability, odds, guarantee(d), epic, hotspot, "limits", any size/bag limit, raw jargon (hPa, Hs, MLLW, "solunar" — say "moon timing"), "unlikely" for suitability bands | | |
| Numbers | Raw units only at L1 secondary and L3; times 12-hour local; "mph", "ft", "°F". | "Light wind, 8 mph" | "NW 7.2 kt gust 11.4" |
| Backup | Always state the reason. | "Backup: ICW redfish after 9:30 AM — the wind drops and the tide turns." | "Backup: ICW" |
| Regulations | Link, never state. | "Check current FWC rules." | "Pompano limit is …" |
| Headline | ≤ ~60 characters, species + cause. | "Pompano & whiting on the incoming tide" | "Optimal conditions detected" |
| Tone for SKIP | Honest, helpful, never shaming. | "Skip today — storms 2–6 PM. Tomorrow morning looks better." | "Bad day." |

**Reference output (the hero example the UI must be able to render exactly):**

> **Tomorrow morning: GO** · Best bet: Flagler Beach surf · 6:40–8:25 AM · Targets: Pompano 84, Whiting 79, Bluefish 65 · Use: sand fleas or Fishbites on a pompano rig · Why: incoming tide + sunrise overlap + manageable surf + favorable wind · Backup: ICW redfish after 9:30 AM · Confidence: High · 78

### Other UI requirements (carried over)

- Share: Web Share API with a copy-link fallback (`#spot=…&mode=…&species=…&h=…`). Pull-to-refresh and a refresh button. Install prompt on explicit tap only. Explicit source timestamps and stale chips. `prefers-reduced-motion` respected. Keyboard and screen-reader friendly: real buttons, `aria-pressed` on toggles, `aria-live` on the verdict, 44 px minimum targets, focus trap in sheets, visible focus ring.
- Visual: root-app shell (dark-slate cards, score ring, hourly strip, stat tiles, ranked list, 7-day bars) plus the v1/v3 sunset hero and cyan pill buttons for the header. Light and dark. No new design language.
- Phone first (375 px), then 560 px column on desktop (same `max-width` as the root app). No horizontal scroll.

## Product requirements for the technical architecture

> For the architecture owner to reconcile. The UI renders `PredictionRun` objects only; it must not compute scores, labels or rankings. Anything below the UI would have to derive should be an engine output.

| # | Requirement | Needed for |
|---|---|---|
| 1 | `Recommendation.headline` (≤ ~60 chars, species + cause), `Recommendation.whenLabel` ("Tomorrow morning · 6:40–8:25 AM"), and `Recommendation.useLine` ("Sand fleas or Fishbites on a pompano rig"). | Above-the-fold copy; consistent widgets/notifications. |
| 2 | Human reason for every non-GO: `Recommendation.reason {code, text}` and `gates[] {code, text, startsAt, endsAt, severity}` with plain-language text including time range. | SKIP/MAYBE headline, safety states. |
| 3 | Per-factor human output on `PredictionFactor`: `effect` ("helps"/"neutral"/"hurts"), `group` (tide, light, wind, surf, water, season, moon, weather, pressure), `humanLabel`/`summary` in plain words, `limiting: boolean`. Keep `value/score/weight` for L3. | Why card, condition tiles, indicators. |
| 4 | `Conditions` plain-word labels: `wind.label`, `waves.label`, `tide.label`, `waterTemp.label` ("comfortable for pompano"), `sky.label`. | Condition tiles. |
| 5 | `backup.reason` (string), `backup.kind` ("other-mode" / "other-spot" / "later-window" / "other-species"), and backup `verdict` + `suitability`; backup verdict never exceeds primary. | Backup card. |
| 6 | Per-species target entries carry `name`, `suitability`, `band` ("great"/"decent"/"poor"/"none"), and `historicalRate` object `{rate, n, month, lowSample, sourceLabel}` (shrunk rate; never raw). | Targets card, species sheet, copy rule on low sample. |
| 7 | `seasonCurve[12]` per species and mode: shrunk historical rate by month (engine's shrinkage, not raw monthly n). | Species 12-month chart; avoids the UI showing tiny-n rates. |
| 8 | `waterFit` per species and location: `{state: "ideal"/"ok"/"cold"/"hot", text, minF, idealLowF, idealHighF, maxF, currentF}`. | Water-temperature strip. |
| 9 | Per-location recommendation: `locations[].recommendation` (best mode, window, verdict, top species, `rank`) so Spots needs no client scoring; verdict per location × mode × window. | Spot picker, Spots tab, compare. |
| 10 | Species index: `bySpecies[speciesId] → {best: {locationId, mode, window, suitability, verdict}, fitNow}` and a species-focused recommendation (precomputed per species, or a `focusSpecies` argument to `buildPredictionRun`). | Species tab, "Target this", "GO for pompano". |
| 11 | Slot series for the timeline per location × mode: 30-min slots with `suitability`, tide height/rate/phase, light phase, moon-timing marks, per-slot top-3 species and condition labels, so the scrubber needs no engine call. | Timeline, scrubber, tiles at selected time. |
| 12 | Planner `days[7]`: `{date, kind: "forecast"/"outlook", verdict (days 1–2) or outlookLabel ("promising"/"mixed"/"tough", days 3–7), bestWindow, topSpecies[], reason, confidence}`; outlook confidence capped (never GO). | Plan tab. |
| 13 | Freshness model: `run.generatedAt`, `validTo`, `carriedForward: boolean` (+ original `generatedAt`), `status` ("ok"/"partial"/"degraded"), `missingInputs[]` in plain words. Per source: `ageMinutes`, `stale`, `usedFallback`, `affects[]` (which factors/labels it feeds). | Stale/partial/offline states, Data & sources. |
| 14 | `confidenceReasons[]` as `{code, text, penalty}` (human text), plus a one-line `confidenceSummary` ("Forecast, tides and waves are current"). | Confidence line, "Why this confidence?". |
| 15 | `comparison.delta` ("better"/"similar"/"worse") with the rule documented (suggest: ≥ one verdict step or ≥ 10 suitability points), plus `recommendedHorizon` and reason (replaces a UI-only cutoff; the UI cutoff is only a fallback). | Today vs Tomorrow, evening mode default. |
| 16 | Display names: `displayName` for location+mode ("Flagler Beach Pier · surf" only when a location has several modes), `modeLabel`, window `partOfDay` ("dawn", "morning", "midday", "afternoon", "dusk", "evening"). | Best bet card, headlines. |
| 17 | Setup output per mode: structured `{where, bait[], lures[], rig, tip}` plus one-line `useLine`; `tip` from `species.js`. | Use card, species sheet. |
| 18 | Window flags the UI cannot cheaply know: `isOpenNow`, `endsInMin` or `startsInMin` relative to `generatedAt`; windows never cross midnight. | "Fish now — until…", struck-through past windows. |
| 19 | Contracts must validate with unknown optional fields ignored, so the UI degrades instead of failing on a newer run. | Error state. |

## Open product questions for Opus

Genuinely ambiguous, product-defining. Recommendations are not final.

1. **Primary navigation dimension — location, mode or species?** *Recommend:* answer-first (Best anywhere), with spot and species as optional scopes and mode secondary inside a spot. *Trade-off:* simplest for new users and the 10-second test, but anglers with a fixed spot or fixed target must set scope once; remembered scope mitigates it.
2. **How are cross-mode backups chosen?** *Recommend:* prefer a different mode at the same or a nearby spot (survives wind/surf failure), then a different spot in the same mode, then a later window at the same spot. *Trade-off:* different-mode backups may need different gear and travel; "nearby" needs a definition (distance or travel time) the owner has not given.
3. **How to present GO when confidence is only Moderate (engine allows GO at ≥ 50)?** *Recommend:* keep GO with a visible qualifier line; High-confidence GO has none. *Trade-off:* honest and simple, but a Moderate-confidence GO and a High one look identical in the ring; alternative is a lighter GO style or capping GO at confidence ≥ 75.
4. **Should the default scope be Best anywhere or the user's last/home spot?** *Recommend:* Best anywhere, with the user's favourite or last spot as a compact second row ("Your spot: …"). *Trade-off:* Best-anywhere shows the strongest answer but may point to a spot an hour away; home-spot-first is relevant but can hide a GO elsewhere.
5. **Should a species focus change the headline verdict ("GO for pompano" when overall is SKIP)?** *Recommend:* yes, always labelled with the focus. *Trade-off:* matches how anglers think, but two verdicts for the same day can read as contradictory unless the UI is very clear.
6. **Should the outlook (days 3–7) use different labels (Promising / Mixed / Tough) than GO/MAYBE/SKIP?** *Recommend:* yes, never GO beyond day 2, to avoid false precision. *Trade-off:* extra vocabulary vs. a risk of over-promising from forecasts that are less reliable that far out; it also departs from the owner's single three-word headline for the planner only.

## Existing inputs (already in the repo — do not rewrite)

- `site/v5/spots.js` — location catalog + `buoyUrls()`. Field meanings are documented in the file header.
- `site/v5/species.js` — 14 species, per-mode setups (`setupFor`), preferences, MRIP name mapping, `needsStructure`, `bycatch`.
- `site/v5/data/first-coast-history.json` — built by `scripts/build_first_coast_history.py` (MRIP intercept microdata 2015–2025, Duval/Flagler/Nassau/St. Johns shore trips; `ocean` = surf/pier, `inland` = inshore; slices `all`, `by_month`, `by_county`, `by_site_type`, `by_interview_hour`, `by_year`; each slice `{n, p_any_fish, p_any_fish_w, fish_per_trip, species: {COMMON: {p, pw, per_trip}}}`; plus `water_temp.by_day_of_year[1..365] = {mean_f, p10_f, p90_f, n_days}` from NDBC 41117 2017–2025). Monthly n is small (19–197 ocean) — always shrink.
- `site/shared/logic.js`, `site/shared/catch.js`, `src/worker.mjs` — reuse helpers where they fit (tide interpolation `seriesFromHilo`/`tideRate`, NWS fetch patterns, wind parsing). Do not change their behaviour; the root app depends on them.

## Architecture

```
raw sources → normalized observations → derived factors → predictions → PredictionRun JSON → UI
```

One engine, no DOM, importable in the browser **and** Node (generator, tests, future API/notifications/widgets):

```
site/v5/engine/
  contracts.js   MODEL_VERSION, JSDoc typedefs, small constructors + validate*() for every contract below
  sources.js     fetchers → NormalizedObservation; every fetch injectable (fetchImpl) and failure-tolerant
  astro.js       sunrise/sunset/civil twilight, moon phase/illumination, moon transit/underfoot/rise/set, solunar periods
  factors.js     pure factor functions: (inputs) → PredictionFactor
  model.js       species suitability, windows, recommendation, confidence, today-vs-tomorrow
  run.js         buildPredictionRun({ now, horizon, locations, fetchImpl, history }) → PredictionRun
```

Morning (current-day) and evening (next-day) views both call `buildPredictionRun` with `horizon: "today" | "tomorrow"`. Presentation may differ; calculation must not. No important value is computed only in UI code.

### Sources (`sources.js`)

Each returns `{ ok, source, station, url, observedAt, fetchedAt, values, error }` and never throws. Missing input lowers confidence; it never breaks the run.

| Input | Source | Notes |
|---|---|---|
| Hourly forecast (wind speed/dir, gusts, rain %, short forecast/thunder) | NWS `/points/{lat},{lon}` → `forecastHourly` | Cache the points lookup per location (localStorage in browser, memory in Node). |
| Alerts | NWS `/alerts/active?point=` | Unchecked alerts ⇒ confidence penalty, never GO. |
| Pressure trend | NWS `/stations/{id}/observations?limit=12` where id = `observationStations[0]` from points | 3 h and 6 h change in hPa. |
| Tides | CO-OPS `datagetter` `product=predictions&interval=hilo&time_zone=gmt&datum=MLLW` for `spot.tide`, 3-day range | Interpolate (cosine) to 30-min series; rate + direction. |
| Waves / buoy water temp | `buoyUrls(spot.cdip)` (SECOORA ERDDAP); fallback `api/live/marine.json` | ERDDAP rows: `[time, Hs m, Tp s, dir]` and `[time, °C]`. Stale > 3 h ⇒ treat as missing. |
| Water temp (nearshore) | CO-OPS `product=water_temperature&date=latest` for `spot.waterTemp` when set | Else buoy; inshore using buoy ⇒ confidence penalty + note. |
| History | `data/first-coast-history.json` | Loaded once. |

### Factors (`factors.js`)

Each factor is a `PredictionFactor`:
`{ key, label, value, unit, score (0–1), weight, contribution (score×weight, normalized), detail (one short sentence), source, available }`.
Unavailable factors are excluded and the remaining weights renormalize (same rule as `weightedScore` in `shared/week.js`), and `available:false` factors are still listed so the UI can say what was missing.

| key | How scored (heuristic v5.0 — tune later) |
|---|---|
| `season` | Shrunk monthly share of trips catching the species in that mode: `p_m* = (n_m·p_m + k·p_all)/(n_m + k)`, k = 40, with the month blended 50 % + 25 % each neighbour month; county slice blended in with k = 150. Score = `p_m*` ÷ species' max month `p*` (0–1). Also exported as `historicalRate`. |
| `waterTemp` | Trapezoid on `species.waterF [min, idealLow, idealHigh, max]`: 1 inside ideal, linear to 0 at min/max. Also report anomaly vs `water_temp.by_day_of_year` (detail only in v5.0). |
| `tide` | From 30-min tide rate & direction at the slot. `moving`: normalized |rate|; `incoming`/`outgoing`: direction match × rate, with 0.35 floor for the other direction while moving; `any`: 0.7 constant. Weight × `{high:1.3, medium:1, low:0.6}[spot.tideSensitivity]`. |
| `light` | `lowlight`: 1 within ±60 min of sunrise/sunset, tapering to 0.4 midday, 0.25 night; `day`: 1 daylight, 0.3 night; `any`: 0.8. |
| `solunar` | 1 in a major period (moon transit/underfoot ±60 min), 0.75 in a minor (moonrise/moonset ±30 min), else 0.45; +0.1 within 3 days of new/full moon (cap 1). |
| `wind` | Speed: 1 at ≤ 10 mph, linear to 0 at 25 mph (gusts > 30 mph ⇒ 0). Direction vs `windExposure.facingDeg`: offshore +0.1, onshore −0.15 for `calm`-surf species, +0.05 for `rough`-surf species (ocean modes); inshore uses speed only plus −0.1 when the wind blows along the exposed fetch. |
| `waves` | Ocean modes only. Hs → class: calm < 0.6 m, moderate 0.6–1.2 m, rough > 1.2 m; score 1 if class matches `species.surf`, 0.6 adjacent, 0.2 opposite; Hs > 2 m ⇒ 0. |
| `pressure` | 6 h change: steady/slowly falling (−0.5 to −3 hPa) 1; steady (±0.5) 0.8; rising 0.5–3 hPa 0.6; rapid change (> 3 hPa either way) 0.4. |
| `rain` | 1 − rain%/100; thunder in the short forecast ⇒ 0 and a safety gate. |

Default weights (sum 1 before renormalizing; store in one exported `WEIGHTS[mode]` table):

| | season | waterTemp | tide | light | wind | waves | pressure | solunar | rain |
|---|---|---|---|---|---|---|---|---|---|
| surf / pier | .24 | .18 | .14 | .10 | .10 | .10 | .05 | .05 | .04 |
| inshore | .24 | .18 | .20 | .12 | .10 | — | .06 | .06 | .04 |

Hard caps: water temp outside `[min, max]`, or `season` score < 0.1 ⇒ suitability ≤ 20. `needsStructure` species only on locations whose `structure` is pier/jetty/bridge/dock/seawall/rocks. `bycatch` species count toward "anything biting" but are never a target.

### Model (`model.js`)

- `scoreSpecies(species, location, mode, slotTime, ctx)` → `SpeciesPrediction` with `suitability` (0–100, rounded once), `factors[]`, `historicalRate` (0–1, shrunk), `calibratedProbability: null` (reserved until outcomes exist), `confidence` (0–100) + `confidenceReasons[]`, `setup` from `setupFor(species, mode)`.
- Slots every 30 min across the horizon window (today: now → 21:00 local, extended into tomorrow 05:00–10:00 if fewer than 3 h remain; tomorrow: 05:00–21:00). Windows = contiguous slots where the location/mode's top-species suitability stays within 8 points of its local max, 60–150 min long, non-overlapping, ranked; expose up to 4 per location/mode. Window time labels in America/New_York (beware DST; reuse the repo's GMT-in, NY-out approach).
- `Recommendation`: across all active locations × modes × windows, choose the best by `top suitability × confidenceFactor`, where confidenceFactor = 0.6 + 0.4·confidence/100. Verdict: **GO** if top suitability ≥ 70 and confidence ≥ 50 and no gate; **MAYBE** if ≥ 50; else **SKIP**. Gates (force SKIP for the affected windows, list the reason): thunder, sustained wind ≥ 25 mph or gusts ≥ 35 mph, active NWS warning for the point, Hs > 2.5 m for ocean modes. Include `why[]` = the top 3 positive factor details and the worst limiting factor. `targets[]` = top 3 non-bycatch species (suitability + historicalRate). `setup` = setup of the #1 target in that mode. `backup` = best alternative that differs in location **or** mode (prefer a different mode), else a later window. `comparison` = today vs tomorrow best suitability and verdict (the run computes the other horizon's summary too).
- Confidence 0–100: start 100; −25 forecast missing or > 6 h old (−10 for 3–6 h); −20 alerts unchecked; −20 tide missing (−10 for ocean modes where tide station is > 15 mi away per `tideNote`); −10 waves missing (ocean modes); −10 water temp missing (−5 if inshore uses buoy); −5 pressure missing; −5 to −15 by history n for the slice (n < 30: −15, < 80: −8). Clamp 5–100; level High ≥ 75, Moderate ≥ 50, else Low. Keep every reason string.

### Contracts (`contracts.js`) — stable JSON for PWA, API, Supabase and native clients

```
Location            id, name, area, county, modes[], structure, lat, lon, tide, cdip, tideSensitivity, windExposure, access[], targets[], notes
Conditions          locationId, at, wind{mph,gustMph,dirDeg,onshore}, rainPct, thunder, airTempF, waterTempF{value,source,anomalyF},
                    waves{hsFt,periodS,dirDeg,observedAt}, tide{heightFt,rateFtPerHr,direction,nextHigh,nextLow,station},
                    pressure{hPa,change3h,change6h}, light{sunrise,sunset,phase}, moon{phase,illumination,major[],minor[]},
                    alerts[], sources[{name,observedAt,fetchedAt,ok,stale}]
PredictionFactor    key, label, value, unit, score, weight, contribution, detail, source, available
SpeciesPrediction   speciesId, locationId, mode, windowStart, windowEnd, suitability, historicalRate, calibratedProbability(null),
                    confidence, confidenceReasons[], factors[], setup{where,bait[],lures[],rig}
FishingWindow       locationId, mode, start, end, topSuitability, species[SpeciesPrediction], gates[]
Recommendation      verdict(GO|MAYBE|SKIP), horizon, locationId, mode, window{start,end}, targets[], setup, why[], limiting,
                    confidence, confidenceLevel, backup{locationId,mode,window,speciesId,reason}, comparison{today,tomorrow}
PredictionRun       id, modelVersion("v5.0.0"), horizon, generatedAt, validFrom, validTo, region, recommendation,
                    locations[{location, conditions, windows[]}], inputs{sources[]}, notes[]
```

All times ISO-8601 UTC in JSON; the UI formats America/New_York.

### Static API (scheduled build)

`scripts/generate-v5.mjs` (run in `.github/workflows/pages.yml` after `generate.mjs`, before validation) calls `buildPredictionRun` with Node `fetch` and writes:
`site/api/v5/today.json`, `site/api/v5/tomorrow.json` (full PredictionRun each) and `site/api/v5/index.json` ({generatedAt, modelVersion, today: summary, tomorrow: summary}). A failed source degrades confidence; only a total failure keeps the previous deployed files (same carry-forward idea as `generate.mjs`). Keep `site/api/` gitignored.

### Supabase (`supabase/migrations/20261005000000_v5_schema.sql`) — write only, do not apply

Tables (uuid PKs, `created_at timestamptz default now()`, FKs, useful indexes, RLS enabled with no anon write policies):
`model_versions(version pk, released_at, notes, weights jsonb)`,
`locations(id text pk, …catalog fields…, active)`,
`source_observations(id, source, station, location_id null, observed_at, fetched_at, kind, values jsonb, unique(source,station,kind,observed_at))`,
`prediction_runs(id, model_version fk, horizon, generated_at, valid_from, valid_to, confidence, inputs jsonb)`,
`species_predictions(id, run_id fk, location_id fk, mode, species_id, window_start, window_end, suitability, historical_rate, calibrated_probability null, confidence, factors jsonb)`,
`recommendations(id, run_id fk unique, verdict, location_id, mode, window_start, window_end, targets jsonb, setup jsonb, why jsonb, backup jsonb, confidence)`,
`catch_outcomes(id, fished_start, fished_end, location_id fk, mode, caught bool, species_id null, quantity int, approx_size_in numeric, bait text, notes text, prediction_run_id fk null, species_prediction_id fk null, reported_via text)`.
Add a view `outcomes_vs_predictions` joining each outcome to the run active at `fished_start` for that location (latest run with `valid_from <= fished_start < valid_to`). Store forecast snapshots only as prediction runs — no duplicate raw forecast tables.

## UI implementation notes (`site/v5/index.html`, `app.js`, `style.css`, `ui/*.js`) — phase B

Product behaviour is specified in **Product spec** above; this section is only the technical shape of the UI layer.

- Mobile-first single page with hash routing and a bottom tab bar (Today · Spots · Species · Plan). Renders `PredictionRun` objects only (no scoring or label logic in the UI). Loads `api/v5/<horizon>.json` first (instant, offline-capable), then optionally re-runs the engine live for the selected scope and swaps in fresher results without layout jump.
- PWA: `manifest.webmanifest` (scope `./`, standalone), `sw.js` (app shell cache-first, `api/v5/*.json` stale-while-revalidate, external APIs network-first with last-good copy; versioned cache name; never cache errors). The service worker's last-good run is what powers the offline and stale states.
- Persisted client state (localStorage, always wrapped in try/catch): favourites, last scope, last mode, collapsed/expanded cards, NWS `/points` cache. Session-only: species focus, horizon override.

## Tests (CI-gated)

`scripts/test-v5.mjs` (add to the workflow unit-test step):
catalog integrity (every active spot valid; targets valid for its modes; every species has ≥ 1 MRIP name present in history; tide station ids are 7 digits); factor math (trapezoid edges, shrinkage formula with worked examples, weight renormalization with missing factors, caps and `needsStructure`); window selection (non-overlap, length bounds, DST fall-back day); verdict thresholds and gates; confidence penalties; astro against fixed references (sunrise/sunset for Flagler on 2026-06-21 and 2026-12-21 within 2 min of USNO; moon phase on known full/new moon dates within 1 day; moon transit within 15 min of a published value); a full `buildPredictionRun` against recorded fixtures (`scripts/fixtures/v5/*.json`, fetchImpl stubbed) validating every contract; graceful degradation (each source failing in turn still yields a run with lower confidence). `scripts/test-generated-output.mjs`: add warn-level checks that `api/v5/*.json` exist, validate, and are < 90 min old.

## Definition of done

1. `node scripts/test-v5.mjs` and all existing tests pass; existing pages unchanged.
2. `SITE_URL= node scripts/generate.mjs && node scripts/generate-v5.mjs` writes valid v5 runs from live data.
3. `site/v5/` served locally renders Today/Spots/Species/Plan for every active location with no console errors, at 375 px and desktop, light and dark; works offline from the last run.
4. Supabase migration file parses as SQL (`psql --set ON_ERROR_STOP=1` against a throwaway Postgres if available; otherwise a careful review) — never applied to a live project.
5. README "Layout" gains a `/v5/` line and a short V5 section.
