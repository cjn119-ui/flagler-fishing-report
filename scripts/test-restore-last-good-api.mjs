import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreLastGoodApi } from "./restore-last-good-api.mjs";

const apiFiles = [
  "report.json",
  "next-day-report.json",
  "state.json",
  "live/weather.json",
  "live/marine.json",
  "live/tides.json",
];
const deployed = new Map(apiFiles.map((path, index) => [path, `{"version":${index}}\n`]));
const root = await mkdtemp(join(tmpdir(), "restore-last-good-api-"));

try {
  const successfulDir = join(root, "successful");
  await restoreLastGoodApi({
    siteUrl: "https://example.test/site/",
    outDir: successfulDir,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.replace("/site/api/", "");
      return new Response(deployed.get(path), { status: 200 });
    },
  });
  for (const [path, body] of deployed) {
    assert.equal(await readFile(join(successfulDir, path), "utf8"), body);
  }

  const failedDir = join(root, "failed");
  await assert.rejects(
    restoreLastGoodApi({
      siteUrl: "https://example.test/site",
      outDir: failedDir,
      fetchImpl: async (url) => {
        const path = new URL(url).pathname.replace("/site/api/", "");
        return path === "live/tides.json"
          ? new Response("missing", { status: 404 })
          : new Response(deployed.get(path), { status: 200 });
      },
    }),
    /HTTP 404/,
  );
  await assert.rejects(stat(failedDir), { code: "ENOENT" });

  await assert.rejects(
    restoreLastGoodApi({
      siteUrl: "https://example.test/site",
      outDir: join(root, "invalid"),
      fetchImpl: async () => new Response("<html>not JSON</html>", { status: 200 }),
    }),
    /not valid JSON/,
  );
  await assert.rejects(stat(join(root, "invalid")), { code: "ENOENT" });

  console.log("PASS: last-good root API restore is complete and fail-closed");
} finally {
  await rm(root, { recursive: true, force: true });
}
