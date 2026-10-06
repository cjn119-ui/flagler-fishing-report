import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadFirstCoastHistory,getHistoricalTiming } from "../site/v5/engine/history.js";
import { MODEL_PARAMS } from "../site/v5/engine/params.js";
import { calculateFactors } from "../site/v5/engine/factors.js";
import { calculateConfidence,verdictFor } from "../site/v5/engine/model.js";
import { getAstronomy } from "../site/v5/engine/astro.js";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const history=await loadFirstCoastHistory({readJson:async()=>JSON.parse(fs.readFileSync(path.join(root,"site/v5/data/first-coast-history.json"),"utf8"))});
// Reachability fixture: all factors are set to favourable but locally plausible values;
// test every active spot/mode/month, selecting only catalog-listed realistic species.
// Tide remains unavailable while its normalization scale is provisional; this both
// exposes weight renormalization and avoids tuning to an unmeasured tide-rate constant.
const candidateParams={...MODEL_PARAMS,history:{...MODEL_PARAMS.history,realisticFloor:0.05},thresholds:{...MODEL_PARAMS.thresholds,goSuitabilityMin:70}};
const modes=["surf","pier","inshore"],summary=Object.fromEntries(modes.map(m=>[m,{cells:0,realisticCells:0,goCells:0,goLocations:new Set(),speciesCandidates:0,bySpot:{}}]));
const noTarget=[];
for(const spot of ACTIVE_SPOTS)for(const mode of spot.modes)for(let month=1;month<=12;month++){
 const s=summary[mode];s.cells++;const loc=s.bySpot[spot.id]??(s.bySpot[spot.id]={cells:0,realistic:0,go:0});loc.cells++;
 const choices=SPECIES.filter(x=>x.modes.includes(mode)&&spot.targets.includes(x.id)&&!x.bycatch&&!(x.needsStructure&&!new Set(["pier","jetty","bridge","dock","seawall","rocks"]).has(spot.structure)));
 let best=null,hasRealistic=false;
 for(const species of choices){const timing=getHistoricalTiming(history,{speciesId:species.id,mripAliases:species.mrip,mode,start:`2026-${String(month).padStart(2,"0")}-15T12:00:00Z`,end:`2026-${String(month).padStart(2,"0")}-15T12:30:00Z`});
   const rate=timing.historicalRate.rate;if(rate==null||rate<candidateParams.history.realisticFloor)continue;
   hasRealistic=true;s.speciesCandidates++;
   const [min,lo,hi,max]=species.waterF,waterTempF=(lo+hi)/2;
   const surfClass=species.surf??"moderate",waveHeightM=surfClass==="calm"?.3:surfClass==="moderate"?.9:1.5;
   const day=`2026-${String(month).padStart(2,"0")}-15`,at=getAstronomy(day,spot.lat,spot.lon).sun.sunrise;
   const conditions={at,windMph:6,windGustMph:8,windDirectionDeg:(spot.windExposure?.facingDeg??90)+180,waterTempF,waveHeightM,rainPct:0,thunder:false,tideRateFtPerHr:null,pressureChange6hHpa:-1,alerts:[]};
   const factors=calculateFactors({species,mode,conditions,at:conditions.at,historyTiming:timing,spot,params:candidateParams});
   const conf=calculateConfidence({conditions,mode,spot,historyN:timing.historicalRate.n,historyAvailable:true,forecastAgeHours:1,alertsChecked:true,wavesAvailable:true,params:candidateParams});
   const eligibility="realistic", verdict=verdictFor({suitability:factors.suitability,confidence:conf.confidence,eligibility,conditionsReady:true,params:candidateParams});
   const item={species:species.id,score:factors.suitability,verdict};if(!best||item.score>best.score)best=item;
 }
 if(hasRealistic){s.realisticCells++;loc.realistic++;}if(best?.verdict==="GO"){s.goCells++;s.goLocations.add(spot.id);loc.go++;}else if(!best)noTarget.push(`${spot.id}/${mode}/${month}`);
}
console.log("V5 favourable-input coverage (candidate only; not frequency or acceptance)");
console.log("Method: one checked forecast, checked alerts, 6 mph wind, ideal species water temperature, species-matched plausible surf, dry weather, falling pressure; 30-minute tide factor unavailable pending calibration. Candidate GO suitability threshold = 70; candidate realistic floor = .05. Only target-list, mode-valid, structure-valid, non-bycatch species with monthly shrunk rate >= .05 qualify.");
for(const mode of modes){const s=summary[mode];console.log(`${mode}: GO reachable ${s.goCells}/${s.cells} location-month cells across ${s.goLocations.size}/${ACTIVE_SPOTS.filter(x=>x.modes.includes(mode)).length} locations; realistic candidates in ${s.realisticCells}/${s.cells} cells (candidate species checks ${s.speciesCandidates}).`);for(const [id,v] of Object.entries(s.bySpot))console.log(`  ${id}: GO ${v.go}/12 months; realistic targets ${v.realistic}/12 months`);}
if(noTarget.length)console.log(`No realistic target at candidate floor: ${noTarget.length} cells: ${noTarget.join(", ")}`);
