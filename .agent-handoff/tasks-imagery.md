# Codex task — licensed imagery sourcing (research + download only)

Working dir /Users/christiannunez/flagler-fishing-ios. Write ONLY to `site/v5/proto/img/` and `site/v5/proto/img/CREDITS.json`. Do not edit code, do not build, do not run xcodebuild/simulator, do not commit, do not invoke Claude. Another agent is editing proto.js/css concurrently — do not touch them.

Needed (see .agent-handoff/redesign.md and concept.webp for style):
1. Fish images for every species id in site/v5/species.js (`SPECIES`), ideally side-view illustrations or clean photos on plain/transparent background, consistent look.
2. One photo per active spot in site/v5/spots.js (`ACTIVE_SPOTS`) — the actual place where possible (pier, inlet, bridge, beach); otherwise a representative NE Florida coast scene, flagged `"representative": true`.
3. One hero photo: a fishing pier at sunrise/sunset (Flagler Beach Pier preferred).

License rules (hard): only Public Domain, CC0, CC BY, CC BY-SA (any version). Verify the license on the file's own page (e.g. Wikimedia Commons file page, NOAA/USFWS/NPS page credit). Reject: anything "all rights reserved", NC or ND licenses, unclear provenance, FWC fish illustrations by Diane Rome Peebles (copyrighted), stock sites with custom licenses, AI images of unknown source. US federal works are PD only when the credit is a federal employee/agency (check the credit line; contractor/state art is not automatically PD).
Preferred sources: Wikimedia Commons (check each file's license block), NOAA Fisheries / NOAA Photo Library, USFWS National Digital Library, NPS.

Processing: download with curl into a scratch dir first; convert/resize with `sips` (macOS) to WebP or JPEG — fish ≤ 900 px wide, spots ≤ 1200 px wide, hero ≤ 1600 px wide, each ≤ 200 KB (hero ≤ 350 KB). Keep originals out of the repo. Filenames: `fish/<speciesId>.webp|jpg`, `spots/<spotId>.jpg`, `hero.jpg`.

CREDITS.json: array of { file, subject, title, author, source_url, license, license_url, modified: "resized/cropped/converted", representative?: bool }. Every file must have an entry.

Report (append to .agent-handoff/codex-results.md, section "Imagery"): table of what was found, what is missing and why, total size. Do not invent licenses — if unsure, leave it out and list it as missing.


## UPDATE 2026-10-10 — owner now allows generated images (supersedes the stock-only rule above)
State: a first pass (cancelled) already saved 23 verified-license files under site/v5/proto/img/ (hero.jpg, fish/*.jpg, spots/*) with CREDITS.json. Keep them unless replaced below; never delete a credited file without removing its CREDITS entry.
Use the built-in `image_gen` tool (imagegen skill, default mode; NOT the CLI fallback, no API key).
1. Fish: generate ONE consistent set for every species in SPECIES — photorealistic-illustration style, exact side view facing left, transparent background, soft studio lighting, matching the concept's fish row. Use the existing PD/CC reference image for that species (when present) as the reference input so anatomy, fin shape, colour and markings are correct (e.g. redfish tail spot, sheepshead bars, pompano yellow, black drum barbels). Save as fish/<id>.webp (transparent). Keep the stock file renamed fish/ref/<id>.jpg for reference only (not shipped in UI). Species accuracy matters (anglers use it to identify fish): note any species you are unsure about.
2. Spots: real licensed photos stay preferred for named real places. For spots without a verified photo, generate a representative scene of that spot TYPE (pier / inlet jetty / bridge / beach / ICW dock) in NE Florida light — do not add recognisable signage or landmarks that would falsely claim to be the specific place. Mark `generated: true, representative: true` in CREDITS.json.
3. Hero: keep the licensed hero if good (sunrise/sunset pier, wide, room for overlay text at top-left and bottom); otherwise generate one and mark it generated.
4. Optional small extras only if needed by the redesign: Log empty-state illustration (simple, accent cyan on navy, transparent).
CREDITS.json for generated files: { file, subject, generated: true, tool: "OpenAI image_gen", prompt_summary, reference_file?, representative? }.
Same size budgets as above. Report in codex-results.md "Imagery" section.
