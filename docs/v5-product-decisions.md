# V5 hard product decisions

**Owner-approved 2026-10-05 (Chris): all six decisions and flag B approved; flags A and C go to the architecture owner (GPT-6.1 Sol) to set thresholds, with a 60+ day GO-frequency replay as an acceptance test.** Originally proposed as recommendations from the hard-product-decisions review (Claude Opus 5.5, High), 2026-10-05. Where this file and the Product spec in `docs/v5-spec.md` disagree, this file wins until the spec is reconciled.

Inputs: `docs/v5-spec.md` (Decisions, Product spec, Product requirements for the technical architecture, Open product questions), `site/v5/spots.js`, `site/v5/species.js`. This review does not rely on the data-QA pass that is still running.

Two facts shape most of the answers below:

1. **Suitability is a heuristic, not a measurement.** No catch outcomes have been logged. The history behind the season factor is MRIP intercept data: about 930 ocean-shore trips (mostly piers) and about 1,740 inland trips, across four counties, over 11 years. A single month holds 19–197 trips. A difference of a few points between two spots or two hours is below what the model can tell apart.
2. **The 11 active spots fall into three tight groups.** Straight-line distances from `spots.js`:
   - St. Augustine: Vilano Beach, Vilano Bridge, Bridge of Lions, Salt Run, St. Augustine Pier. All within 4.7 mi of each other.
   - Matanzas / Marineland / Bings Landing: within 6.5 mi.
   - Flagler: Beverly Beach, Flagler Pier, Flagler ICW. Within 2.8 mi.

   The closest pair from different groups is Bings Landing to Beverly Beach, 7.7 mi. The region is 32 mi end to end. Every spot except Matanzas Inlet has a spot on the other water type (ocean or inshore) within 1.8 mi. Matanzas Inlet offers both modes itself.

---

## 1. Primary navigation dimension

**Decision:** Accept *answer first, then scope*. Today answers for the current scope. Spot is the only scope that persists. Species is a temporary lens on top of it. Mode is never top-level: it is a control inside a spot, plus a filter in Spots and Species.

**Why:** The product promise is a decision in about 10 seconds, and that needs one answer on open, not a choice between three dimensions. Mode is a property of a spot (and of the gear you carry), not something people browse by. Species is how anglers *think*, but most sessions are "is it worth going", not "find me pompano". Making species primary would also put the thinnest per-species history at the centre of the app.

**Trade-off accepted:** An angler with a fixed target has to tap "Target this" every session, because species focus is session-only. That is deliberate: a target that stays set without the user noticing would quietly distort every later verdict.

**Spec consequence:**
- Navigation model, last line: drop "(See open question 1.)" and state the rule as decided.
- Add one rule: "Mode is never a tab, a header pill outside a spot scope, or a default filter."
- Persistence rules are in decision 4.

## 2. How backups are chosen, and what "nearby" means

**Decision:**
- **Nearby** = within **7 miles straight-line** of the primary spot. Export it as one constant, `NEARBY_MILES = 7`. With today's catalog this gives exactly the three groups above.
- **"Different mode" means different water: ocean (surf/pier) vs inshore.** Surf and pier at the same pier fail together (same wind, same surf, same water temperature), so pier is not a backup for surf.
- **Backup order:**
  1. The opposite water type at a nearby spot.
  2. A later window at the same spot and mode.
  3. The same water type at another nearby spot.
  4. Only if nothing above reaches MAYBE: the best option anywhere, with its area named ("Backup: Matanzas Inlet, Crescent Beach").
- A backup must be **MAYBE or better**. If none qualifies, the slot shows the existing *Next best option* (next window or tomorrow), not a weak backup.
- `other-species` is used only when a species focus is set.

**Why:** A backup exists for when the primary fails, and the usual local failure is wind or surf on the beach. The inshore spot a mile away survives that failure and needs no long drive. A later window at the same spot needs no new travel or gear, so it beats a farther spot on the same water. A distance radius is deterministic, explainable and testable. Travel time would need a routing source the product doesn't have.

**Trade-off accepted:**
- An inshore backup may need different bait and rig. The backup line names the species, so the gear is implied, and tapping it shows the full setup.
- 7 mi is a judgement, not a measurement. Bridge traffic in St. Augustine can make 4 mi feel like 20 minutes.

**Spec consequence:**
- Open question 2 → decided as above.
- **Model** section: the `backup` bullet ("differs in location **or** mode (prefer a different mode), else a later window") contradicts the Product spec and should be replaced with the order above.
- Requirement 5: add `backup.distanceMi` and keep `backup.kind`. `other-mode` is defined as the opposite water type. Rule: a backup is never below MAYBE.
- Copy: a backup outside the nearby radius always names its area.

## 3. GO when confidence is only Moderate

**Decision:**
- Allow GO at Moderate confidence **only when every safety-gate input is present**: a forecast no more than 6 h old, alerts checked, and (for surf and pier) waves from the buoy or its fallback. If any of those is missing, the verdict is capped at **MAYBE**, whatever the score. Copy: "Can't confirm the surf right now."
- When GO stands at Moderate, keep the same GO ring and add the amber qualifier line. Do **not** cap GO at confidence ≥ 75.
- Show the amber qualifier only for gaps in **today's live data**. Built-in limits of a spot (the tide station is far away, the inshore water temperature comes from the ocean buoy, thin history for that month) appear in the Confidence line and in "Why this confidence?", but never as the headline qualifier.

**Why:** A GO says it is safe and worthwhile to go. Without a current forecast or a wave reading, the engine cannot check the thunder, wind or surf gates, so it cannot honestly say GO.

A flat ≥ 75 cap would punish the wrong thing. Several spots lose points permanently, regardless of the day:
- Beverly Beach, Flagler Pier and Marineland use a tide station 16–26 mi away (−10).
- Inshore spots use the buoy for water temperature (−5).
- Thin months cost up to −15.

With a flat cap, GO would become rare at those spots for reasons that have nothing to do with today. And a qualifier that appears on every GO at a spot is noise that users learn to ignore.

**Trade-off accepted:**
- Two GOs at the same confidence number can look different: one has the amber line, the other doesn't because its gap is a built-in one.
- The ring does not distinguish a Moderate GO from a High one. Only the qualifier line does.

**Spec consequence:**
- GO/MAYBE/SKIP rules, **GO** row: the qualifier must name the missing input in plain words, taken from `confidenceReasons` ("Moderate confidence — no fresh wave reading"), never the generic "one input is missing". It appears only for live gaps.
- **Model** verdict rule: add "GO also requires forecast ≤ 6 h old, alerts checked, and (ocean modes) waves present; otherwise MAYBE."
- Requirement 14: `confidenceReasons[]` gains `kind: "live" | "structural"`.

## 4. Default scope: Best anywhere or home spot

**Decision:**
- **Best anywhere** is the default until the user picks a spot in the **spot picker**. After that, Today reopens on that spot.
- Only a choice made in the picker persists. A scope set by tapping Best bet, Backup, "Best for this fish", or by opening a shared link lasts for the session only.
- Drop the proposed "Your spot: …" second row from the screen area visible without scrolling.
- With a spot scope, show "Best overall today: …" only when the overall best is **at least one verdict step better** (for example GO vs MAYBE).

**Why:** Someone with a home spot wants the answer for *their* water. Someone with no history wants the strongest answer. An explicit choice in the picker separates the two without a settings screen.

A second row would cost about 40 px of the roughly 560 px budget for the visible screen, and it would make two answers compete. The "Best overall" line already prevents a hidden GO elsewhere. Firing it on a few-point difference would mostly report noise, because spots share the same buoy, forecast region and history.

**Trade-off accepted:**
- A home-spot user only hears about a better spot elsewhere when it is a full verdict step better. A slightly better spot 25 minutes away goes unmentioned.
- Best anywhere can still point a first-time user to the far end of the region. The Best bet card shows the area ("Flagler Beach"), so the distance is visible.

**Spec consequence:**
- Returning-user journey: "Remembers scope" becomes "Remembers the last spot chosen in the spot picker; other scope changes are session-only."
- Spot picker, *Selecting a spot* row: add the one-verdict-step threshold to the "Best overall" line.
- UI implementation notes, persisted state: "last scope" becomes "last picker-chosen spot".
- Open question 4 → decided, without the second row.

## 5. Does a species focus change the headline verdict?

**Decision:**
- **Yes.** With a focus set, the headline verdict is the verdict for that species, and it always carries the species: the ring caption "for pompano", the headline, the aria label, and any shared link with `species=`.
- When the overall verdict is at least one step better, one line sits under the headline: "Overall today: GO — whiting at Flagler Beach Pier."
- **Safety SKIPs ignore the focus.** A safety SKIP is the same with or without a focus.
- A focused species that people rarely catch locally that month (see flag A) is capped at **MAYBE**. Copy: "Conditions fit, but few local shore anglers catch pompano in December."
- Bycatch species get no "Target this" button.

**Why:** "Target this" that still shows the overall verdict would ignore the user's explicit intent, and a SKIP for something they didn't ask about is useless. A contradiction can only appear in one direction (the focus is worse than overall), because the overall verdict is the best across species. One clearly labelled line handles that case.

**Trade-off accepted:** On some days the app shows two verdicts. Labelling is the only defence, so the "for &lt;species&gt;" caption is required, not optional.

**Spec consequence:**
- "I want pompano" journey: add the ring caption, the "Overall today" line rule, and the cap for rarely-caught species.
- GO/MAYBE/SKIP rules, *Per-species vs overall*: add "Safety gates are never species-relative."
- Requirement 10: the species-focused recommendation also returns `overall.verdict` and a `focusCapped` reason.
- Targets card: the focus species is listed first.

## 6. Outlook labels for days 3–7

**Decision:**
- **Yes:** days 3–7 use **Promising / Mixed / Tough** in outline chips. GO / MAYBE / SKIP never appear after day 2.
- Outlook rows name **no spot and no minute-precise window**. Show the part of the day and the tide that drive it: "Morning · incoming tide". Tide and sun times are known exactly days ahead; wind and surf, which pick the spot, are not.
- "Best day this week" can land on an outlook day only if both day 1 and day 2 are SKIP. In that case it reads "Most promising outlook".

**Why:** Wind and surf forecasts lose most of their skill after about 48 h, and those are what separate GO from MAYBE. Using the GO word there would claim a precision the inputs don't have.

Naming a spot or a window like "6:40–8:25 AM" for day 5 would bring that false precision back through a side door. Comparing a real GO tomorrow with a day-5 outlook as equals would do the same.

**Trade-off accepted:**
- Three more words of vocabulary, used on the Plan tab only.
- An outlook row is less specific than the user might want.

**Spec consequence:**
- 7-day planner, *Rows* and *Days 3–7*: outlook rows show part of day + tide phase, with no spot.
- *Best day*: add the rule above.
- Requirement 12: for outlook days, `bestWindow` becomes `{partOfDay, tidePhase}` with no `locationId`.
- Day sheet for days 3–7: species likely in season and the tide/light reason only. No Use row and no windows.

---

## Other flags (material only)

### A. GO will fire almost every day as drafted (verdict semantics)

**Problem:** The headline verdict is GO if the top suitability is ≥ 70. "Top" means the best of about 11 target species across 14 spot-and-mode combinations and up to 4 windows each.

The season score is also normalised to each species' *own* best month. So any species in its peak month scores season = 1.0, even if only a few percent of trips catch it. Taking the maximum over that many heuristic scores pushes the verdict toward GO on ordinary days. That empties "worth fishing?" of meaning, and that answer is the product's core.

**Decision:**
- A species can drive GO only if it is a **realistic target**: it is in that spot's `targets` list, **and** its shrunk historical rate for the mode and month is at least **1 in 20 trips** (a starting value for Sol to tune).
- Other species can still appear in Targets, but they cannot produce GO by themselves.
- **Acceptance gate before launch:** replay the engine over at least 60 past or recorded days and report how often each verdict appears. If GO appears on more than about half of the days without a safety gate, raise the thresholds.

**Trade-off accepted:** GO becomes rarer. Some genuinely good days for less common species will read MAYBE.

**Spec consequence:**
- Model, *Recommendation*: add the realistic-target rule.
- Tests / Definition of done: add the verdict-distribution check. Data/QA runs it; Sol owns the thresholds.

### B. The "N in 10 local shore anglers" line overstates the evidence

**Problem:** MRIP counts **trips**, not anglers. The data covers four counties, including Duval and Nassau. The ocean data is mostly piers, yet the line is shown for surf mode too. Monthly slices are often 19–60 trips. "4 in 10 local shore anglers caught one in October" claims more than that: the wrong unit, too local, and too precise.

**Decision:**
- Change the copy to "About 4 in 10 Northeast Florida shore fishing trips caught one in October (2015–2025 surveys)."
- When the effective sample for the month is under 80 trips, replace the number with a band: **Common / Occasional / Rare in October surveys**, with the low-sample note.
- Never show "0 in 10". Show "Fewer than 1 in 10".
- Label the surf line "pier and beach surveys".

**Trade-off accepted:** The wording is longer and less punchy, and bands carry less information than a number.

**Spec consequence:**
- Decisions table, Headline row: update the example. This needs Chris's approval because it is in the owner-approved table.
- Copy guidelines: the Historical rate and Low sample rows.
- Species sheet, *Local history* row.
- Requirement 6: `historicalRate` gains `band` and `unit: "trips"`, and the `lowSample` threshold is 80.

### C. Spot ranking is finer than the model can resolve

**Problem:** The Spots rows ("Pompano 84" vs "Pompano 82"), the strict sort, and the Best anywhere pick all treat a few points as meaningful. Yet all spots share one buoy, nearly the same forecast, and history at county level. Because the run rebuilds every 30 minutes, the best bet will also flip between nearly identical spots, which breaks the "no flashing" promise to returning users and erodes trust.

**Decision:**
- Treat candidates as **tied** when they have the same verdict and are within **5 suitability points**.
- Break ties by: favourite → the species is in the spot's `targets` list → catalog order. The Spots tab sorts by verdict tier first, then within a tier by Near me distance, favourite, catalog order.
- **Stability rule:** keep the previous run's best bet unless the new best beats it by more than 5 points or by a verdict step.
- Keep the number on each row, but never let a sub-5-point difference change an order or a headline.

**Trade-off accepted:** Sometimes the app shows a spot that is "2 points worse" by the raw numbers.

**Spec consequence:**
- Spot picker, *Default sort*.
- Model, *Recommendation*: add tie and stability rules.
- Requirement 9: `rank` is per verdict tier, and add `tiedWith[]`.
- Requirement 15: the "similar" delta uses the same 5-point band.
