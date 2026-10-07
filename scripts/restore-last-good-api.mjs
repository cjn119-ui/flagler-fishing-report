import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API_FILES = [
  "report.json",
  "next-day-report.json",
  "state.json",
  "live/weather.json",
  "live/marine.json",
  "live/tides.json",
];

const DEFAULT_OUT = fileURLToPath(new URL("../site/api/", import.meta.url));

export async function restoreLastGoodApi({
  siteUrl = process.env.SITE_URL,
  outDir = DEFAULT_OUT,
  fetchImpl = fetch,
} = {}) {
  const baseUrl = String(siteUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("SITE_URL is required to restore deployed API data");
  if (!/^https?:\/\/[^/]+/.test(baseUrl)) throw new Error(`SITE_URL is not an HTTP(S) URL: ${baseUrl}`);

  const files = await Promise.all(API_FILES.map(async (file) => {
    const url = `${baseUrl}/api/${file}`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`could not restore ${url}: HTTP ${response.status}`);

    const body = await response.text();
    try {
      JSON.parse(body);
    } catch {
      throw new Error(`could not restore ${url}: response is not valid JSON`);
    }
    return [file, body];
  }));

  for (const [file, body] of files) {
    const path = join(outDir, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  console.log(`restored ${files.length} deployed root API files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await restoreLastGoodApi();
}
