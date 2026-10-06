/** Versioned parameters. `null` values are deliberate gates for later evidence. */
export const MODEL_PARAMS = Object.freeze({
  paramsVersion: "v5-params-a4-review-fixes",
  weightsByMode: Object.freeze({
    surf: Object.freeze({ season: 0.24, water: 0.18, tide: 0.14, light: 0.10, wind: 0.10, waves: 0.10, pressure: 0.05, solunar: 0.05, rain: 0.04 }),
    pier: Object.freeze({ season: 0.24, water: 0.18, tide: 0.14, light: 0.10, wind: 0.10, waves: 0.10, pressure: 0.05, solunar: 0.05, rain: 0.04 }),
    inshore: Object.freeze({ season: 0.24, water: 0.18, tide: 0.20, light: 0.12, wind: 0.10, waves: null, pressure: 0.06, solunar: 0.06, rain: 0.04 }),
  }),
  history: Object.freeze({
    kNeighbor: 80,
    kMonth: 40,
    numericMinN: 80,
    thinMinN: 30,
    bands: Object.freeze({ commonMin: 0.20, occasionalMin: 0.05 }),
    realisticFloor: 0.05,
    realisticFloorProvisional: true,
    seasonCapBelow: 0.10,
    seasonCapSuitability: 20,
    unavailablePenalty: 15,
    thinPenalty: 15,
    lowSamplePenalty: 8,
    seasonPeakMinimumHits: 10,
    seasonAbsoluteRateCap: 0.20,
  }),
  thresholds: Object.freeze({
    greatFit: 70,
    decentFit: 50,
    poorFit: 30,
    goSuitabilityMin: null,
    goSuitabilityMinProvisional: true,
    goConfidenceMin: 50,
    maybeSuitabilityMin: 50,
    highConfidenceMin: 75,
    moderateConfidenceMin: 50,
  }),
  confidence: Object.freeze({
    start: 100,
    minimum: 5,
    forecastMissingOrStale: 25,
    forecastAging: 10,
    alertsUnchecked: 20,
    tideUnavailable: 20,
    distantOceanTideStation: 10,
    wavesUnavailable: 10,
    waterTempUnavailable: 10,
    inshoreBuoyTemp: 5,
    pressureUnavailable: 5,
  }),
  freshness: Object.freeze({
    forecastMaxAgeHours: 6,
    forecastAgingMinHours: 3,
    todayWaveMaxAgeHours: 3,
    tomorrowWaveMaxAgeHours: 6,
    distantTideStationMiles: 15,
  }),
  factors: Object.freeze({
    minimumAvailableWeightShare: 0.60,
    conditionCaps: Object.freeze({ sinkBelow: 0.25, suitabilityCap: 49, rainProbabilityPct: 70, thunderProbabilityPct: 30, waveHeightM: 1.8, onshoreWindMph: 20, windGustMph: 30 }),
    alertGates: Object.freeze([
      Object.freeze({ events: ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Gale Warning", "Storm Warning", "Hurricane Warning", "Tropical Storm Warning"], minimumSeverity: "Severe" }),
      Object.freeze({ events: ["High Surf Advisory", "High Surf Warning", "Rip Current Statement", "Rip Current Warning", "Small Craft Advisory", "Coastal Flood Advisory", "Coastal Flood Warning"], minimumSeverity: "Severe" }),
    ]),
    effectHelpsMin: 0.67,
    effectNeutralMin: 0.34,
    tideSensitivityMultipliers: Object.freeze({ high: 1.3, medium: 1, low: 0.6 }),
    // Coverage uses 0.5 ft/hr as a review proposal only; do not activate without calibration.
    tide: Object.freeze({ oppositeDirectionFloor: 0.35, anyDirectionScore: 0.7, rateNormalizationScale: null, rateNormalizationScaleProvisional: true, rateNormalizationScaleProposal: 0.5 }),
    light: Object.freeze({ lowlightMinutes: 60, middayScore: 0.4, nightScore: 0.25, dayScore: 1, nightDaySpeciesScore: 0.3, anyScore: 0.8 }),
    solunar: Object.freeze({ majorMinutes: 60, minorMinutes: 30, majorScore: 1, minorScore: 0.75, neutralScore: 0.45, phaseBoost: 0.1, phaseDays: 3, synodicDays: 29.530588853 }),
    wind: Object.freeze({ fullScoreMaxMph: 10, zeroScoreMph: 25, gustZeroMph: 30, onshoreCalmPenalty: 0.15, onshoreRoughBonus: 0.05, offshoreCalmBonus: 0.1, inshoreOnshorePenalty: 0.1, onshoreSectorHalfWidthDeg: 90 }),
    waves: Object.freeze({ calmMaxM: 0.6, moderateMaxM: 1.2, zeroScoreAboveM: 2, adjacentClassScore: 0.6, oppositeClassScore: 0.2, noPreferenceScore: 0.7, safetySkipAboveM: 2.5 }),
    pressure: Object.freeze({ fallingMinHpa: -3, fallingMaxHpa: -0.5, neutralAbsMaxHpa: 0.5, risingMaxHpa: 3, fallingScore: 1, neutralScore: 0.8, risingScore: 0.6, rapidChangeScore: 0.4 }),
    safety: Object.freeze({ windSkipMph: 25, gustSkipMph: 35 }),
  }),
  windows: Object.freeze({ slotMinutes: 30, todayEndLocalHour: 21, tomorrowStartLocalHour: 5, tomorrowEndLocalHour: 21, middayStartLocalHour: 12, afternoonStartLocalHour: 15, eveningStartLocalHour: 19, peakTolerancePoints: 8, minimumMinutes: 60, maximumMinutes: 150, maximumPerSpecies: 4, maxContiguousSafetyGapMinutes: 0 }),
  selection: Object.freeze({ backupNearbyMiles: 7, similarSuitabilityDelta: 5, heldSelectionDelta: 5, maxTargets: 3, recommendedHorizonCutoffLocalHour: 15 }),
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function assert(condition, path, expectation) { if (!condition) throw new TypeError(`${path}: ${expectation}`); }
export function validateParams(params = MODEL_PARAMS) {
  assert(isObject(params), "params", "expected object");
  assert(typeof params.paramsVersion === "string" && params.paramsVersion.length > 0, "params.paramsVersion", "expected non-empty version");
  assert(isObject(params.weightsByMode), "params.weightsByMode", "expected object");
  for (const mode of ["surf", "pier", "inshore"]) {
    const w = params.weightsByMode[mode];
    assert(isObject(w), `params.weightsByMode.${mode}`, "expected object");
    const keys = ["season","water","tide","light","wind","waves","pressure","solunar","rain"];
    for (const k of keys) assert(w[k] === null || (typeof w[k] === "number" && Number.isFinite(w[k]) && w[k] >= 0), `params.weightsByMode.${mode}.${k}`, "expected nonnegative number or null");
    assert(Math.abs(keys.reduce((sum,k)=>sum+(w[k] ?? 0),0)-1)<1e-9, `params.weightsByMode.${mode}`, "active weights must sum to 1");
    assert((mode === "inshore") === (w.waves === null), `params.weightsByMode.${mode}.waves`, "waves must be null for inshore only");
  }
  const h=params.history, t=params.thresholds, c=params.confidence, f=params.freshness;
  assert(isObject(h),"params.history","expected object");
  for(const k of ["kNeighbor","kMonth","numericMinN","thinMinN"]) assert(Number.isInteger(h[k])&&h[k]>0,`params.history.${k}`,"expected positive integer");
  assert(isObject(h.bands),"params.history.bands","expected object");
  assert(h.bands.commonMin===0.20,"params.history.bands.commonMin","must match approved 0.20 cut");
  assert(h.bands.occasionalMin===0.05,"params.history.bands.occasionalMin","must match approved 0.05 cut");
  for(const [key,flag] of [["realisticFloor","realisticFloorProvisional"]]) { const v=h[key];assert(v===null||(typeof v==="number"&&v>=0&&v<=1),`params.history.${key}`,"expected null pending threshold sheet or a rate from 0 to 1");if(v===null)assert(h[flag]===true,`params.history.${flag}`,"must mark null as provisional"); }
  assert(h.kNeighbor===80&&h.kMonth===40,"params.history","shrinkage priors must be 80/40");
  assert(h.numericMinN===80&&h.thinMinN===30,"params.history","sample cutoffs must be 80/30");
  assert(h.seasonCapBelow===0.10&&h.seasonCapSuitability===20,"params.history","relative season cap must be 0.10/20");
  assert(Number.isInteger(h.seasonPeakMinimumHits)&&h.seasonPeakMinimumHits>0&&Number.isFinite(h.seasonAbsoluteRateCap)&&h.seasonAbsoluteRateCap>0,"params.history.season","minimum hits and absolute rate cap are required");
  assert(isObject(t),"params.thresholds","expected object");
  const go=t.goSuitabilityMin;assert(go===null||(Number.isFinite(go)&&go>=0&&go<=100),"params.thresholds.goSuitabilityMin","expected null pending hindcast or score from 0 to 100");if(go===null)assert(t.goSuitabilityMinProvisional===true,"params.thresholds.goSuitabilityMinProvisional","must mark null as provisional");
  for(const k of ["goConfidenceMin","highConfidenceMin","moderateConfidenceMin"])assert(Number.isFinite(t[k])&&t[k]>=0&&t[k]<=100,`params.thresholds.${k}`,"expected score from 0 to 100");
  assert(isObject(c),"params.confidence","expected object");for(const [k,v] of Object.entries(c))assert(Number.isFinite(v)&&v>=0&&v<=100,`params.confidence.${k}`,"expected penalty/score from 0 to 100");
  assert(isObject(f),"params.freshness","expected object");for(const [k,v] of Object.entries(f))assert(Number.isFinite(v)&&v>=0,`params.freshness.${k}`,"expected nonnegative number");
  assert(isObject(params.factors)&&isObject(params.windows)&&isObject(params.selection),"params","factors, windows, and selection groups are required");
  assert(Number.isFinite(params.factors.minimumAvailableWeightShare)&&params.factors.minimumAvailableWeightShare>=0&&params.factors.minimumAvailableWeightShare<=1,"params.factors.minimumAvailableWeightShare","expected share from 0 to 1");
  assert(Array.isArray(params.factors.alertGates)&&params.factors.alertGates.every(x=>Array.isArray(x.events)&&["Severe","Extreme"].includes(x.minimumSeverity)),"params.factors.alertGates","expected versioned event/severity table");
  assert(params.factors.tide.rateNormalizationScale===null||Number.isFinite(params.factors.tide.rateNormalizationScale)&&params.factors.tide.rateNormalizationScale>0,"params.factors.tide.rateNormalizationScale","expected null pending reviewed scale or positive number");
  if(params.factors.tide.rateNormalizationScale===null)assert(params.factors.tide.rateNormalizationScaleProvisional===true,"params.factors.tide.rateNormalizationScaleProvisional","must mark null as provisional");
  assert(Number.isFinite(params.factors.tide.rateNormalizationScaleProposal)&&params.factors.tide.rateNormalizationScaleProposal>0,"params.factors.tide.rateNormalizationScaleProposal","expected a documented positive review proposal");
  return true;
}

/** Stable JSON encoding for hashing: object keys sorted recursively; arrays retain order. */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** SHA-256 hex digest of canonical MODEL_PARAMS JSON (Web Crypto in browser and Node 22). */
export async function hashModelParams(params = MODEL_PARAMS) {
  validateParams(params);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 requires Web Crypto (crypto.subtle)");
  const bytes = new TextEncoder().encode(canonicalize(params));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
}
