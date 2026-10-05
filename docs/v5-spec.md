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

The implementation contract and numbered rationale are in [`docs/v5-architecture-decisions.md`](v5-architecture-decisions.md). This section is the build specification. Data flow is:

```text
providers → NormalizedObservation → factors → candidates and scope views → PredictionRun JSON → PWA/native client
```

One DOM-free ES-module engine runs unchanged in Node and the browser. Root `/` and v1–v3 remain untouched.

```text
site/v5/engine/
  contracts.js   schema/model versions, JSDoc types, constructors, validateRun()
  copy.js        canonical human-readable and accessibility strings
  history.js     personal trip hits, shrinkage, season curves, sample labels
  sources.js     provider adapters, normalization, cache, isolated failures
  astro.js       sun/twilight, moon phase/transit/rise/set, solunar periods
  factors.js     pure factor functions and per-mode WEIGHTS
  model.js       suitability, confidence, windows, verdicts, backups, scope views
  run.js         buildPredictionRun({ now, locations, fetchImpl, history, previousRuns, preferences }) → { today, tomorrow }
```

`buildPredictionRun({now,locations,fetchImpl,history,previousRuns,preferences})` is called once and returns `{today: PredictionRun, tomorrow: PredictionRun}`. It fetches/normalizes shared observations once, builds both horizons through the same scoring path, and compares their summaries before returning. Each result has its own horizon, target date and validity interval. No morning/evening-specific scoring path exists. The output is deterministic for `now`, observations, history, preferences and prior runs.

Reuse `site/shared/logic.js` tide helpers (`seriesFromHilo`, `heightAt`, `tideRate`) and unit conversions where their contracts fit; reuse the NWS response/failure patterns in `src/worker.mjs` and deployed-state seed pattern in `scripts/generate.mjs`. `weightedScore` in `site/shared/week.js` is a reference for missing-factor renormalization, not a reason to change the shared helper. Do not edit those shared files or change root-app behavior for V5.

### Sources (`sources.js`)

Every adapter returns a `NormalizedObservation` (or an explicit unavailable result), never throws through the source orchestrator:

```js
{ provider, kind, locationId, station, units, observedAt, fetchedAt,
  values, ok, stale, usedFallback, safeErrorCode }
```

| Input | Adapter and cache | Normalization and failure rule |
|---|---|---|
| NWS point metadata | `/points/{lat},{lon}`; browser localStorage / Node in-memory cache, 7-day TTL; stale metadata may be used up to 30 days only if refresh fails | Resolve `forecastHourly` and `observationStations[0]` once per location. Cache metadata separately from changing forecast/alerts. |
| Hourly forecast | NWS `forecastHourly`; 30-minute cache | Normalize wind speed/direction, gusts, temperature, PoP, short forecast and thunder indicator. Missing/older than 6 h blocks GO. |
| Alerts | NWS `/alerts/active?point=...`; 10-minute cache | “Checked and none” differs from fetch failure. Unchecked blocks GO; matching active warnings create safety gates. |
| Pressure | NWS selected station observations, up to 12 readings; 15-minute cache | Normalize 3 h/6 h changes to hPa. Failure removes only pressure factor. |
| Tide | CO-OPS `datagetter`, `product=predictions`, `interval=hilo`, `datum=MLLW`, `time_zone=gmt`; cache by station + date range for 6 h | Keep instants in UTC, interpolate the 3-day hilo series to 30-minute values. Convert to America/New_York only in engine copy/labels; never use a fixed DST offset. A distant station is a structural confidence reason, distinct from a failed tide fetch. |
| Waves and buoy water temperature | Query `buoyUrls(spot.cdip)` (SECOORA ERDDAP) first; fallback to `site/api/live/marine.json` (scheduled NDBC snapshot); cache responses for 30 min | Waves/temp are separate ERDDAP rows. Reject invalid values and observations older than 3 h. Preserve provider and timestamp; stale/missing ocean waves block GO. Inshore buoy temperature is marked structural. |
| CO-OPS nearshore water temperature | `product=water_temperature&date=latest` for `spot.waterTemp` when configured | Prefer this to buoy temperature. If unavailable, use the buoy per catalog and lower confidence for inshore. |
| MRIP history | `site/v5/data/first-coast-history.json`, loaded once per run | Use only explicit hit counts and denominators. An omitted/truncated species slice is unavailable, never a zero. |

Cache keys include provider, location/station and request horizon. Reuse a cached observation only within its TTL; a stale-on-error value remains marked stale and cannot satisfy a GO-required live input. Each provider failure is isolated. `sourceStatus[]` records `ageMinutes`, `stale`, `usedFallback`, `affects[]`, and safe status text for Data & sources.

### Factors (`factors.js`)

`PredictionFactor` carries `{key,label,group,value,unit,score,weight,contribution,effect,humanLabel,summary,detail,source,available,limiting}`. Scores are 0–1. Map groups: season→`season`, waterTemp→`water`, tide→`tide`, light→`light`, solunar→`moon`, wind→`wind`, waves→`surf`, pressure→`pressure`, rain→`weather`. `effect` is `helps` at score ≥0.67, `neutral` at ≥0.34 and <0.67, otherwise `hurts`; mark the single lowest available factor `limiting` when its score <0.34 (tie by the factor order below). For unavailable factors, set `effect/score/contribution` null, `limiting:false`, and provide missing-input text. Available weights are renormalized per species/window; unavailable factors remain listed and do not contribute. Preserve the current nine factors and weights:

Apply tide-sensitivity multipliers to its configured base weight, then for available factors set serialized `weight = normalizedWeight = adjustedWeight / sum(available adjusted weights)`, `contribution = score × weight`, and `suitability = round(100 × sum(contribution))` once. Unavailable factors have null weight/contribution. Show factor `value/score/weight` only at L3.

| Factor | Rule |
|---|---|
| `season` | Use ADR 2's shrunk, personal species trip-hit rate; `score = min(1, rate / 0.20)`. Never normalize to that species' own best month. Same shrunk rate feeds `historicalRate`. |
| `waterTemp` | Trapezoid using `species.waterF [min, idealLow, idealHigh, max]`: 1 in ideal band; linear to 0 at min/max. Anomaly from NDBC day-of-year climatology is explanatory only in v5. |
| `tide` | 30-minute rate and direction. `moving` uses normalized absolute rate; `incoming`/`outgoing` match direction × rate, with 0.35 floor for the opposite direction while moving; `any` = 0.7. Multiply weight by tide sensitivity high 1.3, medium 1, low 0.6. |
| `light` | `lowlight`: 1 within ±60 min sunrise/sunset, taper to 0.4 midday and 0.25 night; `day`: 1 daylight / 0.3 night; `any`: 0.8. |
| `solunar` | 1 in major period (transit/underfoot ±60 min), 0.75 minor (moonrise/set ±30 min), else 0.45; +0.1 within 3 days of new/full moon, capped at 1. |
| `wind` | 1 at ≤10 mph, linear to 0 at 25 mph; gust >30 mph scores 0. Ocean direction: offshore +0.1 for calm-surf species, onshore −0.15 for calm / +0.05 for rough. Inshore uses speed, with −0.1 along exposed fetch. Clamp 0–1. |
| `waves` | Ocean only: calm <0.6 m, moderate 0.6–1.2 m, rough >1.2 m. Species match 1, adjacent class 0.6, opposite 0.2; Hs >2 m scores 0. |
| `pressure` | 6 h change: −0.5 to −3 hPa = 1; ±0.5 = 0.8; rise 0.5–3 = 0.6; absolute change >3 = 0.4. |
| `rain` | `1 − PoP/100`; thunder is a separate safety gate. |

| Mode | Season | Water | Tide | Light | Wind | Waves | Pressure | Solunar | Rain |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| surf / pier | .24 | .18 | .14 | .10 | .10 | .10 | .05 | .05 | .04 |
| inshore | .24 | .18 | .20 | .12 | .10 | — | .06 | .06 | .04 |

Hard caps: outside species water `[min,max]` or season factor score `<0.1` limits suitability to 20 (`rate <0.02` under the initial 0.20 season-score ceiling). `needsStructure` species score only at pier/jetty/bridge/dock/seawall/rocks. Bycatch can appear under “Also biting” but cannot become a target or drive GO. Keep factor values, score and weight for L3; never show weights in glance/card UI.

### Model (`model.js`)

- `scoreSpecies(species, location, mode, slotTime, ctx)` returns heuristic `suitability` 0–100 (round once), factors, the same shrunk `historicalRate`, `calibratedProbability: null`, confidence/reasons and structured setup from `setupFor()`.
- Generate 30-minute slots: today from `now` to 21:00 local (extend into tomorrow 05:00–10:00 only when fewer than 3 h remain); tomorrow 05:00–21:00 local. For each location/mode, find local peaks in the top-species slot series. For each peak, take the maximal contiguous segment within 8 points of it; expand a short segment by the adjacent higher-scoring slot until it reaches 60 minutes, or discard if it cannot. If longer than 150 minutes, keep the 150-minute slice containing the peak with the greatest mean score (tie: earlier start). Sort segments by peak suitability, then mean suitability, then earlier start; remove overlaps in that order; expose up to four. Never cross local midnight. Window suitability is the best species' unrounded mean slot score across the window, rounded once. Keep UTC instants and engine-built New York labels. Export `isOpenAtGenerated`, `startsInMinAtGenerated` and `endsInMinAtGenerated`; UI may update the countdown from the clock but may not choose or score a window.
- A location × mode × window recommendation uses the best suitable species; targets are top three non-bycatch species. If any target that is in that spot's `targets` list has shrunk rate ≥0.05 and suitability ≥70, the highest-suitability such realistic target may drive GO. Otherwise the highest-suitability target drives MAYBE/SKIP. Suitability ≥70, confidence ≥50, no gate, forecast age ≤6 h, checked alerts, and (surf/pier) waves present are all required for GO. If not GO, suitability ≥50 is MAYBE; otherwise SKIP. Safety gates force SKIP. High suitability with Low confidence is MAYBE.
- Recommendation confidence/reasons come from its selected driver species and window; do not average unrelated targets' confidence values. Per-species confidence uses the same inputs plus that species' history sample size.
- Safety gates: thunder, sustained wind ≥25 mph or gust ≥35 mph, active NWS warning for the point, or ocean Hs >2.5 m. Include `{code,text,startsAt,endsAt,severity}` with plain-language time range. No safety gate can be hidden or overruled by species focus.
- Best-anywhere ranking is verdict tier, then suitability. The top candidate and all same-verdict candidates within 5 points of that top score tie (no transitive chaining); break ties by user favorite, location target-list membership, then catalog order; expose `tiedWith[]`. Preserve the previous best location + mode unless invalid/gated, a challenger is >5 points better, or it is at least one verdict tier better. The engine takes prior run/preferences explicitly; no hidden state. The Spots list has its own approved order: verdict tier; then Near me distance when enabled; then favourite; then catalog order. Do not reuse Best-anywhere suitability ranking for the Spots list.
- Backup order follows product decision 2: opposite water type (`other-mode` = ocean surf/pier ↔ inshore) within 7 straight-line miles, including another mode at the same spot when cataloged; later window at same spot/mode; same water type (`other-spot`) within 7 mi; only if none of those reaches MAYBE, the best MAYBE-or-better option anywhere (name area). `backup.reason` explains the change and `distanceMi` is populated for another spot. Never return a backup below MAYBE; focused-species backup uses `other-species` only when a focus is set and no safety gate applies.
- A species-focused view uses that species' recommendation and labels the verdict “for [species]”; include `overall.verdict`, one-step-better overall copy, and `focusCapped` when the shrunk local rate is below 0.05. Safety SKIP is focus-independent. Focus species appears first in Targets.
- Suitability bands are Great fit 70–100, Decent fit 50–69, Poor fit 30–49, Not a fit 0–29. `waterFit.state` is cold below `minF`, hot above `maxF`, ideal within `[idealLowF,idealHighF]`, otherwise ok. `displayName` includes the mode only when the location offers multiple modes. Classify `partOfDay` from the window midpoint: dawn is sunrise ±60 min, dusk is sunset ±60 min, morning is after dawn through 11:59, midday 12:00–14:59, afternoon 15:00 until dusk, evening otherwise.
- `comparison.delta` is better/worse for a verdict-tier change or >5 suitability-point change; otherwise similar. `recommendedHorizon` follows one exported 15:00 America/New_York cutoff, with reason; UI does not implement a second cutoff.
- Planner has seven days. Days 1–2 carry full forecast verdicts. Days 3–7 are `Promising / Mixed / Tough`, never GO; no spot or minute-precise window, only part of day + tide phase. Outlook uses season, tide, moon/light and daily forecast. “Most promising outlook” is allowed only when days 1 and 2 are both SKIP.

Confidence starts at 100, applies each reason once, clamps 5–100: forecast missing or >6 h −25 (3–6 h −10); alerts unchecked −20; live tide fetch missing −20; ocean tide station >15 mi away −10 structural even when predictions are available; ocean waves missing −10; water temp missing −10; inshore buoy water temperature −5 structural when used; pressure missing −5; historical `effectiveN<30` or null −15, or `<80` −8 structural. Reasons carry `kind: "live" | "structural"`. Permanent tide-distance/inshore-temperature/history limitations lower confidence and appear in Confidence/Why confidence, but never trigger the amber live-gap qualifier. GO at Moderate is allowed only when required live gate inputs are present; show `amberQualifier` only for GO at Moderate (50–74) with at least one live gap; build its text from `confidenceReasons`. Structural reasons never trigger it.

### Contracts (`contracts.js` and `copy.js`)

All timestamps in JSON are ISO-8601 UTC. Engine builds all human-facing strings, including labels, summaries, safety text, accessibility labels and copy in windows/setups, in `copy.js`; web/native clients render the same text. Clients may format raw L3 dates/numbers and update the elapsed window countdown, but may not invent copy, labels, rankings, verdicts, scores or missing values. Validators enforce required types/enums and supported `schemaVersion` / `modelVersion`; unknown optional fields are ignored.

| Contract | Required shape |
|---|---|
| `PredictionRun` | `schemaVersion`, `id`, `modelVersion` (`MODEL_VERSION="v5.0.0"` initially), `horizon`, `targetDate`, `generatedAt`, target local-day `validFrom/validTo` converted to UTC, `region`, `status`, `carriedForward`, optional `originalGeneratedAt/attemptedAt`, `missingInputs[]`, `recommendation`, `scopeViews`, `locations[]`, 30-minute `slots[]`, `days[7]`, `inputs.sourceStatus[]`, `notes[]`. `schemaVersion` is independent of `modelVersion`; `generatedAt` is run creation time, separate from target validity. |
| `Location` | Catalog id/name/area/county/modes/structure/coordinates, tide/CDIP and water-temp station ids, tide sensitivity, wind exposure, access, targets and notes; mirror `spots.js` without frontend-only recomputation. |
| `Conditions` | location/time; wind, rain/thunder, air/water temperature, waves, tide, pressure, light, moon, alerts; `wind.label`, `waves.label`, `tide.label`, `waterTemp.label`, `sky.label` are plain language. |
| `PredictionFactor` | Factor row defined above, including effect/group/display strings and availability. |
| `SpeciesPrediction` | `speciesId`, location/mode/window, `suitability`, `suitabilityBand:great|decent|poor|none`, `calibratedProbability:null`, confidence + reasons, factors, setup `{where,bait[],lures[],rig,tip}` + `useLine`, `historicalRate:{rate,n,effectiveN,month,lowSample,band,unit:"trips",sourceLabel}` where `n` is unique observed non-proxy interviews and `effectiveN` is the Kish effective sample of eligible interviews in the mode/month slice (nullable if weights are unavailable; null triggers the band path). For `effectiveN<80` (or missing/nonpositive weights), show only `band` and low-sample copy, computed from the shrunk rate; numeric band cuts are centralized in `HISTORICAL_BAND_CUTS` after Opus decision. `seasonCurve[12]` of `{month,rate,n,effectiveN,lowSample,band}`, `waterFit:{state,text,minF,idealLowF,idealHighF,maxF,currentF}`. Target rows include `name,suitability,suitabilityBand,historicalRate`.  |
| `FishingWindow` | location/mode, UTC start/end, `partOfDay`, `isOpenAtGenerated`, start/end minutes at generation, species[], suitability, gates[]. |
| `Recommendation` | verdict, scope/focus, horizon, location/mode/window, driver species, `headline` (≤~60 chars, species + cause), `whenLabel`, `displayName`, `modeLabel`, `partOfDay`, `useLine`, `reason:{code,text}`, `gates[]`, targets[], setup, why[], limiting factor, confidence/level/reasons/summary, `amberQualifier` (string only for GO at Moderate with a live gap; otherwise null), backup `{kind,reason,distanceMi,verdict,suitability,...}`, comparison `{today,tomorrow,delta,recommendedHorizon,reason}`, `tiedWith[]`, rank. |
| `scopeViews` | engine-precomputed Best anywhere; every active location × offered mode; each species focus; each location/mode × species focus. Views retain tied candidates so local favorites can be applied by an engine selector, not UI scoring. |
| Location index | `locations[]` contains catalog location, conditions/source freshness, per-mode windows/recommendation, ranked location summary. `bySpecies[speciesId]` includes best location/mode/window, `fitNow`, focused recommendation and overall verdict. |
| Timeline slot | `{at,suitability,tide{heightFt,rateFtPerHr,direction,phase},lightPhase,moonMarks[],topSpecies[3],conditionLabels}` for each location × mode × 30-minute slot. |
| Planner day | Days 1–2: forecast verdict, windows/top species/reason/confidence. Days 3–7: `outlookLabel`, `bestWindow:{partOfDay,tidePhase}`, reason; no location, minute window, GO or suitability number. |

`confidenceReasons[]` entries are `{code,text,penalty,kind}`. Factor, gate, backup, history, setup and comparison strings are produced once by `copy.js`. `reason` is required for every non-GO recommendation. A backup's verdict never exceeds the primary recommendation. Any unrecognized optional field survives validation only as an ignored extension; unsupported required schema/model versions use the error state.

### Static API (scheduled build)

`scripts/generate-v5.mjs` runs after `scripts/generate.mjs` in `.github/workflows/pages.yml`, using Node 22 and no dependencies. It loads history once, fetches/normalizes provider inputs once per needed location/station, calls `buildPredictionRun` once, and writes the returned today/tomorrow runs. It reads both deployed horizon files through `SITE_URL` for prior-best hysteresis and carry-forward, following the existing generator pattern.

Write (gitignored with the rest of `site/api/`):

- `site/api/v5/today.json` — complete `PredictionRun`.
- `site/api/v5/tomorrow.json` — complete `PredictionRun`.
- `site/api/v5/index.json` — model/schema version, generation/freshness/status and compact today/tomorrow summaries.

Individual source failure produces a valid partial/degraded run with unavailable factors and lower confidence. Fatal engine/contract failure uses a deployed last-valid run only after validating it; retain its original `generatedAt`, target validity and prediction payload, set `status: "degraded"`, `carriedForward: true`, `originalGeneratedAt` and `attemptedAt`, and add the failed attempt to `missingInputs[]`. Never make stale data fresh. If there is no last-valid v5 run, fail generation so the Pages workflow does not publish invalid output. Keep last-good fetch/cache data for browser offline use in the service worker; do not treat an HTTP 200 as source success without payload validation.

### Supabase (`supabase/migrations/20261005000000_v5_schema.sql`) — write only; do not apply

Write a single reviewable migration file; do not connect, create a project, or apply it. Tables, UUID keys, `created_at`, foreign keys and indexes:

- `model_versions(version PK, released_at, notes, weights jsonb)`.
- `locations(id text PK, catalog fields, active)`.
- `prediction_runs(id PK, model_version FK, horizon, target_date, generated_at, valid_from, valid_to, status, carried_forward, source_provenance jsonb, payload jsonb)`. `payload` is the canonical full run including conditions/factors; provenance stores source ids/timestamps/status, not a second copy of forecast values.
- `species_predictions(id PK, run_id FK, location_id FK, mode, species_id, window_start/end, suitability, historical_rate, calibrated_probability nullable, confidence, factors jsonb)`, unique by run/location/mode/species/window and also addressable by `(id,run_id,location_id,mode,species_id)` for outcome constraints.
- `recommendations(id PK, run_id FK, scope_kind/scope_id, location_id, mode, focus_species nullable, window_start/end, verdict, driver_species_id, targets/setup/why/backup jsonb, confidence, rank)`, unique by run + scope + location/mode/focus/window and also addressable by `(id,run_id,location_id,mode)` for outcome constraints. Do not make `run_id` unique: a run has precomputed scopes.
- `catch_outcomes(id PK, fished_start/end, location_id FK, mode, caught, species_id nullable, quantity, approx_size_in, bait, notes, prediction_run_id FK nullable, recommendation_id FK nullable, species_prediction_id FK nullable, reported_via)`.

Enable RLS on every table; define no anonymous write policy. No `source_observations` table: raw forecasts are never stored twice. The run payload is canonical; child rows are indexed projections of derived predictions only.

Outcome links are written directly when the user logs a trip from an active recommendation: store `prediction_run_id` and `recommendation_id`, plus `species_prediction_id` when the outcome species is known and represented in that recommendation. For older/offline rows without IDs, choose the latest run generated no later than `fished_start` whose `target_date` equals the New York local date of `fished_start` and whose `[valid_from,valid_to)` contains it; tie-break by ascending run id. Within that run, match only the `scope_kind='location_mode'` recommendation for that exact location/mode whose window overlaps `[fished_start,fished_end)`; if several overlap, choose greatest overlap duration, then earliest start, then ascending id. Keep the run link if no recommendation matches and return an unmatched reason. When `species_id` is present, match only that species prediction in the chosen run/location/mode with a window overlapping the session, using the same overlap/start/id tie-break; if none exists, keep valid higher-level links and leave the species FK null with a reason. Never join a future run or store a duplicate forecast snapshot.

### UI implementation (`site/v5/app.js`, `ui/*.js`, `style.css`) — phase B

Render validated `PredictionRun` scope views, source/freshness states and engine-authored copy. UI state may select a scope/focus, mode filter, favourites, horizon override and expanded cards; pass favorite/previous-run tie preferences through an engine selector. It must not score, sort candidate recommendations, choose windows/backups, compute verdicts or suitability, classify factors, shrink history, or build human-facing strings. Mode stays inside a spot scope and may be a Spots/Species filter, never a primary tab or default filter. Best anywhere is the default until the user chooses a spot in the picker; only that picker-chosen spot persists. Other scope changes, species focus and horizon override are session-only; last mode, favourites and per-card expansion persist in guarded localStorage. Use `manifest.webmanifest` with scope `./` and standalone display. Cache the app shell cache-first; cache `/api/v5/*.json` stale-while-revalidate; fetch external APIs network-first with last-good responses; use a versioned cache name and never cache error responses. Use the service-worker last-good run immediately, then refresh; preserve a stale run on network failure. Store NWS points metadata in guarded localStorage. Implement product journeys and layout only after phase A contracts are stable.

### Tests (CI-gated)

`scripts/test-v5.mjs` is the phase-A suite and must use Node 22, deterministic fixtures and injected `fetchImpl`:

- catalog/mapping parity; active locations/modes/targets; every target history mapping; station id format; proxy rows excluded from primary `n` and reported in QA.
- category-based caught-one rules (individual A plus individual-reported B1/B2), `F_BY_P==8` with B1/B2, available-catch flag disagreement QA, group Type A exclusion, alias union per trip, shrinkage `k` examples, Kish effectiveN<80 band path and 80 boundary, WP_INT weighted-rate QA sensitivity, missing-vs-zero slices.
- factor math: trapezoid edges, season scale, weights, unavailable-factor renormalization, hard caps, `needsStructure`, bycatch and gates.
- windows, lengths, non-overlap, local-midnight, DST fall-back; confidence live/structural reasons and Moderate GO requirements.
- GO eligibility, backups/radius/order, 5-point ties, verdict tier, target/favorite/catalog tie-breaks and hysteresis invalidation/improvement.
- astro fixed references: Flagler sunrise/sunset 2026-06-21 and 2026-12-21 within 2 min of USNO; known full/new moon within 1 day; moon transit within 15 min of published reference.
- full run validates every required contract field and ignored unknown optional fields; each source failing in turn still yields a run with lower confidence; CO-OPS GMT → New York DST labels; SECOORA fallback freshness.
- at least 60 distinct dated fixture days, frozen `now`, no live fetches: report GO/MAYBE/SKIP frequency overall and on complete, ungated days. Acceptance is 15–35% GO in that ungated subset; outside the band fails for review. This is a verdict-frequency check, not prediction accuracy.

Add to `scripts/test-generated-output.mjs` warn-level checks for API files existing, schema-valid and <90 minutes old. SQL is parsed against throwaway Postgres if available; otherwise carefully reviewed. Never apply the migration.

### Definition of done

1. Builder catch-definition repair and regenerated history pass QA; aliases are per-trip unions; proxy policy and data provenance are visible. No copy or scoring validation precedes this gate.
2. `node scripts/test-v5.mjs`, `node scripts/test-logic.mjs`, `node scripts/test-app.mjs`, `node scripts/test-catch.mjs`, `node scripts/test-calculations.mjs`, and `node scripts/test-validator.mjs` pass; no root/v1–v3 behavior changes.
3. `SITE_URL=… node scripts/generate.mjs && SITE_URL=… node scripts/generate-v5.mjs` writes valid today/tomorrow/index payloads from provider responses; source failure and fatal-build carry-forward paths are verified.
4. ≥60-day fixture replay reports verdict shares and meets its ungated GO target; report explicitly says this does not measure fishing accuracy.
5. `/v5/` renders Today/Spots/Species/Plan for each active location at 375 px and desktop, light and dark, accessible, no console errors, and offline from last-valid run.
6. Migration parses or is carefully reviewed, with RLS and outcome as-of join checked; it remains unapplied.
7. README Layout and short V5 section are updated. Product/architecture acceptance remains with Chris/Opus, not implied by test passage.
