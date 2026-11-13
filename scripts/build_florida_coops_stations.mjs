import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const url = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english";
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`NOAA station metadata returned ${response.status}`);
const payload = await response.json();
const stations = (payload.stations ?? []).filter(row => row.state === "FL" &&
  row.lat >= 24 && row.lat <= 31.2 && row.lng >= -87.7 && row.lng <= -79.5)
  .map(({ id, name, lat, lng }) => ({ id: String(id), name, lat, lon: lng }))
  .sort((a, b) => a.id.localeCompare(b.id));
if (!stations.length) throw new Error("NOAA returned no Florida tide-prediction stations");
const out = `${root}site/v5/data/florida-coops-tide-stations.json`;
await mkdir(`${root}site/v5/data`, { recursive: true });
await writeFile(out, JSON.stringify({ source: url, generatedAt: new Date().toISOString(), stations }));
console.log(`wrote ${out}: ${stations.length} Florida CO-OPS tide stations`);
