import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "site");
const output = join(root, "ios-www");
const excluded = new Set(["api", "v1", "v2", "v3", "v4"]);
const capacitorPackages = ["app", "browser", "geolocation", "haptics", "share", "status-bar"];

if (!existsSync(join(source, "index.html"))) throw new Error(`Missing site/index.html in ${root}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, {
  recursive: true,
  filter: (path) => {
    const relative = path.slice(source.length).replace(/^\//, "");
    const first = relative.split(/[\\/]/)[0];
    return !first || !excluded.has(first);
  },
});

const vendorDir = join(output, "ios-vendor");
mkdirSync(vendorDir, { recursive: true });
mkdirSync(join(output, "ios"), { recursive: true });
for (const name of ["bridge.js", "bridge.css"]) cpSync(join(root, "ios", name), join(output, "ios", name));
cpSync(join(root, "node_modules/@capacitor/core/dist/capacitor.js"), join(vendorDir, "capacitor.js"));
// geolocation's browser bundle expects a global `synapse`; the helper package exposes `outsystemsSynapse`.
writeFileSync(join(vendorDir, "synapse.js"), `${readFileSync(join(root, "node_modules/@capacitor/synapse/dist/synapse.js"), "utf8")}\n;var synapse = globalThis.outsystemsSynapse;\n`);
for (const name of capacitorPackages) {
  const from = join(root, `node_modules/@capacitor/${name}/dist/plugin.js`);
  if (!existsSync(from)) throw new Error(`Missing Capacitor browser bridge for @capacitor/${name}; run npm install.`);
  cpSync(from, join(vendorDir, `${name}.js`));
}

// Native entry point is the V5 prototype; the classic root app stays reachable as classic.html.
const bridgeTags = (prefix) => [
  `<link rel="stylesheet" href="${prefix}ios/bridge.css">`,
  ...["capacitor", "synapse", ...capacitorPackages].map((name) => `<script src="${prefix}ios-vendor/${name}.js"></script>`),
  `<script type="module" src="${prefix}ios/bridge.js"></script>`,
].join("\n");
function inject(file, prefix) {
  let html = readFileSync(file, "utf8");
  html = html.replace(/<meta name="viewport" content="([^"]*)">/i, (tag, content) => {
    const viewport = content.includes("maximum-scale=") ? content : `${content}, maximum-scale=1`;
    return `<meta name="viewport" content="${viewport}">`;
  });
  if (!html.includes("ios/bridge.js")) {
    if (!html.includes("</head>")) throw new Error(`${file} has no closing </head> tag`);
    html = html.replace("</head>", `${bridgeTags(prefix)}\n</head>`);
  }
  writeFileSync(file, html);
}
cpSync(join(output, "index.html"), join(output, "classic.html"));
inject(join(output, "classic.html"), "");
inject(join(output, "v5/proto/index.html"), "../../");
writeFileSync(join(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="dark light"><title>Flagler Fishing</title><script>location.replace("v5/proto/index.html" + location.hash);</script></head><body></body></html>\n`);

console.log(`Built native web bundle at ${output}`);
