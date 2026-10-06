import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARCHIVE_SCHEMA_VERSION=1;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value);
async function sha256(text){const d=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
const ndjson=rows=>rows.map(canonical).join("\n")+(rows.length?"\n":"");

/** Deterministic local archive package. No network or remote side effects. */
export async function buildArchiveBundle({inputs=[],today,tomorrow,paramsHash,historyHash,catalogHash,codeRevision="working-tree",generatedAt}={}){
  if(!today||!tomorrow)throw new TypeError("both immutable horizon runs are required");
  const normalized=[...inputs].sort((a,b)=>canonical(a).localeCompare(canonical(b))), seen=new Map(), archived=[];
  for(const row of normalized){const inputHash=await sha256(canonical(row));if(seen.has(inputHash))archived.push({inputHash,duplicateOf:seen.get(inputHash)});else{seen.set(inputHash,inputHash);archived.push({...row,inputHash});}}
  const compact=run=>({schemaVersion:run.schemaVersion,id:run.id,modelVersion:run.modelVersion,paramsHash:run.paramsHash,historyHash:run.historyHash,catalogHash:run.catalogHash,codeRevision:run.codeRevision,horizon:run.horizon,targetDate:run.targetDate,generatedAt:run.generatedAt,validFrom:run.validFrom,validTo:run.validTo,status:run.status,sourceInputs:(run.inputs?.observations??[]).map(x=>x.inputHash??`${x.locationId}/${x.kind}/${x.fetchedAt}`),candidates:run.candidates??[],slots:run.slots??[],recommendation:run.recommendation,scopeViews:run.scopeViews});
  const files={"inputs.ndjson":ndjson(archived),"runs.ndjson":ndjson([compact(today),compact(tomorrow)])};
  const fileEntries={};for(const [name,body] of Object.entries(files))fileEntries[name]={sha256:await sha256(body),sizeBytes:new TextEncoder().encode(body).length};
  const manifest={archiveSchemaVersion:ARCHIVE_SCHEMA_VERSION,buildId:`v5-build-${String(generatedAt??today.generatedAt).replaceAll(":","").replaceAll("-","").replaceAll(".","")}`,generatedAt:generatedAt??today.generatedAt,status:today.status==="ok"&&tomorrow.status==="ok"?"ok":"partial",codeRevision,modelVersion:today.modelVersion,paramsHash:paramsHash??today.paramsHash,historyHash:historyHash??today.historyHash,catalogHash:catalogHash??today.catalogHash,todayRunId:today.id,tomorrowRunId:tomorrow.id,priorSelectionIds:[today.inputs?.priorSelection?.recommendationId,tomorrow.inputs?.priorSelection?.recommendationId].filter(Boolean),inputCount:normalized.length,files:fileEntries};
  files["manifest.json"]=canonical(manifest)+"\n";
  return {manifest,files,hashes:{...Object.fromEntries(Object.entries(fileEntries).map(([k,v])=>[k,v.sha256])),"manifest.json":await sha256(files["manifest.json"])}};
}

export async function restoreArchiveBundle(bundle){
  const manifest=typeof bundle?.files?.["manifest.json"]==="string"?JSON.parse(bundle.files["manifest.json"]):bundle?.manifest;
  if(!manifest||manifest.archiveSchemaVersion!==ARCHIVE_SCHEMA_VERSION)throw new Error("unsupported archive schema");
  for(const [name,expected] of Object.entries(manifest.files??{})){const body=bundle.files?.[name];if(typeof body!=="string")throw new Error(`archive missing ${name}`);const actual=await sha256(body);if(actual!==expected.sha256)throw new Error(`archive hash mismatch: ${name}`);}
  const inputRows=(bundle.files["inputs.ndjson"]??"").split("\n").filter(Boolean).map(JSON.parse), byHash=new Map(inputRows.filter(x=>!x.duplicateOf).map(x=>[x.inputHash,Object.fromEntries(Object.entries(x).filter(([k])=>k!=="inputHash"))]));
  const inputs=inputRows.map(x=>x.duplicateOf?byHash.get(x.duplicateOf):Object.fromEntries(Object.entries(x).filter(([k])=>k!=="inputHash")));
  if(inputs.some(x=>!x))throw new Error("archive duplicate input reference is unresolved");
  const runs=(bundle.files["runs.ndjson"]??"").split("\n").filter(Boolean).map(JSON.parse);
  if(runs.length!==2||runs[0].id!==manifest.todayRunId||runs[1].id!==manifest.tomorrowRunId)throw new Error("archive run projection mismatch");
  return {manifest,inputs,runs};
}

export async function uploadArchiveBundle(){throw new Error("remote archive activation not enabled");}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes("--upload"))await uploadArchiveBundle();
  const outArg=process.argv.indexOf("--out"),out=resolve(outArg>=0?process.argv[outArg+1]:".local-v5-archive");
  const source=resolve("site/api/v5");
  const [today,tomorrow]=await Promise.all(["today","tomorrow"].map(async name=>JSON.parse(await readFile(resolve(source,`${name}.json`),"utf8"))));
  const bundle=await buildArchiveBundle({inputs:[...(today.inputs?.observations??[])],today,tomorrow});
  await mkdir(out,{recursive:true});for(const [name,body] of Object.entries(bundle.files))await writeFile(resolve(out,name),body);
  console.log(`archive prepared locally: ${out} (${Object.keys(bundle.files).length} files)`);
}
