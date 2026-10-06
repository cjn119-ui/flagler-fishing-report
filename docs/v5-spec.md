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

Product decisions on navigation, backups, GO at Moderate confidence, default scope, species focus and outlook labels: see `docs/v5-product-decisions.md` (owner-approved). Technical thresholds, history wording and wire contracts: `docs/v5-architecture-decisions.md` Revision 2 and §10 (owner-approved; supersedes the older thresholds in the product-decisions file). The product text below was conformed to both on 2026-10-05 (M11). **Every example score, species, spot, time and count in this document is an illustrative copy shape, never model output; `<n>` and `<species>` mark values the engine supplies.**

| Topic | Decision |
|---|---|
| Path | `site/v5/` alongside the current app; root `/`, v1–v3 untouched. |
| Launch region | St. Augustine → Flagler (11 active locations in `site/v5/spots.js`). Jax/Nassau rows stay cataloged with `active: false`. Volusia excluded for now. |
| Modes | surf, pier, inshore (ICW/river/inlet). |
| Headline | GO / MAYBE / SKIP. Species show a 0–100 **suitability** (labelled as such, never "chance"). Historical catch rate shown separately, counted as **trips** across Northeast Florida (no county adjustment): "About <n> in 10 Northeast Florida shore fishing trips caught one in October (2015–2025 surveys)" when the month has ≥ 80 trips; below 80 trips a band instead: Common / Occasional / Rare "in October surveys — low sample". Never "0 in 10" (say "Fewer than 1 in 10"). Source label per mode: surf/pier "pier and beach surveys", inshore "river, bridge and bank surveys". (Amended 2026-10-05.) |
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
| Historical rate | Share of surveyed Northeast Florida shore fishing **trips** that caught the species in that month (all surveyed shore trips, not only trips targeting the fish; not measured at this spot), shown as "About N in 10", or as a Common / Occasional / Rare band when the month has fewer than 80 trips. Independent of today's conditions. |
| Confidence | 0–100, High / Moderate / Low: how complete and fresh the data behind this answer is. It is not how sure the fish are. |
| Window | A 60–150 min stretch where conditions peak for a location + mode. |
| Scope | What Today is answering for: **Best anywhere** (default until the user picks a spot in the spot picker, after which Today reopens on that spot), or one **Spot**. A session-only **Species focus** can be layered on top. |
| Backup | The next-best alternative, always MAYBE or better, even when the primary is SKIP. Order: (1) the opposite water type (ocean = surf/pier vs inshore; surf and pier are not each other's backup) at a nearby spot; (2) a later window at the same spot and mode; (3) the same water type at another nearby spot; (4) only if none reaches MAYBE, the best option anywhere with its area named. "Nearby" = within 7 miles straight-line. A different species only when a species focus is set. |
| Outlook | Days 3–7 in the planner: season-and-forecast-based, labelled as such; names no spot and no minute-precise window. |

### User journeys

| Journey | Steps | Must be true |
|---|---|---|
| **First open** | Open `/v5/` → Today renders instantly from `api/v5/<horizon>.json` with scope *Best anywhere* → one dismissible line under the verdict: "Suitability = how well conditions fit each fish. It is not a catch chance." | No onboarding screens, no sign-in, no permission prompts. Geolocation and install are requested only when the user taps "Near me" / "Install". Answer visible without scrolling at 375 px. |
| **Returning user** | Open → last-known run renders at once with "Updating…" in the freshness chip → fresher run swaps in without layout jump. Remembers the last spot chosen in the spot picker (other scope changes — tapping Best bet, Backup, "Best for this fish", or opening a shared link — last for the session only), favourites, last mode, species focus (session only), horizon override (session only). | Never a blank or spinner-only screen when a cached run exists. If the new verdict differs from the cached one, the verdict cross-fades (no flashing); aria-live announces it. |
| **"Where should I go right now?"** | Today, scope *Best anywhere*, horizon *Today* → Best bet card names spot · mode · window; if the window is open: "Fish now — until 8:25 AM". Tap *Spots* for the full ranking. | Windows already ended are never presented as the best bet; the next window is. Between windows: "Next window 5:40 PM". |
| **"I want pompano"** | Species tab → tap Pompano → species sheet (suitability now, best place/window, setup, history) → **Target this** → Today re-ranks for pompano and shows a removable "Targeting: Pompano ✕" chip. | The headline verdict is for the focus species and always carries it: ring caption "for pompano", headline, aria label and any shared link with `species=`. When the overall verdict is at least one step better, one line sits under the headline ("Overall today: GO — whiting at Flagler Beach Pier"). Safety SKIPs ignore the focus. A focused species that is not a realistic target (for example rarely caught on local shore trips that month) is capped at MAYBE with the specific reason ("Conditions fit, but few local shore fishing trips catch pompano in December"). If the species is a poor fit everywhere: SKIP for that species plus a pointer to what *is* working ("Whiting is the better bet today"). Bycatch species get no "Target this" button. Removing the chip restores the picker-chosen scope, else *Best anywhere*. |
| **Evening: "Should I go tomorrow?"** | After the evening cutoff (default 3:00 PM local, one exported constant) Today opens on **Tomorrow**. A *Today · Tomorrow* segmented control is always visible. | Tomorrow header reads "Tomorrow morning" / "Tomorrow evening" from the window. A "vs today" line states better / similar / worse. If today still has an open window, a one-line pointer remains ("Today's window: 5:40–7:10 PM"). |

### Above the fold — Today on a 375 × 667 phone

Budget ≈ 560 px of content height (667 minus status bar and the 56 px tab bar). Order is fixed; if something has to drop below the fold, drop from the bottom of this list.

| # | Block | Content | Approx. height |
|---|---|---|---|
| 1 | Header (sunset hero, compact) | Spot pill (tap ⇒ spot sheet; shows "Best anywhere" or the spot name) · *Today / Tomorrow* segmented control · freshness chip ("Updated 6:12 AM") | 88 |
| 2 | **Verdict + headline** | Ring/badge with **GO / MAYBE / SKIP** (word + icon, not number) · one-line headline ("<species> & <species> on the incoming tide") · when-line ("Tomorrow morning · <window>") | 150 |
| 3 | **Best bet** | Spot name · mode chip (Surf / Pier / Inshore) · window · "Fish now — until …" if open | 64 |
| 4 | **Targets** | Top 3 species, one line each: name · suitability bar · number. Label "Suitability" once in the card header. The GO driver is listed first (the focus species first when a focus is set); a target with a Rare history band carries a "Rare in surveys" tag | 112 |
| 5 | **Use** | One line: "Sand fleas or Fishbites on a pompano rig" | 48 |
| 6 | Confidence | One line: "Confidence: <level> · <n>" + stale/partial chip when relevant | 40 |
| — | *Below the fold* | **Backup** (first card below the fold; keep it within one scroll) → Why → Best times timeline → Conditions → Today vs Tomorrow → Other spots teaser → Data & sources | |

Ordering rules: verdict is always the largest element; no raw units above the fold; no more than 3 targets; no tables; nothing above the fold requires a tap to make sense.

#### Today screen — card inventory (P0 unless noted)

| Card | Level shown | Notes |
|---|---|---|
| Verdict hero | Glance | Tap ⇒ scrolls to Why. |
| Best bet | Glance | Tap ⇒ spot detail sheet (access, parking, tips from catalog). |
| Targets | Glance → Card | Tap a species ⇒ species sheet. "Local history" toggle reveals the history line per species ("About N in 10 trips" or a band). |
| Use | Glance → Card | Tap ⇒ full setup (where to fish, bait, lures, rig, tip) for the #1 target. |
| Backup | Card | One line + reason ("Backup: ICW redfish after 9:30 AM — wind drops and the tide turns"). Tap ⇒ makes it the scope for the session only. A backup outside the nearby radius names its area. |
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

Primary navigation dimension: **answer first, then scope** — Today is the answer for *Best anywhere*; Spot and Species are optional scopes layered on it; Mode is a secondary control inside a spot. Spot is the only scope that persists (see Spot picker); species focus is session-only. Mode is never a tab, a header pill outside a spot scope, or a default filter.

#### Spot picker (sheet, also the Spots tab body)

| Behaviour | Rule |
|---|---|
| Default sort | By verdict tier first (best first); within a tier by Near me distance when enabled, then favourite, then catalog order. Candidates in the same tier within 5 suitability points count as tied; a sub-5-point difference never changes an order or a headline. |
| Row | Spot name · area · mode icons · verdict chip · best window · top species ("<species> <n>"). One tap selects; star toggles favourite. |
| First row | "Best anywhere" (the default scope) — never hidden, always selectable. |
| Favourites | Pinned above the ranked list (localStorage); star is a 44 px target. |
| Mode filter | Segmented *All · Surf · Pier · Inshore*; filters rows, does not change scope. |
| Near me | Button asks for geolocation only on tap; on success re-sorts by distance *within* verdict tiers; on denial/timeout, shows "Location is off — showing best first" and stays sorted by verdict. Coordinates are never stored or sent. |
| Selecting a spot | Sets scope, closes the sheet, returns to Today. Only a pick made here persists; Today reopens on that spot next time. If the overall best is at least one verdict step better than the scoped spot (for example GO vs MAYBE), Today shows a line under the verdict: "Best overall today: <spot> (GO)". A better option at least one step up is never hidden. |
| Compare (P1) | Check up to 3 rows ⇒ comparison sheet, one column per spot: verdict, window, top 2 species, wind comfort, surf comfort. |
| Inactive spots | `active: false` catalog rows never appear. |

### GO / MAYBE / SKIP presentation rules

| Rule | Detail |
|---|---|
| Source of truth | Verdict comes from the engine; the UI never recomputes, upgrades or softens it. |
| Colour + shape + word | GO = `--go`, check icon; MAYBE = `--mid`, dash/wave icon; SKIP = `--skip`, x icon. The word is always shown; colour is never the only signal. |
| Ring | Ring arc is decorative (top suitability); centre text is the verdict word. Numbers are never shown in the ring. With a species focus the ring caption reads "for <species>". |
| aria | Verdict container is `aria-live="polite"`; label reads "Go. <spot>, <mode>, <window>." With a species focus it also names the species ("for pompano"). |
| GO | Headline names the fish and the cause ("<species> & <species> on the incoming tide"). GO requires every safety-gate input: forecast no more than 6 h old, alerts checked and, for ocean modes, a current wave reading (today) or wave forecast (tomorrow); otherwise the verdict is capped at MAYBE ("Can't confirm the surf right now" / "No surf forecast for tomorrow yet"). If confidence is Moderate (50–74) **because of a gap in today's live data**, a visible amber qualifier sits directly under the headline and names the missing input in plain words, e.g. "Moderate confidence — pressure reading unavailable"; never the generic "one input is missing". Built-in limits of a spot (distant tide station, inshore water temperature from the ocean buoy, thin history for the month) appear only in the Confidence line and "Why this confidence?", never as the headline qualifier. The ring does not distinguish a Moderate GO from a High one. Never buried in a card. |
| MAYBE | Headline names the main drag: "Decent fish fit, but wind picks up after 8 AM." Always show the best window anyway. |
| SKIP | Reason first, in plain words ("Thunderstorms forecast 2–6 PM"). A SKIP is never a dead end: always show **Next best option** (backup, next window, or tomorrow's verdict). Safety-gated SKIPs (thunder, wind, warnings, surf) use the safety icon and cannot be overridden or hidden. |
| High suitability, low confidence | Engine returns MAYBE; UI copy: "Looks good on paper, but our data is thin right now." |
| Per-species vs overall | The verdict is for the scope + focus (with a focus, the species is always named next to it); each target has its own suitability only, never its own verdict chip (except in species sheets, where "Best for this fish" shows the verdict for that species). Safety gates are never species-relative. |
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
| Header | Name (+ alt name) · suitability now for the current scope with band label · "Target this" button (primary, cyan pill; absent for bycatch species) |
| Best for this fish | Best spot · mode · window · verdict across the horizon; tap ⇒ sets scope |
| Why now | Top 2 helps and the worst hurts, plain words |
| Use | Where in the water, bait, lures, rig, one tip (from `species.js` `setupFor(species, mode)`); mode toggle if several modes apply |
| Local history | 12-month bar chart of the shrunk historical rate, current month highlighted; sentence per the copy rules ("About <n> in 10 Northeast Florida shore fishing trips caught one in October (2015–2025 surveys)", or a Common / Occasional / Rare band with a low-sample note when the month has fewer than 80 trips); per-mode source label ("pier and beach surveys" / "river, bridge and bank surveys"); "Counts all surveyed shore trips, not only trips targeting this fish; not measured at this spot"; "Rare in surveys" tag when the band is Rare |
| Water-temperature fit | Strip from min to max with the comfortable band shaded and today's water temp marked; one sentence ("71 °F — comfortable for pompano") |
| Rules link | "Check current FWC rules" link; the app never states size or bag limits |

Suitability bands (labels shown beside the number in sheets and L1; independent of the GO threshold, which the engine sets): **70–100 Great fit · 50–69 Decent fit · 30–49 Poor fit · 0–29 Not a fit.**

### 7-day planner (Plan tab)

| Element | Rule |
|---|---|
| Rows | One per day: weekday + date · verdict chip · best window · top species (name only) · one-line reason ("Falling tide at sunrise, light wind"). Days 3–7 show part of day + tide phase instead of a window ("Morning · incoming tide"), with no spot. |
| Days 1–2 (today, tomorrow) | Real predictions: GO/MAYBE/SKIP, solid chips. |
| Days 3–7 | **Outlook**: outline-style chips labelled **Promising / Mixed / Tough** (GO / MAYBE / SKIP never appear after day 2), "Outlook" tag on each row, no suitability numbers, no spot and no minute-precise window (part of day + tide phase only). Copy at top: "Outlook for days 3–7 uses season, tides, moon and the daily forecast. It updates daily." |
| Scope | Follows the current scope and species focus; scope chip shown at top. |
| Tap a day | Days 1–2: day sheet with best 2 windows (spot · mode · window · top species), a "Why" row and a "Use" row. Days 3–7: species likely in season plus the tide/light reason only; no Use row and no windows. |
| Best day | The best day in the 7 gets a subtle "Best day this week" marker. It can land on an outlook day only if both day 1 and day 2 are SKIP; then it reads "Most promising outlook". |
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
| **Partial data** | One or more sources missing/stale but run succeeded (`confidence` lowered) | Verdict stays unless a required safety-gate input is missing (then capped at MAYBE); a qualifier naming the missing live input sits under the headline; amber "partial" chip; Data & sources lists exactly what's missing | "Pressure reading unavailable, so confidence is lower." |
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
| Suitability | Always labelled "Suitability" (or "fit"); first-use hint explains it; never as a catch percentage. | "<species> — suitability <n>" · "Great fit" | "84 % chance", "odds", "likely to catch" |
| Historical rate | Separate line: "About N in 10", counted in **trips** (never anglers), Northeast Florida shore, month, years, per-mode source label ("pier and beach surveys" for surf and pier; "river, bridge and bank surveys" for inshore); N is a whole number; never "0 in 10" (say "Fewer than 1 in 10"); never merged with suitability. | "About <n> in 10 Northeast Florida shore fishing trips caught one in October (2015–2025 surveys)." | "<n> in 10 local shore anglers…", "40 % success", "you'll catch…" |
| Low sample | Below 80 trips for the month, replace the number with a band; say it is thin; don't hide it. | "Occasional in October surveys — low sample." (band: Common / Occasional / Rare) | Showing a precise rate from tiny n |
| Confidence | Word + number, describes *data*, with a reason. | "Confidence: <level> · <n> — forecast, tides and waves are current." | "78 % sure", "guaranteed" |
| Certainty words | Hedge forecasts, not facts. | "Looks good", "should", "favours" | "guaranteed", "sure thing", "can't miss", "will bite" |
| Words to avoid in UI | chance, probability, odds, guarantee(d), epic, hotspot, "limits", any size/bag limit, raw jargon (hPa, Hs, MLLW, "solunar" — say "moon timing"), "unlikely" for suitability bands | | |
| Numbers | Raw units only at L1 secondary and L3; times 12-hour local; "mph", "ft", "°F". | "Light wind, 8 mph" | "NW 7.2 kt gust 11.4" |
| Backup | Always state the reason; a backup outside the nearby radius also names its area. | "Backup: <spot> <species> after <time> — the wind drops and the tide turns." | "Backup: ICW" |
| Regulations | Link, never state. | "Check current FWC rules." | "Pompano limit is …" |
| Headline | ≤ ~60 characters, species + cause. | "<species> & <species> on the incoming tide" | "Optimal conditions detected" |
| Tone for SKIP | Honest, helpful, never shaming. | "Skip today — storms 2–6 PM. Tomorrow morning looks better." | "Bad day." |

**Reference output (hero shape and fields the UI must be able to render; values are placeholders, not model output):**

> **<Today|Tomorrow> <morning|evening>: <GO|MAYBE|SKIP>** · Best bet: <spot> <mode> · <window> · Targets: <species> <n>, <species> <n>, <species> <n> · Use: <bait> on a <species> rig · Why: <up to three helps, one hurts> · Backup: <spot> <species> after <time> · Confidence: <level> · <n>

### Other UI requirements (carried over)

- Share: Web Share API with a copy-link fallback (`#spot=…&mode=…&species=…&h=…`). Pull-to-refresh and a refresh button. Install prompt on explicit tap only. Explicit source timestamps and stale chips. `prefers-reduced-motion` respected. Keyboard and screen-reader friendly: real buttons, `aria-pressed` on toggles, `aria-live` on the verdict, 44 px minimum targets, focus trap in sheets, visible focus ring.
- Visual: root-app shell (dark-slate cards, score ring, hourly strip, stat tiles, ranked list, 7-day bars) plus the v1/v3 sunset hero and cyan pill buttons for the header. Light and dark. No new design language.
- Phone first (375 px), then 560 px column on desktop (same `max-width` as the root app). No horizontal scroll.

## Product requirements for the technical architecture

> Reconciled with `docs/v5-architecture-decisions.md` Revision 2 (§1 contracts, §6 wire contracts) and `docs/v5-product-decisions.md` on 2026-10-05 (M11); the ADR governs exact field shapes. The UI renders `PredictionRun` objects only; it must not compute scores, labels or rankings. Anything below the UI would have to derive should be an engine output.

| # | Requirement | Needed for |
|---|---|---|
| 1 | `Recommendation.headline` (≤ ~60 chars, species + cause), `Recommendation.whenLabel` ("Tomorrow morning · <window>"), and `Recommendation.useLine` ("<bait> on a <species> rig"), each a `CopyMessage {code, params, text}` with a fallback `text`; time-relative wording is rendered by shared `copy.js` `(run, now)` formatters. | Above-the-fold copy; consistent widgets/notifications. |
| 2 | Human reason for every non-GO: `Recommendation.reason` and `gates[]` as `CopyMessage {code, params, text}` (gates add `startsAt`, `endsAt`, `severity`) with plain-language text including time range. | SKIP/MAYBE headline, safety states. |
| 3 | Per-factor human output on `PredictionFactor`: `effect` ("helps"/"neutral"/"hurts"), `group` (tide, light, wind, surf, water, season, moon, weather, pressure), `humanLabel`/`summary` in plain words, `limiting: boolean`. Keep `value/score/weight` for L3. | Why card, condition tiles, indicators. |
| 4 | `Conditions` plain-word labels: `wind.label`, `waves.label`, `tide.label`, `waterTemp.label` ("comfortable for pompano"), `sky.label`. | Condition tiles. |
| 5 | `backup.reason`, `backup.kind` ("other-mode" = opposite water type, ocean vs inshore, never surf↔pier / "other-spot" / "later-window" / "other-species", the last only with a species focus and no safety gate), `backup.distanceMi`, and the backup's own actual `verdict` + `suitability`. A backup is never below MAYBE and is not clamped to the primary (it can be MAYBE when the primary is SKIP). Order and "nearby" (`NEARBY_MILES = 7`) as in Vocabulary. If none qualifies, `nextOption` (next window or tomorrow) is emitted instead. | Backup card. |
| 6 | Per-species target entries carry `name`, `suitability`, `band` ("great"/"decent"/"poor"/"none"), `eligibility` + reason, `tags[]` (e.g. "Rare in surveys"), and `historicalRate` object `{rate, n, month, lowSample, band, unit: "trips", sourceLabel}` (regional shrunk rate, no county adjustment; never raw; `lowSample` = n < 80 unique trips; `band` Common/Occasional/Rare, null when history is unavailable). | Targets card, species sheet, copy rule on low sample. |
| 7 | `seasonCurve[12]` per species and mode: regional shrunk historical rate by month (engine's shrinkage, no county adjustment, not raw monthly n). | Species 12-month chart; avoids the UI showing tiny-n rates. |
| 8 | `waterFit` per species and location: `{state: "ideal"/"ok"/"cold"/"hot", text, minF, idealLowF, idealHighF, maxF, currentF}`; `state` and `currentF` are null with explicit copy when water temperature is unavailable. | Water-temperature strip. |
| 9 | Per-location recommendation: `locations[].recommendation` (best mode, window, verdict, top species, `rank` per verdict tier, `tiedWith[]`) so Spots needs no client scoring; verdict per location × mode × window. | Spot picker, Spots tab, compare. |
| 10 | Species index: `bySpecies[speciesId] → {best: {locationId, mode, window, suitability, verdict}, fitNow}` and a species-focused recommendation that also returns `overall.verdict` and a `focusCapped` reason (regional focus precomputed; local focus materialized by the shared `selectRecommendation` selector over stored predictions). | Species tab, "Target this", "GO for pompano". |
| 11 | Slot series for the timeline per location × mode: 30-min slots with `suitability`, tide height/rate/phase, light phase, moon-timing marks, per-slot top-3 species and condition labels, so the scrubber needs no engine call. | Timeline, scrubber, tiles at selected time. |
| 12 | Planner `days[7]`: `{date, kind: "forecast"/"outlook", reason, confidence}` plus, for days 1–2, `verdict`, windows and `topSpecies[]`; for days 3–7, `outlookLabel` ("promising"/"mixed"/"tough") and `bestWindow {partOfDay, tidePhase}` with no `locationId`, no minute-precise window, no suitability number and never GO. | Plan tab. |
| 13 | Freshness model: `run.generatedAt`, `validTo`, `carriedForward: boolean` (+ original `generatedAt`), `status` ("ok"/"partial"/"degraded"), `missingInputs[]` in plain words. Per source: `ageMinutes`, `stale`, `usedFallback`, `affects[]` (which factors/labels it feeds). | Stale/partial/offline states, Data & sources. |
| 14 | `confidenceReasons[]` as `{code, params, text, penalty, kind: "live" | "structural"}` (human text), a one-line `confidenceSummary` ("Forecast, tides and waves are current"), and a nullable `amberQualifier` built only from live, non-blocking reasons. | Confidence line, "Why this confidence?". |
| 15 | `comparison.delta` ("better"/"similar"/"worse") with the rule "better/worse for a verdict-tier change or more than 5 suitability points, otherwise similar", plus `recommendedHorizon` and reason (the engine applies one exported 15:00 cutoff; the UI keeps no cutoff of its own). Comparison wording is rendered by `copy.js` `(run, now)`. | Today vs Tomorrow, evening mode default. |
| 16 | Display names: `displayName` for location+mode ("Flagler Beach Pier · surf" only when a location has several modes), `modeLabel`, window `partOfDay` ("dawn", "morning", "midday", "afternoon", "dusk", "evening"). | Best bet card, headlines. |
| 17 | Setup output per mode: structured `{where, bait[], lures[], rig, tip}` plus one-line `useLine`; `tip` from `species.js`. | Use card, species sheet. |
| 18 | Window fields `isOpenAtGenerated`, `startsInMinAtGenerated`, `endsInMinAtGenerated` (relative to `generatedAt`); open/ended/countdown wording is computed at render time by the shared `copy.js` `(run, now)` formatters, never frozen at generation. Windows never cross midnight; today never extends into tomorrow. | "Fish now — until…", struck-through past windows. |
| 19 | Contracts validate required fields; unknown optional fields are ignored and an unfamiliar `modelVersion` or `paramsHash` is never a reason to reject a run; only an unsupported `schemaVersion` major is rejected, so the UI degrades instead of failing on a newer run. | Error state. |

## Open product questions for Opus

All six were answered and owner-approved on 2026-10-05; the answers live in `docs/v5-product-decisions.md` (the spec text above is already conformed to them).

| # | Question | Status |
|---|---|---|
| 1 | Primary navigation dimension — location, mode or species? | **Answered** — product-decisions §1. |
| 2 | How are cross-mode backups chosen? | **Answered** — product-decisions §2 (7-mile "nearby", opposite water type first, MAYBE or better). |
| 3 | How to present GO when confidence is only Moderate? | **Answered** — product-decisions §3 (plus ADR §5 for the gate inputs). |
| 4 | Default scope: Best anywhere or the user's last/home spot? | **Answered** — product-decisions §4. |
| 5 | Should a species focus change the headline verdict? | **Answered** — product-decisions §5. |
| 6 | Should the outlook (days 3–7) use different labels? | **Answered** — product-decisions §6. |

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
  params.js      one exported/versioned MODEL_PARAMS
  contracts.js   schema versions and model provenance, JSDoc types, constructors, validateRun()
  copy.js        coded messages and pure (run, now) formatters
  history.js     personal trip hits, shrinkage, season curves, sample labels
  sources.js     provider adapters, normalization, cache, isolated failures
  astro.js       sun/twilight, moon phase/transit/rise/set, solunar periods
  factors.js     pure factors with constants/weights from MODEL_PARAMS
  model.js       suitability, confidence, windows, verdicts, backups, scope views
  run.js         buildPredictionRun({ now, locations, fetchImpl, history, previousRuns, preferences }) → { today, tomorrow }
```

`buildPredictionRun({now,locations,fetchImpl,history,previousRuns,preferences})` is called once and returns `{today: PredictionRun, tomorrow: PredictionRun}`. It fetches/normalizes shared observations once, builds both horizons through the same scoring path, and compares their summaries before returning. Each result has its own horizon, target date and validity interval. No morning/evening-specific scoring path exists. The output is deterministic for `now`, observations, history, preferences and prior runs.

Reuse `site/shared/logic.js` tide helpers (`seriesFromHilo`, `heightAt`, `tideRate`) and unit conversions where their contracts fit; reuse the NWS response/failure patterns in `src/worker.mjs` and deployed-state seed pattern in `scripts/generate.mjs`. `weightedScore` in `site/shared/week.js` is a reference for missing-factor renormalization, not a reason to change the shared helper. Do not edit those shared files or change root-app behavior for V5.


ADR Revision 2 governs the technical contract; the product text above was reconciled to the approved decisions on 2026-10-05 (M11, ADR §10); remaining open items are logged in ADR §10. Section references below refer to the ADR. Native means a Capacitor JS runtime; other runtimes require parity-tested ports. Suitability is heuristic fit, confidence is input completeness/freshness, calibratedProbability is null.

### Sources (`sources.js`)

Adapters return typed `NormalizedObservation{provider,kind,locationId,station,units,observedAt,issuedAt,validFrom,validTo,fetchedAt,values,ok,stale,usedFallback,safeErrorCode}` with interval values for forecasts. Null times are permitted when irrelevant to that kind. Isolate failures; unavailable factors are listed/excluded and weights renormalized. Preserve provenance and source age; fetchedAt never makes an old observation/issuance fresh.

- NWS points: resolve/cache land forecastHourly, forecastGridData and observation stations separately from volatile forecasts/alerts. Metadata TTL 7 days, stale-on-error up to 30 days; hourly forecast/grid TTL 30 minutes, alerts 10 minutes, pressure observations 15 minutes. Normalize wind/direction/gust, air temperature, PoP and thunder; pressure uses up to 12 station readings for 3 h/6 h changes. Alerts checked/none != fetch failure.
- Today waves/temp: SECOORA via buoyUrls first; valid ≤3 h NDBC marine snapshot fallback. Water temperature and waves are independent; inshore ocean-buoy temperature is structural.
- Tomorrow waves: area-mapped **nearshore marine coordinate**, resolve its NWS forecastGridData and normalize `properties.waveHeight.values` ISO-duration validTime intervals/units. Do not use a land hourly forecast or treat windWaveHeight as total seas. Wave forecast freshness uses grid updateTime/issuance, not fetch time. Period unavailable removes only period-dependent output; never invent it.
- CO-OPS: catalog stations, predictions GMT/MLLW/hilo, date-range TTL 6 h, padded three-day series interpolated to 30-minute values; UTC instants, local labels via time-zone formatting; distant station vs failed fetch are separate reasons. Nearshore water-temperature station preferred when configured.
- MRIP: integer hits/denominators, repaired artifact/hash loaded once; missing != zero.

Cache keys include provider, kind, station/location and horizon/date range. Buoy responses TTL 30 minutes. Stale-on-error stays stale and cannot satisfy a GO-required input. sourceStatus records ageMinutes/stale/usedFallback/affects and safe display status. Water-temperature anomaly from NDBC day-of-year climatology is explanatory only.

**A2 wave verification:** for each active ocean area's fixed marine coordinate, record lat/lon, office/grid mapping and URL, fetch timestamp/updateTime, non-null waveHeight intervals spanning tomorrow 05:00–21:00, units and sample payload hash. Test requests from `/v5/` browser origin for CORS and from Node; retain dated fixtures. Also test null/empty/partial intervals, units, duration parsing and stale issuance. `/points` availability alone is not proof of wave availability. If no grid field exists, investigate NWS coastal-waters zone forecast seas as fallback: record zone/issuance, explicit valid interval and units, parse only unambiguous numeric seas ranges and use upper bound conservatively. Unsupported wording/coverage remains unavailable and caps tomorrow ocean at MAYBE. This verification is an implementation task, not a claim that the field works today. Official [NWS API docs](https://www.weather.gov/documentation/services-web-api) and [gridpoint fields](https://weather-gov.github.io/api/gridpoints) describe raw marine grids.

A2 also inventories hindcast station/year coverage from §3 and defines the normalized input recorder. It can capture inputs before the model is finished; missing predictions are marked pending, never fabricated. Actual scheduled recording begins with the authorized workflow integration, without waiting for Supabase or outcome UI.

### History and MODEL_PARAMS (`history.js`, `params.js`)

### Required builder correction (step 0)

One eligible interview `(YEAR,WAVE,ID_CODE)` is one trip. Personal catch success is a joined row satisfying `(CLAIM > 0 AND F_BY_P == 1) OR HARVEST > 0 OR RELEASE > 0`. Count individually attributed Type A and individually reported B1/B2, including B1/B2 when `F_BY_P==8`; never credit group Type A (`F_BY_P==2`). `TOT_CAT` is a total check, not an attribution test. `TRIP.CATCH` is the available-for-identification flag, not complete personal catch; preserve disagreement counts as QA.

Species hits are a union of all `SPECIES[].mrip` aliases per interview; denominator is every eligible interview in that regional mode/month, including no-catch interviews. Publish integer `hitTrips/nTrips`, unrounded unweighted `p`, and `personalAnyCatchTrips/nTrips` QA. Exclude proxies (`IMP_REC==1` in trip/catch or embedded interview year != survey YEAR), report them separately with source keys. Missing/omitted slices are unavailable; zero requires explicit zero hits with a positive denominator. Ocean history supports surf/pier together; inland supports inshore. County slices may remain diagnostic but never feed predictions.

`n` means unique non-proxy interviews. `lowSample = n < MODEL_PARAMS.history.numericMinN` (80); unavailable history uses unavailable copy, not a fabricated Rare band. Both numeric copy and confidence history penalties use n. Kish `effectiveN` and WP_INT-weighted rates remain QA sensitivity fields only; missing weights do not hide an otherwise valid unweighted rate or change GO eligibility.

Sources: NOAA [survey-variable workbook](https://media.fisheries.noaa.gov/2022-06/MRIP-Survey-Variables-for-Web.xls), [MRIP handbook pp. 7–8, 16–17](https://www.fisheries.noaa.gov/s3/2023-04/MRIP-Data-User-Handbook-04-2023.pdf), [methods p. 27](https://www.fisheries.noaa.gov/s3/2024-05/MRIP-Survey-Design-and-Statistical-Methods-Updated-April-2024-508.pdf), and [downloads/grain](https://www.fisheries.noaa.gov/recreational-fishing-data/recreational-fishing-data-downloads). Legacy rates in `data-qa-mrip.md` predate this repair and cannot set model thresholds.

### Regional shrinkage and timing

For species s and history mode d, use integer hits h and unique interviews n; previous/next months wrap Dec ↔ Jan:

1. `pAnnual = hAnnual / nAnnual`.
2. `pNeighbor[m] = (hPrev + hNext + kNeighbor*pAnnual) / (nPrev + nNext + kNeighbor)`.
3. `pMonth[m] = (hMonth + kMonth*pNeighbor[m]) / (nMonth + kMonth)`.
4. `historicalRate = pMonth[m]`. **No county adjustment.**
5. `pPeak = max(pMonth[1..12])` for that same species/history mode; `seasonScore = pMonth[m]/pPeak` when `pPeak>0`. An explicitly all-zero complete curve scores 0; an incomplete/unavailable curve makes season unavailable. Clamp floating-point roundoff to [0,1].

**Worked arithmetic example, not empirical/launch data:** annual 60 hits/1,200 interviews; previous month 6/100, next 9/100, current 8/100; `kNeighbor=80`, `kMonth=40`. Neighbor = `(6+9+80*.05)/280 = .067857`; current shrunk rate = `(8+40*.067857)/140 = .076531`. If the twelve-month shrunk peak is .10, seasonScore = `.076531/.10 = .76531`. With season weight .24 its pre-renormalization contribution is .18367. Another species at monthly .015 and its own peak .02 scores .75: timing is similar despite lower prevalence. That species is Rare and cannot drive GO, but its suitability is not capped solely for rarity. This removes double-counted prevalence.

Relative season `< MODEL_PARAMS.history.seasonCapBelow` (0.10) caps suitability at `seasonCapSuitability` (20); no absolute-rate suitability cap remains. Historical prevalence appears only in the history line/band and eligibility, never again as a condition score.

Copy: Common ≥.20; Occasional ≥.05 and <.20; Rare <.05, computed from pMonth. With n<80 show “{Band} in {Month} surveys — low sample.” Otherwise integer `N=round(10*pMonth)`; N<1 says “Fewer than 1 in 10.” Never decimal “0.2 in 10” or “0 in 10.” Numeric line: “About N in 10 Northeast Florida shore fishing trips caught one in MONTH (2015–2025 surveys).” Source label surf/pier: “pier and beach surveys”; inshore: “river, bridge and bank surveys.” Data & sources: “Counts all surveyed shore trips, not only trips targeting this fish; not measured at this spot.”

### Threshold sheet → MODEL_PARAMS

Luna owns `docs/v5-threshold-sheet.md` after repair. Required header: catch-definition version, source years/URLs/cache hashes, artifact SHA-256, proxy exclusions, alias/catalog hash, shrinkage equations, proposed parameter revision. Required rows per **species × UI mode × month**, plus annual row (surf/pier must explicitly name their shared ocean slice):

| Columns | Purpose |
|---|---|
| speciesId, aliases, mode, historyMode, month/all, validMode | Mapping and shared sampling frame. |
| hitTrips, nTrips, rawRate; annual hitTrips/nTrips/rawRate | Corrected counts and unique-interview denominators. |
| neighbor hitTrips/nTrips, kNeighbor, kMonth, pNeighbor, shrunkRate, peakShrunkRate, relativeSeason | Reproducible monthly math and timing. |
| lowSample, band; proposed Common/Occasional/Rare cuts, proposed realistic floor by mode | Display and eligibility proposal with owner constraints visible. |
| eligible active locationIds, realistic targetIds per location × mode × month, months with none, mode coverage result | Catalog/structure-aware reachability; distinguish zero from unavailable. |
| proposed GO suitability threshold, proposed relative season cap/score ceiling, rationale, unresolved cells | Model proposal, not guessed launch constants. |

Procedure: (1) step 0 QA proves repaired counts and aliases; freeze artifact/hash. (2) Recompute all sheet rows from integers using priors 80/40; retain those pseudo-counts unless a documented sensitivity check establishes a defect. (3) Apply approved bands and candidate floor .05, run §3 coverage and report Common-cell share. (4) Architecture owner promotes a reviewed sheet into **one exported `MODEL_PARAMS` in `engine/params.js`**, including history priors, bands, numericMinN=80, thinMinN=30, history confidence penalties, floor, relative cap, GO suitability threshold, weights and remaining scoring/gate constants. No parallel `HISTORICAL_BAND_CUTS` or factor-local history literals. (5) A5 hindcast selects the GO threshold, freezes parameters and reruns the gate; record iterations and results.

Rate-dependent launch values remain **“set by threshold sheet”**: `realisticFloor` (candidate .05, not active until coverage passes) and `goSuitabilityMin`. Approved bands (.20/.05), n cutoffs (80/30), priors (80/40) and relative season cap (.10/20) are fixed proposals recorded in that sheet, not old absolute-rate calibration. Remove `kCounty`, absolute season ceiling .20 and absolute rate cap .02. Any floor change also requires owner approval of the Rare/realistic boundary; never invent per-mode exceptions.

Each immutable model-version record stores the full MODEL_PARAMS, parameter revision, catch-definition version, threshold-sheet/artifact/catalog hashes, code revision and notes. `paramsHash = SHA-256(canonical JSON MODEL_PARAMS)`; every run references modelVersion + paramsHash and historyHash. A parameter change creates a new model version, not an overwrite.

### Factors (`factors.js`)

`PredictionFactor` carries `{key,label,group,value,unit,score,weight,contribution,effect,humanLabel,summary,detail,source,available,limiting}`. Scores are 0–1. Map groups: season→`season`, waterTemp→`water`, tide→`tide`, light→`light`, solunar→`moon`, wind→`wind`, waves→`surf`, pressure→`pressure`, rain→`weather`. `effect` is `helps` at score ≥0.67, `neutral` at ≥0.34 and <0.67, otherwise `hurts`; mark the single lowest available factor `limiting` when its score <0.34 (tie by the factor order below). For unavailable factors, set `effect/score/contribution` null, `limiting:false`, and provide missing-input text. Available weights are renormalized per species/window; unavailable factors remain listed and do not contribute. All constants below live in MODEL_PARAMS; the tide-rate normalization scale must be explicit in the reviewed parameter record and boundary fixtures before A3 acceptance (never a hidden factor literal). preserve these proposed nine factors and weights:

Apply tide-sensitivity multipliers to its configured base weight, then for available factors set serialized `weight = normalizedWeight = adjustedWeight / sum(available adjusted weights)`, `contribution = score × weight`, and `suitability = round(100 × sum(contribution))` once. Unavailable factors have null weight/contribution. Show factor `value/score/weight` only at L3.

| Factor | Rule |
|---|---|
| `season` | Use §2 regional shrinkage: `score = pMonth[m] / max(pMonth[1..12])` in the same history mode. Complete all-zero curve → 0; incomplete curve → unavailable. Timing only; prevalence feeds history/eligibility. |
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

Hard caps: outside species water `[min,max]` or relative season `<MODEL_PARAMS.history.seasonCapBelow` limits suitability to `MODEL_PARAMS.history.seasonCapSuitability` (proposals .10/20). No absolute-rate cap. `needsStructure` species score only at pier/jetty/bridge/dock/seawall/rocks. Bycatch can appear under “Also biting” but cannot become a target or drive GO. Keep factor values, score and weight for L3; never show weights in glance/card UI.

### Model (`model.js`)

Nine factors/weights remain; season now measures timing. `GO` requires driver suitability ≥`MODEL_PARAMS.goSuitabilityMin`, confidence ≥50, eligibility `realistic`, no safety gate, forecast issued ≤6 h ago, checked alerts, and horizon-appropriate ocean waves (§5/§7). Suitability label “Great fit” still starts at 70; the GO threshold is independent. Non-GO suitability ≥50 gives MAYBE, otherwise SKIP; missing required live input or low confidence caps at MAYBE, never overrides a safety SKIP.

Compute exactly one `eligibility: realistic | rare | off-list | bycatch | no-structure` per SpeciesPrediction in model.js, in this precedence: bycatch; required structure absent; not in spot targets; missing history or rate below approved floor; otherwise realistic. Missing history uses `rare` conservatively with `eligibilityReason=historyUnavailable` and no “Rare in surveys” tag/band until known. Unsupported species modes produce no candidate. Only realistic drives GO. `focusCapped`, Also biting, Rare tags and driver selection read this enum/reason, not parallel checks. Any listed target with a known Rare history band carries “Rare in surveys”, including off-list/structure-limited targets; off-list/structure limits also get their own reason. `focusCapped` means eligibility is not realistic, with the specific eligibility reason; bycatch has no focus action. Focus stays first and cannot defeat a safety gate.

Search windows **per species**, not on max-across-species slots. Compare species/window candidate verdicts, then suitability. If a realistic candidate can GO, select its own best window as driver; otherwise select the best MAYBE/SKIP candidate. Targets: driver first, remaining eligible non-bycatch species by suitability evaluated over that driver's window. Keep the driver even when it is outside the numerical top three. Per-slot top species is display only. Emit `caps[]{code,params,text}` and `notRealistic` reason for capped focused recommendations. Helps/hurts order uses signed weighted effect `(score-.5)*normalizedWeight`, not raw score.

### Windows and display outputs

Generate 30-minute slots from now through today 21:00, and tomorrow 05:00–21:00, all New York local time. For each species, find local peaks; take maximal contiguous segments within 8 unrounded suitability points of each peak. Expand short segments by the higher-scoring adjacent slot until 60 minutes, or discard if impossible. Limit long segments to the best-mean 150-minute slice containing the peak (tie: earlier). Sort by peak, mean, then earlier start; remove overlaps and expose up to four windows per species. Never cross midnight or the horizon bounds. Window suitability is the unrounded mean of that species' slot scores, rounded once after window aggregation/caps. Window confidence uses the union of applicable reasons across its inputs, each penalty once; required coverage and safety gates apply across the whole window, not just its peak. Algorithm constants belong in MODEL_PARAMS.

Recommendation confidence is its driver's confidence, not an average of targets. Target suitability is computed over the driver's window; suitability bands are Great ≥70, Decent ≥50, Poor ≥30, otherwise Not a fit. These labels do not set the tuned GO threshold. `waterFit` is cold/hot outside species min/max, ideal inside the ideal interval, otherwise ok; unavailable temperature has null state/currentF and explicit copy.

Backup order: opposite water type within `NEARBY_MILES=7` (including another cataloged mode at the same spot), later same-place/mode window, same water type at another nearby spot, then best anywhere with area named. Surf ↔ pier is not opposite water. Never below MAYBE; if none qualifies emit next-window/tomorrow option. Focus may use `other-species` only without a safety gate. Preserve each backup's actual verdict, even when better than the primary; do not clamp it to the primary (protected requirement 5 conflicts with approved decision 2). Emit kind/reason/distanceMi.

Comparison is better/worse for a verdict-tier change or >5 points; otherwise similar. Display mode only for multi-mode spots. Window midpoint determines partOfDay: dawn/sunset bands ±60 minutes (dawn/dusk), morning through 11:59 after dawn, midday 12:00–14:59, afternoon until dusk, otherwise evening. Planner days 1–2 carry forecast verdicts; days 3–7 use Promising/Mixed/Tough, partOfDay+tidePhase, no spot, minute window, suitability number or GO. Outlook uses season/tide/moon/light and daily weather. “Most promising outlook” only when both forecast days are SKIP.

Best anywhere compares verdict tier then suitability. Same-tier candidates within 5 points of the highest score tie (no transitive chaining); order favourite → target-list membership → catalog order. Spots retains the approved verdict tier → Near me distance when enabled → favourite → catalog order. Preserve a usable prior location + mode while tied; refresh its current driver/window. Switch when prior is invalid/gated, challenger improves >5 points, or improves a verdict tier.

The prior must have **the same targetDate and scope/focus/preferences**. Fetch both deployed files; at midnight yesterday evening's tomorrow run is today's prior. Never hold yesterday's today selection or compare across target dates. No matching prior means deterministic tie order. Builder/selector receive prior runs and preferences explicitly, with no hidden state.

Every Recommendation adds `selection{reason: tie|held|switched, heldFromRunId, priorRecommendationId, preferenceKey}`. `heldFromRunId` is non-null only for a hold; first selection uses switched with no prior. Server uses empty favourites; client engine selector may personalize ties using explicit favourites and its previous displayed same-date view. Store deterministic recommendation IDs (run + scope/focus + place/mode/window + preferenceKey) and preserve the displayed recommendation ID/location/mode/window in any future outcome record; never pretend server Best anywhere was necessarily displayed.

Start confidence at 100; apply each reason once, clamp 5–100. Every reason is `{code,params,text,penalty,kind:live|structural}`. Forecast missing/>6 h −25, 3–6 h −10; alerts unchecked −20; tide unavailable −20; ocean tide station >15 mi −10 structural; horizon-required ocean waves unavailable −10; water temperature missing −10; inshore buoy temperature −5 structural; pressure missing −5; history unique-interview `n<30` or unavailable −15 **structural**, otherwise `n<80` −8 **structural**. Kish never enters confidence. History thresholds/penalties come from MODEL_PARAMS. High ≥75, Moderate ≥50, Low <50.

GO additionally needs a forecast issued ≤6 h ago with target-window coverage, checked alerts, and ocean waves: **today** buoy/fallback observation ≤3 h old; **tomorrow** wave forecast issued ≤6 h ago covering the full proposed window. Missing gate inputs cap at MAYBE. Observations never satisfy tomorrow waves; production has no hindcast bypass. Safety gates force SKIP: thunder, wind ≥25 mph/gust ≥35 mph, matching active NWS warning, ocean significant wave height >2.5 m; preserve time ranges. If wave forecast is a range, gate on its upper bound.

Moderate GO may carry an amber qualifier only for active non-blocking live gaps, named by shared copy (e.g. pressure unavailable). Structural reasons never produce it. Required-wave gap is a MAYBE reason, not a GO qualifier. Missing tomorrow wave forecast: “No surf forecast for tomorrow yet.” Missing today waves: “Can't confirm the surf right now.”

### Contracts (`contracts.js`, `copy.js`)

All timestamps are ISO-8601 UTC; local targetDate/labels use America/New_York. All display messages use CopyMessage, including nested reasons, labels, setups and accessibility text. Null/unavailable is explicit; validators do not coerce missing data to zero.

| Contract | Required fields |
|---|---|
| PredictionRun | schemaVersion, id, modelVersion, paramsHash, historyHash, catalogHash, codeRevision, horizon, targetDate, generatedAt, validFrom/validTo, region, status (ok/partial/degraded), carriedForward, missingInputs[], recommendation, scopeViews, locations[], bySpecies, slots[], days[7], inputs.sourceStatus[], notes[], detailsRefs. Carry-forward adds originalGeneratedAt/attemptedAt and failure metadata. |
| NormalizedObservation | provider, kind, locationId, station, units, observedAt, issuedAt, validFrom/validTo, fetchedAt, values (forecast intervals), ok, stale, usedFallback, safeErrorCode; irrelevant timestamps may be null. |
| Location / Conditions | Catalog fields mirrored from spots.js; location/time and wind/rain/thunder/air-water temperature/waves/tide/pressure/light/moon/alerts, labels and provenance/availability. |
| PredictionFactor | §2 factor fields; score/weight/contribution null if unavailable; summary effects in core, full rows in lazy details. |
| SpeciesPrediction | id, speciesId, locationId, mode, window, suitability/band, calibratedProbability:null, confidence/reasons, eligibility/reason, caps[], setup/useLine, historicalRate, seasonCurve[12], waterFit, detailsRef. History: nullable rate/n, month, lowSample, band (nullable when unavailable), unit:trips, sourceLabel; Kish effectiveN optional QA only. |
| FishingWindow | id, locationId, mode, UTC start/end, partOfDay, species predictions, suitability, gates[], isOpenAtGenerated, startsInMinAtGenerated, endsInMinAtGenerated. Runtime flags come from shared clock formatters. |
| Recommendation | id, scope/focus, horizon, locationId/mode/window, driverSpeciesId, verdict, suitability, displayName/modeLabel/partOfDay, headline/whenLabel/useLine, reason (required non-GO), gates[], caps[], targets[], setup, why[], limitingFactor, confidence/level/reasons/summary, amberQualifier (nullable), backup (nullable), nextOption (nullable), overall.verdict and focusCapped when focused, comparison, tiedWith[], rank, selection. Headline species equals first target; focus first. |
| Target / setup | speciesId/name, suitability/band, eligibility/reason, historicalRate, tags[]; setup: where, bait[], lures[], rig, tip. Bycatch is separate Also biting, never a target. |
| Scope/index | Precomputed Best anywhere, location×mode, regional species focus; locations include conditions/freshness/per-mode views and summary; bySpecies includes best/fitNow/focused view/overall. Local focus materialized by shared selector over core predictions. |
| Timeline / planner | Per-location/mode slots: at, suitability, tide(heightFt/rateFtPerHr/direction/phase), lightPhase, moonMarks[], topSpecies[3], conditionLabels. Days: date/kind/reason/confidence, forecast verdict/windows/topSpecies for 1–2; outlookLabel and bestWindow(partOfDay,tidePhase) for 3–7. |
| Copy / confidence / gates | CopyMessage: code/params/text; reasons add penalty/kind; gates add startsAt/endsAt/severity. selection is defined in §4. |

### Static API (scheduled build)

`buildPredictionRun({now,locations,fetchImpl,history,previousRuns,preferences}) → {today,tomorrow}` fetches/normalizes once, scores both horizons identically and computes comparison. Retain the signature; internal replay injects normalized fixtures through source adapters. Today slots stop at local 21:00/date boundary; no extension into tomorrow. Tomorrow is 05:00–21:00. After 21:00 today has no remaining candidate and points to tomorrow through `recommendedHorizon`; no fabricated open window. One exported 15:00 cutoff chooses recommended horizon.

Precompute Best anywhere, each active location × mode, and regional species focus. Do **not** serialize every location × focus Recommendation. Shared `selectRecommendation(run, scope, preferences, previousSelection)` materializes those views from stored per-species/window predictions; it is engine selection, not UI scoring. Same selector in Node/browser/Capacitor; UI never recalculates factors, suitability or verdicts. Store precomputed verdicts/caps and candidate links sufficient for the selector. Timeline top species is display-only.

Budget (test-enforced actual gzip bytes): **today.json ≤250 KiB**, tomorrow.json ≤250 KiB, index.json ≤10 KiB. L3 factor rows live in lazy `details/<runId>/<locationId>-<mode>.json`, ≤100 KiB gzip each, referenced from core predictions; keep summary effects/reasons and compact species windows in core. Lazy details failing never erase the core recommendation. Pin by run ID/hash to avoid mixing builds, retain old-run details for 7 days, and cache already loaded details offline. Load only the selected horizon initially. Do not multiply complete views or full factor arrays to meet convenience requirements.

Scheduled generation runs scripts/generate-v5.mjs after scripts/generate.mjs in the existing Pages workflow (Node 22/no dependencies), reads both deployed horizons through SITE_URL and writes site/api/v5/today.json, tomorrow.json, index.json and details/<runId>/<locationId>-<mode>.json after one builder call; archives §8 in the same cycle. Source failures produce partial runs. Fatal contract/build failure preserves the validated deployed same-target-date last-valid run, original generatedAt/validity and run ID, adding attempt metadata; never refresh age or relabel yesterday as today. If no valid matching target-date run exists, fail generation rather than publish invalid output. Comparison and clock-dependent text use copy.js `(run,now)`; window countdowns/status never remain frozen at generation. UI calls shared formatting/selector APIs only.

### Persistence and draft Supabase migration

### Launch persistence: existing GitHub release assets

Use **weekly archival releases in this existing repo**, tagged `v5-history-YYYY-Www`, outside Pages/main data files; no database/new service. Each scheduled build produces one immutable `v5-build-<UTC>-<workflowRunId>-<attempt>.tar.gz` asset. Weekly grouping stays below GitHub's [1,000-assets-per-release limit](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) at the current 48 builds/day. No upload/remote change is performed by this documentation task; workflow integration must use the existing authorized publishing boundary.

Bundle format:

- `manifest.json`: archiveSchemaVersion, build ID/attempt/time, status, code/model/params/history/catalog hashes, referenced model assets, today/tomorrow run IDs, prior selection IDs, file SHA-256 and sizes, archive errors.
- `inputs.ndjson`: one normalized provider/station/kind/interval record per distinct source, including missing/error results, issued/observed/fetched times and units; shared by both horizons. Preserve exactly what the engine used, not raw duplicate provider responses. Duplicate records hash-reference the first copy **within that build**; never reduce 48 different inputs to one daily sample.
- `runs.ndjson`: one immutable compact run per horizon: ID, versions/hashes, target date, generation/validity/status, source links, every location × mode × species × window suitability/verdict/eligibility/history/confidence/caps, compact slot scores, recommendation IDs/drivers/windows/ties/selection and scope links. Omit repeated display strings/L3 arrays; retained inputs + immutable model/code/history/catalog reconstruct them. Fatal carry-forward references the existing run ID; attempt remains distinct, not a new prediction.

Publish model-version full MODEL_PARAMS, threshold sheet, repaired history, catalogs and the exact engine/copy/adapter code snapshot once as immutable hash-named reference assets and retain as long as referenced. Upload is idempotent by asset name/hash: retry only a failed upload, never overwrite conflicting content. Verify download/hash before marking a build archived. Upload failure records a pending build artifact and fails archive acceptance; never silently drop a run while reporting persistence success. When archive integration is enabled, make verified archive persistence a prerequisite to replacing the published V5 run; root-report generation is unchanged.

Retention: 400 days of build bundles, plus pinned launch hindcast and any model/input/run assets referenced by outcomes. Older unreferenced bundles become retention candidates under an explicitly authorized retention policy; no destructive cleanup in A4. Budget: ≤256 KiB compressed per build (both horizons/input bundle), ≤12 MiB/day at 48 cycles, **6 GiB rolling archive including reference assets**; full-year worst-case build bundles ≈4.3 GiB. A4 measures real fixtures; budget overflow fails for compacting/review, never subsampling builds or deleting pinned evidence. Live payload budgets remain separate. Archives keep all scheduled builds, including changed predictions within a day; this addresses L5 without creating SQL rows at each half-hour.

### Draft SQL and future outcomes

Write one unapplied migration at supabase/migrations/20261005000000_v5_schema.sql. Tables: model_versions, locations, prediction_runs, species_predictions, recommendations, catch_outcomes and catch_outcome_species. Use UUID IDs for runs/projections/outcomes, text catalog/version keys, created_at, foreign keys and query/uniqueness indexes. Many recommendations per run; projections unique by run/place/mode/species/window or scope/focus/window. `model_versions` stores full MODEL_PARAMS and all source/code hashes; immutable prediction_runs store the canonical run/provenance once, with species_predictions and recommendations as derived projections. No redundant raw-forecast table. Future catch_outcomes records actual start/end/location/mode, nullable target_species_id (including a target not caught), displayed prediction_run_id/recommendation_id, selection snapshot and reported_via. Child `catch_outcome_species(outcome_id,species_id,kept,released)` supports multiple caught species with nonnegative counts; zero-catch trip has zero children, not an invented species. Catch totals must agree with caught flag; quantity lives in children. Constraints keep linked IDs in the same run/place/mode, and any target prediction link matches target_species_id. Missing IDs remain null with an unmatched reason. Outcome logging is selected behavior (often after GO); it cannot be treated as an unbiased catch sample.

Direct displayed recommendation links are authoritative. For an offline unlinked trip, choose latest run generated ≤actual start with matching local target date/validity and place/mode; match overlapping recommendation/target-species window by greatest overlap, then earlier start and ID. Never use a future run; keep unmatched links null and preserve reason. Detailed as-of implementation waits for a logging UI. Enable RLS with no anonymous write policies; no live project, migration application or outcome capture in this phase.

### UI implementation — phase B

Render validated runs using shared selectors/clock formatters; no UI scoring, ranking, window/backup selection, factor classification, shrinkage or invented copy. Mode is inside spot scope or a Spots/Species filter, never a tab/default filter. Best anywhere defaults until a picker-chosen spot persists; other scope changes, focus and horizon override are session-only. Last mode, favourites and card expansion use guarded localStorage. The overall-better line appears only for a full verdict step. Focus is labelled everywhere, has overall.verdict/focusCapped, and cannot defeat safety SKIP. Driver first; tag known Rare targets.

Use manifest scope ./ and standalone display. Version app-shell cache (cache-first); runs stale-while-revalidate with last-valid offline responses; external sources network-first with valid last-good responses. Never cache error/invalid responses; preserve source age. Lazy details are pinned to run ID/hash and cached after loading. Refresh after showing last-good run. Product journeys/layout begin after phase A contracts and protected product text are reconciled.

### Implementation steps and acceptance

Shared `engine/params.js` exports MODEL_PARAMS; contracts/copy/history/sources/astro/factors/model/run keep their existing responsibilities. The following replaces the earlier A1–A7 split:

| Step / status now | Work | Acceptance criteria |
|---|---|---|
| 0 — **in progress (Luna only)** | Catch-definition repair, regenerate history, threshold sheet. | Exact individual A/B1/B2 rule; composite joins/proxy exclusion; alias union; integer counts/unique n; QA totals/provenance; sheet has §2 columns/coverage. No scoring acceptance from legacy rates. Respect Luna's ownership of the builder, history artifact, data QA and threshold sheet. |
| A1 — **unblocked** | contracts.js, copy.js, history.js interface and params.js shape. | Stable run/message/observation/eligibility shapes; unknown optional keys/new model version accepted; unsupported schema major rejected; approved copy fixtures and `(run,now)` midnight/elapsed tests. Repaired empirical values await step 0. |
| A2 — **unblocked** | sources.js, adapters/cache, normalized recorder design and archive-source inventory. | Independent source failures; SECOORA fallback; GMT/DST; waveHeight browser/Node/coverage/issuance evidence or explicit MAYBE fallback; real hindcast station/field inventory. No claim that current buoy forecasts tomorrow. |
| A3 — **blocked on step 0 + A1/A2** | astro.js, history math, factors.js, model.js, reviewed MODEL_PARAMS. | Exact shrinkage/relative timing; no prevalence double count; per-mode realistic GO reachability/coverage passes or owner exception; eligibility/driver windows/caps/confidence/backups/ties/date-prior/selectors deterministic. Floor remains conditional until coverage. GO threshold provisional until A5. |
| A4 — **scaffolding unblocked; prediction integration waits for A3** | run.js, generate-v5.mjs, static API/details, scheduled archive integration. | One builder/two horizons; payload/detail/archive budgets; same-date priors and age-preserving carry-forward; each build's exact inputs and both immutable run projections restored/hash-verified; recorded inputs can start before threshold acceptance. Remote activation follows existing approval boundary. |
| A5 — **blocked on A3/A4 and real archive inventory** | test-v5.mjs, generated checks, full-year hindcast + later recorded replay. | All §3 annual/month/spot denominators and GO gates; ≥80% source coverage each month; parameter iteration/version record; no synthetic/accuracy claim; the five existing logic/app/catch/calculations/validator suites plus generated-output checks pass. Finalize GO threshold and rerun all gates; archive/size/copy/compatibility regressions. |
| A6 — **schema drafting unblocked; final validation waits for contracts** | One unapplied migration. | Full MODEL_PARAMS versions, canonical runs and projections; target_species_id + multi-catch children; displayed recommendation IDs/constraints/RLS; local review/parse only, no live action. |
| B — **blocked on A acceptance and product-text reconciliation** | app/UI/styles/service worker. | Selector/clock formatter usage; driver first/Rare tags; product copy reconciled to approvals, hero layout not invented model values; mobile/accessibility/offline checks. Product acceptance stays with Chris. |

### Tests (CI-gated)

`scripts/test-v5.mjs`: Node 22, deterministic fixtures, frozen now, injected fetchImpl; offline tests never fetch live or mutate production. Required coverage:

- Builder QA: individual A plus individually reported B1/B2, F_BY_P=8 B1/B2, group-A exclusion, composite interview joins/proxy exclusion, alias union, TRIP.CATCH disagreement, integer counts, missing versus zero. Step 0 owns builder/artifact tests; V5 consumes their validated contract.
- History/params: exact §2 worked arithmetic, Dec/Jan neighbors, all-zero/incomplete curves, timing-only normalization, no county/absolute-rate cap, n=30/80 boundaries and penalties, Kish QA-only, approved bands and integer history copy; one MODEL_PARAMS/full immutable version/hash.
- Model: factor edges/weights/renormalization and weighted helps/hurts; water/relative-season caps; modes/structure/eligibility/bycatch; per-species driver windows, aggregation, 60–150-minute bounds, no overlap per species, midnight/DST/no today extension; focus/driver ordering/Rare tags and capped reasons.
- Verdicts: threshold independent of Great fit; forecast issuance/full-window coverage, checked alerts, today observation age versus tomorrow forecast intervals/issuance; no tomorrow buoy substitution; safety SKIP dominates confidence/focus/caps; Moderate GO qualifier names only nonblocking live gaps.
- Selection: 7-mi opposite-water backup order, later/same-water/anywhere fallback, real backup verdict and no below-MAYBE backup; 5-point non-transitive ties, favourite/target/catalog and separate Spots order; same-target-date prior at midnight, held/switched provenance, explicit client preferences/displayed IDs.
- Adapters: independent failures, invalid payload HTTP 200, SECOORA/NDBC fallback freshness, units/sentinels/duration parsing, tide GMT/DST, waves versus water temperature; browser/Node marine forecast evidence belongs to A2, not a synthetic assertion.
- Astro: Flagler sunrise/sunset 2026-06-21 and 2026-12-21 within 2 minutes of a retained USNO reference; full/new moon within one day and transit within 15 minutes of retained published reference.
- Contracts/copy: all required fields/enums, unknown optional extension, unfamiliar modelVersion/paramsHash accepted, unsupported schema major rejected; time-relative copy at midnight/open/ended/stale boundaries, native selector parity; outlook restrictions and seven days.
- Generator/archive: one builder/two horizons, degraded sources, same-date carry-forward with original age/ID, failure without matching prior, run-pinned details; real gzip budgets, exact inputs/model assets and projections restored/hash-verified, idempotent retries/pending failures and archive-before-publish boundary.
- Hindcast: full-year real-data coverage/denominators and annual/month/location×mode gates below; parameter iterations versioned. Synthetic boundary fixtures test reachability/math only. Later recorded replay uses ≥60 dates spanning ≥3 months and supplements the launch gate.

Add warn-level schema/existence/<90-minute freshness checks to scripts/test-generated-output.mjs. Run the five existing logic/app/catch/calculations/validator suites, generated-output checks and test-v5.mjs. Migration is parsed in throwaway Postgres if available, otherwise reviewed explicitly as unexecuted SQL; never apply it remotely.

### Archiving/hindcast acceptance gate

**Coverage prerequisite:** sheet lists realistic targets for each active location × mode × month after mode/catalog/structure filters. Each mode must demonstrate GO on at least one ungated day using plausible measured-condition ranges and the proposed parameters. A synthetic boundary fixture may prove reachability, never frequency. If any mode has no realistic target in ≥6 months, or cannot reach GO at all, A3 parameter acceptance blocks: correct mapping/data defects first, then seek an explicit owner floor/coverage exception if needed. Do not retain .05 or quietly lower it before this check passes.

**Launch gate:** a complete calendar-year hindcast from real archived observations, initially investigate 2025. Preserve source manifests/checksums and frozen now; inject normalized input fixtures, no live fetch during replay. Use consistent dawn and evening build instants (06:00 and 19:00 New York); the primary daily statistic is the 06:00 today recommendation, with tomorrow/evening reported separately to avoid counting 48 builds as 48 independent days.

| Input | Hindcast source and treatment |
|---|---|
| Waves/water temperature | [NDBC annual archives](https://www.ndbc.noaa.gov/historical_data.shtml), 41117; verify WVHT/period/WTMP units, sentinel values and year coverage. |
| Wind/gust/direction/pressure | NDBC coastal C-MAN SAUF1 candidate; A2/A5 verify station-year fields and coverage, then freeze station mapping. If deficient, use documented nearby NOAA/NWS observing-station archives, not invented values. |
| Weather/rain/thunder | Archived NWS ASOS observations via NOAA [NCEI GHCNh](https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly); verify station IDs/fields. Observed precipitation occurrence maps to a labelled perfect-observation rain proxy (0/100), not a recovered PoP forecast. Thunder/weather missing remains unavailable. |
| Tide | [CO-OPS API](https://api.tidesandcurrents.noaa.gov/api/dev) historical-date predictions for catalog stations, GMT/MLLW/hilo, padded neighboring days; astro computed from date/coordinates. |

Observations substituted for target-slot forecasts are explicitly `inputBasis: hindcast-perfect-observation`; they are never passed off as NWS forecasts. Interpolate only bracketing valid observations ≤3 h apart; no long-gap filling, fabricated seasons or repeating one day. Missing sources stay missing. Require source-complete days on ≥80% of dates in each month before frequency acceptance; report availability, excluded/incomplete and safety-gated counts by month/mode/spot. An unavailable full-year source set blocks the gate rather than becoming a synthetic pass.

The historical-alert state is **assumed checked/none** for this scenario, labelled in the manifest, not a recovered fact. Retain observed wind/wave/thunder safety gates. A dedicated hindcast input path marks future observations as perfect forecasts, never relaxes tomorrow's production forecast gate. Assumed-clear warnings and perfect forecasts make this a frequency sensitivity scenario, not evidence of operational safety or forecast skill.

Owner acceptance: Best anywhere GO 15–40% of source-complete ungated daily recommendations over the full year; no month's corresponding GO share >70%; each active location × mode GO ≥3% of its own source-complete ungated days, or explicit owner sign-off. Report every denominator (zero is a failure, not 0%); report morning/tomorrow/evening separately. Tune **GO suitability threshold only** for frequency, with a new model version and rerun; floor changes are for coverage and require owner decision. Synthetic fixtures validate math/generator only. This gate cannot establish catch accuracy, probabilities, station-level MRIP representativeness, forecast skill or safety.

Once ≥60 distinct recorded dates spanning ≥3 months exist, rerun the same engine against actually archived inputs and report live/replayed verdicts, gaps and model-version differences. This supplements, never replaces, the full-year launch gate.

### Definition of done

1. Step 0 repaired counts/aliases/proxy QA and frozen artifact/threshold sheet pass; no empirical scoring acceptance from legacy rates. Reviewed MODEL_PARAMS meets per-mode/month reachability before the .05 floor is promoted.
2. A1–A6 meet the acceptance table; node scripts/test-v5.mjs and existing test-logic.mjs, test-app.mjs, test-catch.mjs, test-calculations.mjs, test-validator.mjs all pass. Root/v1–v3 behaviour stays unchanged.
3. Existing generator followed by generate-v5.mjs writes valid today/tomorrow/index/details using one builder call. Independent source failures, real tomorrow waves or explicit MAYBE cap, and age-preserving fatal carry-forward are verified. Live/archive payload budgets pass; normalized inputs and both immutable horizon projections restore/hash-verify, with remote activation separately authorized.
4. Full-year real-observation hindcast meets ≥80% coverage per month, Best anywhere GO 15–40% of complete ungated days, no month >70%, and every active location×mode ≥3% or explicit owner sign-off. Publish all denominators/assumptions/model versions. Neither synthetic replay nor ≥60 recorded dates replaces this gate; no catch accuracy or safety claim.
5. Unapplied migration has full model params, canonical runs/projections, targeted and multi-species outcomes, displayed recommendation identity, link constraints and RLS. Parsing/review result states its limitations; no live database action.
6. Before B, reconcile protected product conflicts logged in ADR §10. Then /v5/ Today/Spots/Species/Plan works for each active location at 375 px and desktop, light/dark, accessible, no console errors, and offline with the last-valid run and loaded details. Shared selector/clock copy passes; README Layout/V5 section updated.
7. Tests are evidence, not acceptance. Chris retains product acceptance and decisions on measured floor/coverage/hindcast exceptions; release/archive activation stays within explicit external-action authorization.
