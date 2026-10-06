import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
import { loadFirstCoastHistory } from "../site/v5/engine/history.js";
import { fetchSources } from "../site/v5/engine/sources.js";
import { buildPredictionRun } from "../site/v5/engine/run.js";
import { validatePredictionRun } from "../site/v5/engine/contracts.js";

const ROOT=fileURLToPath(new URL("../",import.meta.url)), OUT=`${ROOT}site/api/v5/`, SITE_URL=(process.env.SITE_URL??"").replace(/\/$/,"");
const LIMITS={today:250*1024,tomorrow:250*1024,index:10*1024,detail:100*1024};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value);
const parseJSON=async path=>JSON.parse(await readFile(path,"utf8"));
async function seedDeployed(){if(!SITE_URL)return {runs:[],files:{}};const found=[],files={};for(const key of ["today","tomorrow"]){try{const r=await fetch(`${SITE_URL}/api/v5/${key}.json`,{signal:AbortSignal.timeout(12000)});if(!r.ok)continue;const body=await r.text(),run=JSON.parse(body);validatePredictionRun(run);found.push(run);files[`${key}.json`]=body;}catch(e){console.warn(`prior ${key} unavailable: ${e.message}`);}}
  try{const r=await fetch(`${SITE_URL}/api/v5/index.json`,{signal:AbortSignal.timeout(12000)});if(r.ok)files["index.json"]=await r.text();}catch{}
  const refs=[...new Set(found.flatMap(run=>run.detailsRefs??[]))];for(const ref of refs){try{const r=await fetch(`${SITE_URL}/api/v5/${ref}`,{signal:AbortSignal.timeout(12000)});if(r.ok)files[ref]=await r.text();}catch{}}
  return {runs:found,files};}
async function seedLocal(){const files={},runs=[];for(const key of ["today","tomorrow"]){try{const body=await readFile(`${OUT}${key}.json`,"utf8");const run=JSON.parse(body);validatePredictionRun(run);runs.push(run);files[`${key}.json`]=body;}catch{}}
  for(const name of ["index.json"]){try{files[name]=await readFile(`${OUT}${name}`,"utf8");}catch{}}
  for(const ref of [...new Set(runs.flatMap(run=>run.detailsRefs??[]))]){try{files[ref]=await readFile(`${OUT}${ref}`,"utf8");}catch{}}
  return {runs,files};}
async function preserveFiles(files){for(const [name,body] of Object.entries(files)){const path=`${OUT}${name}`;await mkdir(path.slice(0,path.lastIndexOf("/")),{recursive:true});await writeFile(path,body);}}
const fixtureArg=process.argv.indexOf("--fixtures"),fixtureMode=fixtureArg>=0;
const nowArg=process.argv.indexOf("--now"),now=nowArg>=0?process.argv[nowArg+1]:fixtureMode?undefined:Date.now();
const history=await loadFirstCoastHistory({readJson:async p=>parseJSON(`${ROOT}site/v5/data/first-coast-history.json`)});
const catalogHash=await (async()=>{const b=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical({spots:ACTIVE_SPOTS,species:SPECIES})));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");})();
const deployedSeed=fixtureMode?{runs:[],files:{}}:await seedDeployed(),localSeed=await seedLocal(),previousRuns=deployedSeed.runs.length?deployedSeed.runs:localSeed.runs;
let observations=[];
if(fixtureMode){const file=fixtureArg+1<process.argv.length&&!process.argv[fixtureArg+1].startsWith("--")?process.argv[fixtureArg+1]:`${ROOT}scripts/fixtures/v5/run-inputs.json`;const fixture=await parseJSON(file);observations=fixture.observations??[];if(now===undefined)process.env.__v5FixtureNow=fixture.now;}
else observations=await fetchSources({locations:ACTIVE_SPOTS,now});
const fixedNow=now??process.env.__v5FixtureNow;
const completelyFailed=observations.length>0&&observations.every(x=>!x?.ok);
if(completelyFailed){
  if(previousRuns.length){await preserveFiles(deployedSeed.runs.length?deployedSeed.files:localSeed.files);console.error("all V5 sources failed; preserving the deployed runs");process.exit(1);}
  console.error("all V5 sources failed and no usable deployed runs are available");process.exit(1);
}
let built;
try{built=await buildPredictionRun({now:fixedNow,locations:ACTIVE_SPOTS,species:SPECIES,history,observations,previousRuns,preferences:{favourites:[]},catalogHash,codeRevision:process.env.GITHUB_SHA??"working-tree"});}
catch(error){if(previousRuns.length){await preserveFiles(deployedSeed.runs.length?deployedSeed.files:localSeed.files);console.error(`V5 build failed; preserving deployed runs: ${error.message}`);process.exit(1);}throw error;}
try{
for(const run of [built.today,built.tomorrow])validatePredictionRun(run);
const payloads={"today.json":built.today,"tomorrow.json":built.tomorrow,"index.json":{schemaVersion:1,generatedAt:built.today.generatedAt,recommendedHorizon:(Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",hour12:false}).format(new Date(fixedNow)))>=15?"tomorrow":"today"),today:{id:built.today.id,targetDate:built.today.targetDate,status:built.today.status},tomorrow:{id:built.tomorrow.id,targetDate:built.tomorrow.targetDate,status:built.tomorrow.status},details:Object.keys(built.details).sort()}};
const writes=[];for(const [name,value] of Object.entries(payloads)){const body=canonical(value)+"\n",size=gzipSync(body).byteLength,limit=name==="index.json"?LIMITS.index:LIMITS[name.replace(".json","")];if(size>limit)throw new Error(`${name} gzip ${size} exceeds ${limit}`);writes.push([`${OUT}${name}`,body,size]);}
for(const [name,value] of Object.entries(built.details)){const body=canonical(value)+"\n",size=gzipSync(body).byteLength;if(size>LIMITS.detail)throw new Error(`${name} gzip ${size} exceeds ${LIMITS.detail}`);writes.push([`${OUT}${name}`,body,size]);}
for(const [path,body] of writes){await mkdir(path.slice(0,path.lastIndexOf("/")),{recursive:true});await writeFile(path,body);}
console.log(`V5 generated: today ${writes.find(x=>x[0].endsWith("today.json"))[2]} B gzip; tomorrow ${writes.find(x=>x[0].endsWith("tomorrow.json"))[2]} B; index ${writes.find(x=>x[0].endsWith("index.json"))[2]} B; ${Object.keys(built.details).length} details`);
}catch(error){if(previousRuns.length){await preserveFiles(deployedSeed.runs.length?deployedSeed.files:localSeed.files);console.error(`V5 output failed; preserving deployed runs: ${error.message}`);process.exit(1);}throw error;}
