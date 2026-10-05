// Species guide for the v5 prediction engine (St. Augustine → Flagler shore fishing).
//
// `mrip` lists NOAA MRIP intercept common names summed for this species in
// data/first-coast-history.json (built by scripts/build_first_coast_history.py from
// First Coast shore intercepts: `ocean` bucket for surf/pier, `inland` for inshore).
//
// Preferences are general angling knowledge for NE Florida, not measured local
// relationships; they are heuristic inputs and are tuned later against outcomes.
//   modes    fishing modes where the species is a realistic target: "surf" | "pier" | "inshore"
//   waterF   [min, idealLow, idealHigh, max] water temperature (°F). Outside min/max ≈ absent.
//   tide     "incoming" | "outgoing" | "moving" (either direction, as long as it moves) | "any"
//   light    "lowlight" (dawn/dusk best) | "day" (bright sun fine) | "any"
//   surf     ocean modes only: "calm" | "moderate" | "rough" (likes stirred-up water)
//   needsStructure  only scored where the location has hard structure
//            (pier, jetty, bridge, dock, seawall, rocks), whatever the mode.
//   bycatch  counts toward "will I catch something" but is never suggested as a target.
//   setup    default bait/lures/rig/where; `byMode` overrides any of those per mode.
//
// Regulations change; the app links to FWC instead of repeating size or bag limits.

export const SPECIES = [
  {
    id: "whiting", name: "Whiting", alt: "Southern / Gulf kingfish",
    modes: ["surf", "pier"],
    mrip: ["KINGFISH GENUS", "GULF KINGFISH", "SOUTHERN KINGFISH", "NORTHERN KINGFISH"],
    waterF: [55, 62, 78, 86], tide: "moving", light: "any", surf: "moderate",
    setup: {
      where: "First trough just past the shore break; often within 20–40 ft of the sand.",
      bait: ["Fresh shrimp (small pieces)", "Sand fleas (mole crabs)", "Fishbites — Bloodworm or Shrimp"],
      lures: [],
      rig: "Double-drop (hi-lo) rig, #4–#1 circle or kahle hooks, 2–3 oz pyramid or sputnik sinker.",
    },
    tip: "Don't cast far. Keep baits small and fresh; whiting peck, so a light rod tip helps.",
  },
  {
    id: "pompano", name: "Florida pompano",
    modes: ["surf", "pier"],
    mrip: ["FLORIDA POMPANO"],
    waterF: [64, 68, 80, 85], tide: "incoming", light: "day", surf: "calm",
    setup: {
      where: "Troughs and cuts near the shore break, especially where sand fleas are thick.",
      bait: ["Sand fleas (best — dig them at the waterline)", "Fresh shrimp", "Fishbites — Sand Flea or Crab, orange/pink"],
      lures: ["Pompano jig (yellow, pink or chartreuse), bounced along the bottom"],
      rig: "Pompano rig with two floats and #1–1/0 circle hooks, 3–4 oz pyramid sinker; 20–30 lb fluoro leader.",
    },
    tip: "Best on clean, small surf with clear water and the first half of the rising tide.",
  },
  {
    id: "bluefish", name: "Bluefish",
    modes: ["surf", "pier", "inshore"],
    mrip: ["BLUEFISH"],
    waterF: [54, 60, 72, 78], tide: "moving", light: "lowlight", surf: "rough",
    setup: {
      where: "Anywhere bait is being pushed; look for diving birds and nervous mullet.",
      bait: ["Cut mullet", "Finger mullet (live or dead)", "Cut menhaden (pogy)"],
      lures: ["Silver spoon (Kastmaster / Hopkins 1–2 oz)", "Gotcha plug", "Metal jig"],
      rig: "Fishfinder or single-drop rig with a short wire or 50 lb leader and 2/0–4/0 hook.",
    },
    byMode: { inshore: { where: "Inlet mouths and bridge shadow lines on the outgoing tide." } },
    tip: "Teeth cut mono — use a bite leader. Blitzes are short; keep a spoon rod ready.",
  },
  {
    id: "spanish", name: "Spanish mackerel",
    modes: ["pier", "surf"],
    mrip: ["SPANISH MACKEREL"],
    waterF: [68, 72, 82, 86], tide: "incoming", light: "lowlight", surf: "calm",
    setup: {
      where: "Clean green water off the end of the pier or just beyond the outer bar.",
      bait: ["Live or dead glass minnows", "Small live shiners"],
      lures: ["Gotcha plug (fast retrieve)", "Clark spoon", "Small silver spoon"],
      rig: "Light 20–30 lb leader or short #4 wire; long-shank hook for bait.",
    },
    tip: "Best from the pier on calm, clear mornings. Retrieve fast — slow lures get ignored.",
  },
  {
    id: "jack", name: "Crevalle jack",
    modes: ["surf", "pier", "inshore"],
    mrip: ["CREVALLE JACK"],
    waterF: [68, 74, 86, 90], tide: "moving", light: "lowlight", surf: "moderate",
    setup: {
      where: "Following mullet schools during the fall mullet run.",
      bait: ["Live finger mullet", "Cut mullet"],
      lures: ["Topwater popper", "Heavy silver spoon", "Bucktail jig"],
      rig: "40 lb leader, 3/0–5/0 hook; heavier rod — jacks pull hard.",
    },
    tip: "Watch for mullet schools getting busted; cast ahead of the commotion.",
  },
  {
    id: "redfish", name: "Redfish", alt: "Red drum",
    modes: ["inshore", "surf", "pier"],
    mrip: ["RED DRUM"],
    waterF: [58, 65, 80, 88], tide: "outgoing", light: "lowlight", surf: "moderate",
    setup: {
      where: "Oyster bars, dock pilings and creek mouths on the falling tide.",
      bait: ["Live shrimp", "Mud minnows", "Cut mullet or blue crab"],
      lures: ["Paddle-tail soft plastic on a 1/8–1/4 oz jighead", "Gold weedless spoon", "Shrimp imitation under a popping cork"],
      rig: "Popping cork or Carolina rig, 20–30 lb fluoro leader, 1/0–3/0 circle hook.",
    },
    byMode: {
      surf: {
        where: "Deeper troughs and cuts; big 'bull' reds cruise the beach in fall.",
        bait: ["Cut mullet (head or chunk)", "Half blue crab", "Large fresh shrimp"],
        lures: [],
        rig: "Fishfinder rig, 4–6 oz pyramid, 40–60 lb leader, 6/0–8/0 circle hook. Heavy surf rod.",
      },
    },
    tip: "Inshore: fish moving water near structure. Fall surf bulls are over the slot — check FWC rules.",
  },
  {
    id: "trout", name: "Spotted seatrout",
    modes: ["inshore"],
    mrip: ["SPOTTED SEATROUT", "SEATROUT GENUS"],
    waterF: [55, 62, 80, 88], tide: "moving", light: "lowlight",
    setup: {
      where: "Grass edges, deeper holes and creek bends; early mornings on moving water.",
      bait: ["Live shrimp under a cork", "Live finger mullet"],
      lures: ["Soft-plastic shrimp or paddle tail", "Topwater walk-the-dog plug at first light", "Suspending twitchbait"],
      rig: "Popping cork with 2–3 ft of 20 lb fluoro and a 1/0 circle hook, or a light jighead.",
    },
    tip: "Topwater at dawn; switch to a slow-sinking plastic once the sun is up.",
  },
  {
    id: "flounder", name: "Flounder",
    modes: ["inshore"],
    mrip: ["SOUTHERN FLOUNDER", "GULF FLOUNDER", "SUMMER FLOUNDER", "PARALICHTHYS GENUS", "LEFTEYE FLOUNDER GENUS"],
    waterF: [58, 64, 80, 86], tide: "outgoing", light: "any",
    setup: {
      where: "Sandy edges by docks, inlet sandbars and creek mouths where bait washes out.",
      bait: ["Mud minnows", "Finger mullet", "Live shrimp"],
      lures: ["Soft-plastic paddle tail on a jighead, dragged slowly along the bottom"],
      rig: "Carolina rig with a 1/2 oz egg sinker, 20 lb leader, 1/0–2/0 kahle hook.",
    },
    tip: "Give a flounder a few seconds to turn the bait before setting the hook.",
  },
  {
    id: "blackdrum", name: "Black drum",
    modes: ["inshore", "pier", "surf"],
    mrip: ["BLACK DRUM"],
    waterF: [52, 58, 74, 84], tide: "moving", light: "any", surf: "moderate",
    setup: {
      where: "Docks, bridge pilings, oyster bars and the deeper sloughs.",
      bait: ["Fresh shrimp", "Blue crab chunks", "Sand fleas or clams"],
      lures: [],
      rig: "Fishfinder or knocker rig, 1/0–3/0 circle hook, enough weight to hold bottom.",
    },
    tip: "A slow, steady bite — let the rod load before reeling.",
  },
  {
    id: "sheepshead", name: "Sheepshead",
    modes: ["pier", "inshore", "surf"], needsStructure: true,
    mrip: ["SHEEPSHEAD"],
    waterF: [52, 58, 70, 78], tide: "moving", light: "day", surf: "calm",
    setup: {
      where: "Tight to pilings, bridge fenders, docks and rocks.",
      bait: ["Fiddler crabs", "Sand fleas", "Barnacles or oysters scraped from pilings"],
      lures: [],
      rig: "Short leader, 1–2 oz egg sinker or knocker rig, small strong #1–1/0 hook.",
    },
    tip: "They steal bait — set the hook at the first tap. Late winter is peak.",
  },
  {
    id: "mangrove", name: "Mangrove snapper", alt: "Gray snapper",
    modes: ["inshore", "pier"], needsStructure: true,
    mrip: ["GRAY SNAPPER"],
    waterF: [70, 76, 86, 90], tide: "moving", light: "lowlight",
    setup: {
      where: "Dock and bridge pilings, rock edges; they hold tight to structure.",
      bait: ["Live shrimp", "Small live pinfish or mud minnows", "Cut sardine"],
      lures: [],
      rig: "Light 15–20 lb fluoro leader, small #1–1/0 circle hook, just enough split shot.",
    },
    tip: "Line-shy: lighter leader gets more bites. Summer and early fall are best.",
  },
  {
    id: "croaker", name: "Atlantic croaker",
    modes: ["surf", "pier", "inshore"],
    mrip: ["ATLANTIC CROAKER"],
    waterF: [58, 64, 80, 86], tide: "moving", light: "lowlight", surf: "moderate",
    setup: {
      where: "Sandy troughs, pier and channel edges, often in schools.",
      bait: ["Fresh shrimp", "Fishbites — Bloodworm"],
      lures: [],
      rig: "Hi-lo rig, #4–#1 hooks, 2–3 oz sinker.",
    },
    tip: "Good fall fish; if you get one, keep the same spot.",
  },
  {
    id: "whitetrout", name: "Sand seatrout", alt: "White trout / weakfish",
    modes: ["inshore", "pier", "surf"],
    mrip: ["SAND SEATROUT", "WEAKFISH"],
    waterF: [55, 62, 80, 86], tide: "moving", light: "lowlight", surf: "moderate",
    setup: {
      where: "Deeper channel edges and holes, and around the pier at dusk.",
      bait: ["Fresh shrimp on the bottom", "Small cut bait"],
      lures: ["Small soft-plastic on a 1/4 oz jighead, bounced near bottom"],
      rig: "Hi-lo or single-drop rig, #2–1/0 hooks.",
    },
    tip: "Often in schools in deeper water — if you catch one, stay put.",
  },
  {
    id: "spot", name: "Spot",
    modes: ["surf", "pier", "inshore"],
    mrip: ["SPOT"],
    waterF: [55, 62, 78, 84], tide: "moving", light: "lowlight", surf: "moderate",
    setup: {
      where: "Sandy troughs, pier and channel edges; schools move through in fall.",
      bait: ["Fresh shrimp (small pieces)", "Fishbites — Bloodworm"],
      lures: [],
      rig: "Hi-lo rig, #6–#4 hooks, 1–3 oz sinker.",
    },
    tip: "Small mouths — keep hooks and baits small. Popular bait for bigger fish.",
  },
  {
    id: "seabass", name: "Black sea bass",
    modes: ["inshore", "pier"], needsStructure: true,
    mrip: ["BLACK SEA BASS"],
    waterF: [50, 56, 72, 80], tide: "moving", light: "any",
    setup: {
      where: "Rocks, jetties, bridge rubble and pilings; mostly small fish inshore.",
      bait: ["Cut squid", "Fresh shrimp", "Cut fish"],
      lures: ["Small bucktail or soft-plastic jig worked near bottom"],
      rig: "Dropper or hi-lo rig, #1–1/0 hooks, enough weight to hold near structure.",
    },
    tip: "Most inshore fish are under the size limit — check FWC rules before keeping one.",
  },
  {
    id: "spadefish", name: "Atlantic spadefish",
    modes: ["pier"], needsStructure: true,
    mrip: ["ATLANTIC SPADEFISH"],
    waterF: [70, 75, 86, 90], tide: "moving", light: "day", surf: "calm",
    setup: {
      where: "Schools around pier pilings in summer, often mid-water.",
      bait: ["Small pieces of clam", "Fresh shrimp", "Cannonball jellyfish pieces (local favourite)"],
      lures: [],
      rig: "Light leader, small #4–#2 hook, little or no weight near the pilings.",
    },
    tip: "Hard fighters for their size; small baits and light line get more bites.",
  },
  {
    id: "sharks-rays", name: "Sharks & rays", alt: "Blacktip, bonnethead, stingray",
    modes: ["surf", "pier", "inshore"],
    mrip: ["REQUIEM SHARK FAMILY", "BONNETHEAD", "HAMMERHEAD SHARK GENUS", "ATLANTIC SHARPNOSE SHARK", "STINGRAY GENUS", "STINGRAY FAMILY"],
    waterF: [62, 72, 88, 92], tide: "any", light: "any", surf: "moderate",
    bycatch: true,
    setup: { where: "Anywhere cut bait sits on the bottom.", bait: [], lures: [], rig: "" },
    tip: "Common bycatch on cut bait. Many sharks are protected — release quickly and check FWC rules; shuffle your feet for stingrays.",
  },
  {
    id: "panfish-misc", name: "Other small fish", alt: "Silver perch, pigfish, puffers, toadfish, searobins, ladyfish",
    modes: ["surf", "pier", "inshore"],
    mrip: ["SILVER PERCH", "PIGFISH", "PUFFER GENUS", "PUFFER FAMILY", "OYSTER TOADFISH", "SEAROBIN FAMILY", "SEAROBIN GENUS", "LADYFISH"],
    waterF: [58, 66, 86, 92], tide: "any", light: "any", surf: "moderate",
    bycatch: true,
    setup: { where: "Anywhere.", bait: [], lures: [], rig: "" },
    tip: "Frequent bycatch on shrimp. Puffers and toadfish bite hard — use pliers.",
  },
  {
    id: "catfish", name: "Sea catfish", alt: "Hardhead / gafftopsail",
    modes: ["surf", "pier", "inshore"],
    mrip: ["HARDHEAD CATFISH", "GAFFTOPSAIL CATFISH", "SEA CATFISH FAMILY"],
    waterF: [62, 70, 88, 92], tide: "any", light: "any", surf: "rough",
    bycatch: true,
    setup: { where: "Anywhere, especially murky water.", bait: [], lures: [], rig: "" },
    tip: "Common bycatch on shrimp. Spines are venomous — grip carefully or use pliers.",
  },
];

/** Setup for a species in a mode: defaults merged with that mode's overrides. */
export function setupFor(species, mode) {
  return { ...species.setup, ...(species.byMode?.[mode] ?? {}) };
}

// MRIP common names treated as bait or forage, never shown as targets.
export const MRIP_EXCLUDE = [
  "HERRING FAMILY", "ANCHOVY FAMILY", "SCALED SARDINE", "SPANISH SARDINE", "ATLANTIC THREAD HERRING",
  "BALLYHOO", "MULLET FAMILY", "MULLET GENUS", "WHITE MULLET", "STRIPED MULLET", "ROUND SCAD",
  "BIGEYE SCAD", "ATLANTIC MENHADEN", "MENHADEN GENUS", "PINFISH", "ATLANTIC BUMPER", "UNIDENTIFIED FISH",
];

export const FWC_REGS_URL = "https://myfwc.com/fishing/saltwater/recreational/";
