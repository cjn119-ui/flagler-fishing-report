// Fishing locations for the v5 prediction engine. Locations are data, not report
// sections: the engine scores every active location the same way, and the UI, API,
// Supabase `locations` table and future native app all read this catalog.
//
// Location fields
//   id, name, area, county   county = MRIP county name in data/first-coast-history.json
//   active                   false = cataloged but hidden (outside the current launch region)
//   modes                    fishing modes offered here: "surf" | "pier" | "inshore"
//   structure                "beach" | "pier" | "jetty" | "inlet" | "bridge" | "dock" | "seawall" | "rocks" | "creek"
//   lat, lon                 access point; used for NWS /points, sunrise/sunset and nearest-spot
//   tide, tideName, tideNote NOAA CO-OPS prediction station whose timing best matches the water
//                            fished. Inland/ICW stations are not used for beach spots.
//   tideSensitivity          "high" | "medium" | "low": how much moving water drives the bite here
//   windExposure             facingDeg = direction the shore faces (beach) or the most exposed fetch
//                            (inshore); the engine derives onshore (within ±67.5° of facing) and
//                            offshore (the opposite sector) winds from it.
//   buoy, cdip               NDBC buoy and the same CDIP buoy on SECOORA ERDDAP (browser-readable)
//   waterTemp                CO-OPS station with a water-temperature sensor, if one is close enough;
//                            otherwise the engine uses the buoy and lowers confidence for inshore.
//   access                   fee / parking / facilities, short phrases
//   targets                  species ids most worth suggesting here (the engine still scores all
//                            species valid for the mode; this list breaks ties and drives copy)
//   notes, tips              local knowledge; general guidance, verify on site
//
// Seasonality and historical results come from data/first-coast-history.json (by county
// and mode) and, later, from logged outcomes, so they are not repeated per location.

export const SPOTS = [
  // ---- St. Augustine -------------------------------------------------------
  {
    id: "vilano-beach", name: "Vilano Beach", area: "St. Augustine", county: "St. Johns", active: true,
    modes: ["surf"], structure: "beach", lat: 29.9200, lon: -81.2950,
    tide: "8720587", tideName: "St. Augustine Beach", tideNote: "Ocean timing from St. Augustine Beach, 5 mi south.",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free beach access", "Parking at the Vilano boardwalk lots"],
    targets: ["whiting", "pompano", "redfish", "bluefish"],
    notes: "Beach north of the St. Augustine inlet; the inlet end holds reds and drum on moving water.",
    tips: ["The inlet end is best on the outgoing tide."],
  },
  {
    id: "vilano-bridge", name: "Vilano Bridge fishing piers", area: "St. Augustine", county: "St. Johns", active: true,
    modes: ["inshore"], structure: "bridge", lat: 29.9140, lon: -81.3020,
    tide: "8720554", tideName: "Vilano Beach, Tolomato River",
    tideSensitivity: "high", windExposure: { facingDeg: 0 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free", "Small lot at the west end of the bridge"],
    targets: ["redfish", "blackdrum", "sheepshead", "mangrove", "flounder"],
    notes: "Old bridge spans kept as fishing piers over the Tolomato River near the inlet.",
    tips: ["Fish the pilings on moving water; slack tide is slow."],
  },
  {
    id: "bridge-of-lions", name: "Bridge of Lions & bayfront seawall", area: "St. Augustine", county: "St. Johns", active: true,
    modes: ["inshore"], structure: "seawall", lat: 29.8925, lon: -81.3090,
    tide: "8720576", tideName: "St. Augustine, city dock",
    tideSensitivity: "high", windExposure: { facingDeg: 90 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Paid downtown parking", "Restrooms and bait nearby"],
    targets: ["redfish", "blackdrum", "sheepshead", "mangrove", "trout"],
    notes: "Downtown Matanzas River seawall and bridge fenders; structure fish year-round.",
    tips: ["Sheepshead on the fenders in late winter.", "Watch boat traffic around the bridge."],
  },
  {
    id: "salt-run", name: "Salt Run (Anastasia State Park)", area: "St. Augustine", county: "St. Johns", active: true,
    modes: ["inshore"], structure: "creek", lat: 29.8790, lon: -81.2790,
    tide: "8720582", tideName: "State Road 312, Matanzas River", tideNote: "Nearest prediction station is across the river; Salt Run timing differs slightly.",
    tideSensitivity: "medium", windExposure: { facingDeg: 0 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["State park entry fee", "Kayak and shoreline access"],
    targets: ["flounder", "trout", "redfish", "blackdrum"],
    notes: "Calm, protected lagoon; good for wade and kayak fishing on lower winds.",
    tips: ["Best on the first half of the outgoing tide."],
  },
  {
    id: "staug-pier", name: "St. Augustine Beach Pier", area: "St. Augustine Beach", county: "St. Johns", active: true,
    modes: ["pier", "surf"], structure: "pier", lat: 29.8570, lon: -81.2640,
    tide: "8720587", tideName: "St. Augustine Beach",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Pier fee; ask at the gate whether it covers your saltwater license", "Parking, restrooms, bait shop"],
    targets: ["whiting", "pompano", "blackdrum", "spanish", "sheepshead"],
    notes: "Popular county pier with whiting, pompano, black drum and seasonal mackerel.",
    tips: ["Mackerel off the end on calm, clean mornings."],
  },
  // ---- Matanzas / Palm Coast ----------------------------------------------
  {
    id: "matanzas-inlet", name: "Matanzas Inlet", area: "Crescent Beach", county: "St. Johns", active: true,
    modes: ["inshore", "surf"], structure: "inlet", lat: 29.7070, lon: -81.2290,
    tide: "8720692", tideName: "Matanzas Inlet (A1A bridge)",
    tideSensitivity: "high", windExposure: { facingDeg: 90 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free parking at the A1A lots on both sides of the bridge"],
    targets: ["redfish", "flounder", "blackdrum", "bluefish", "trout"],
    notes: "Natural, unjettied inlet; fish both sides of the bridge and the beach ends.",
    tips: ["Inlet tide lags the ocean.", "Fish the last of the outgoing and first of the incoming."],
  },
  {
    id: "marineland", name: "Marineland / Washington Oaks", area: "Palm Coast", county: "Flagler", active: true,
    modes: ["surf"], structure: "rocks", lat: 29.6300, lon: -81.2050,
    tide: "8720587", tideName: "St. Augustine Beach", tideNote: "Ocean timing from St. Augustine Beach, 16 mi north.",
    tideSensitivity: "medium", windExposure: { facingDeg: 85 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Washington Oaks State Park fee (beach side)", "Limited roadside parking"],
    targets: ["pompano", "whiting", "sheepshead", "blackdrum"],
    notes: "Coquina rock outcrops hold sheepshead, drum and pompano.",
    tips: ["The rocks are slippery — fish from the sand edge."],
  },
  {
    id: "bings-landing", name: "Bings Landing", area: "Palm Coast", county: "Flagler", active: true,
    modes: ["inshore"], structure: "dock", lat: 29.6150, lon: -81.2050,
    tide: "8720757", tideName: "Bings Landing, Matanzas River",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free county park", "Fishing dock, boat ramp, restrooms"],
    targets: ["redfish", "trout", "blackdrum", "sheepshead", "flounder"],
    notes: "County park on the Matanzas River / ICW with a fishing dock.",
    tips: ["Dock pilings hold sheepshead and drum; fish the grass edges for trout."],
  },
  // ---- Flagler Beach ------------------------------------------------------
  {
    id: "beverly-beach", name: "Beverly Beach", area: "Flagler Beach", county: "Flagler", active: true,
    modes: ["surf"], structure: "beach", lat: 29.5170, lon: -81.1450,
    tide: "8721120", tideName: "Daytona Beach Shores (Sunglow Pier)", tideNote: "Ocean timing from Sunglow Pier, 26 mi south; Smith Creek is inland.",
    tideSensitivity: "medium", windExposure: { facingDeg: 75 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free beach walkovers along A1A"],
    targets: ["whiting", "pompano", "bluefish", "redfish"],
    notes: "Quiet stretch north of Flagler Beach with good troughs and easy access.",
    tips: ["Look for darker water in the trough at low tide."],
  },
  {
    id: "flagler-pier", name: "Flagler Beach Pier", area: "Flagler Beach", county: "Flagler", active: true,
    modes: ["pier", "surf"], structure: "pier", lat: 29.4810, lon: -81.1270,
    tide: "8721120", tideName: "Daytona Beach Shores (Sunglow Pier)", tideNote: "Ocean timing from Sunglow Pier, 24 mi south; Smith Creek is inland.",
    tideSensitivity: "medium", windExposure: { facingDeg: 70 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Pier fee; ask at the gate whether it covers your saltwater license", "Metered parking on A1A"],
    targets: ["whiting", "pompano", "blackdrum", "spanish", "bluefish"],
    notes: "Flagler's municipal pier. Whiting, pompano and drum; Spanish and kings off the end in season.",
    tips: ["Surf on either side of the pier fishes well for whiting and pompano."],
  },
  {
    id: "flagler-icw", name: "Flagler Beach ICW (Veterans Park)", area: "Flagler Beach", county: "Flagler", active: true,
    modes: ["inshore"], structure: "dock", lat: 29.4770, lon: -81.1335,
    tide: "8720833", tideName: "Smith Creek, Flagler Beach",
    tideSensitivity: "medium", windExposure: { facingDeg: 270 },
    buoy: "41117", cdip: "194", waterTemp: null,
    access: ["Free city park by the SR 100 bridge", "Fishing dock"],
    targets: ["redfish", "trout", "blackdrum", "mangrove", "flounder"],
    notes: "ICW shoreline and dock beside the SR 100 bridge.",
    tips: ["Bridge shade lines hold fish on sunny days."],
  },
  // ---- Cataloged, outside the launch region (hidden) ----------------------
  { id: "fort-clinch", name: "Fort Clinch Pier & Jetty", area: "Fernandina Beach", county: "Nassau", active: false,
    modes: ["pier", "inshore"], structure: "jetty", lat: 30.7000, lon: -81.4370, tide: "8720011", tideName: "St. Marys Entrance",
    tideSensitivity: "high", windExposure: { facingDeg: 45 }, buoy: "41112", cdip: "132", waterTemp: "8720218",
    access: [], targets: ["sheepshead", "blackdrum", "redfish"], notes: "Pier and rock jetty at the St. Marys inlet.", tips: [] },
  { id: "fernandina-main", name: "Main Beach", area: "Fernandina Beach", county: "Nassau", active: false,
    modes: ["surf"], structure: "beach", lat: 30.6705, lon: -81.4290, tide: "8720011", tideName: "St. Marys Entrance",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 }, buoy: "41112", cdip: "132", waterTemp: "8720218",
    access: [], targets: ["whiting", "pompano"], notes: "Wide, flat Amelia Island beach.", tips: [] },
  { id: "little-talbot", name: "Little Talbot Island", area: "Jacksonville", county: "Duval", active: false,
    modes: ["surf"], structure: "beach", lat: 30.4600, lon: -81.4040, tide: "8720194", tideName: "Little Talbot Island (ocean)",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 }, buoy: "41112", cdip: "132", waterTemp: "8720218",
    access: [], targets: ["whiting", "redfish"], notes: "Undeveloped state-park beach.", tips: [] },
  { id: "huguenot-jetties", name: "Huguenot Park / Mayport Jetties", area: "Jacksonville", county: "Duval", active: false,
    modes: ["inshore", "surf"], structure: "jetty", lat: 30.4050, lon: -81.4180, tide: "8720218", tideName: "Mayport (Bar Pilot Dock)",
    tideSensitivity: "high", windExposure: { facingDeg: 90 }, buoy: "41112", cdip: "132", waterTemp: "8720218",
    access: [], targets: ["redfish", "blackdrum", "sheepshead"], notes: "North jetty of the St. Johns River entrance.", tips: [] },
  { id: "jax-beach-pier", name: "Jacksonville Beach Pier", area: "Jacksonville Beach", county: "Duval", active: false,
    modes: ["pier"], structure: "pier", lat: 30.2835, lon: -81.3880, tide: "8720291", tideName: "Jacksonville Beach",
    tideSensitivity: "medium", windExposure: { facingDeg: 90 }, buoy: "41112", cdip: "132", waterTemp: "8720218",
    access: [], targets: ["whiting", "spanish"], notes: "1,300-ft pier.", tips: [] },
];

export const ACTIVE_SPOTS = SPOTS.filter((s) => s.active);
export const DEFAULT_SPOT = "flagler-pier";
export const spotById = (id) => SPOTS.find((s) => s.id === id) ?? SPOTS.find((s) => s.id === DEFAULT_SPOT);

// SECOORA ERDDAP mirror of the CDIP wave buoys. NDBC sends no CORS headers; SECOORA does
// (verified 2026-10-05 from the github.io origin and localhost). Waves run ~30 min behind
// NDBC. Waves and water temperature arrive on different rows, so each is queried with a
// non-NaN filter. Fallback: api/live/marine.json (NDBC 41117 via the scheduled build).
export const BUOY_ERDDAP = "https://erddap.secoora.org/erddap/tabledap";
export function buoyUrls(cdip) {
  const base = `${BUOY_ERDDAP}/edu_ucsd_cdip_${cdip}.json`;
  const since = "time%3E=now-6hours";
  return {
    waves: `${base}?time,sea_surface_wave_significant_height,sea_surface_wave_period_at_variance_spectral_density_maximum,sea_surface_wave_from_direction&${since}&sea_surface_wave_significant_height!=NaN&orderByMax(%22time%22)`,
    water: `${base}?time,sea_water_temperature&${since}&sea_water_temperature!=NaN&orderByMax(%22time%22)`,
  };
}
