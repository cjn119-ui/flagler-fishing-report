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
for (const name of capacitorPackages) {
  const from = join(root, `node_modules/@capacitor/${name}/dist/plugin.js`);
  if (!existsSync(from)) throw new Error(`Missing Capacitor browser bridge for @capacitor/${name}; run npm install.`);
  cpSync(from, join(vendorDir, `${name}.js`));
}

const indexPath = join(output, "index.html");
let html = readFileSync(indexPath, "utf8");
const injection = [
  '<link rel="stylesheet" href="ios/bridge.css">',
  ...["capacitor", ...capacitorPackages].map((name) => `<script src="ios-vendor/${name}.js"></script>`),
  '<script type="module" src="ios/bridge.js"></script>',
].join("\n");
if (!html.includes("ios/bridge.js")) {
  if (!html.includes("</head>")) throw new Error("site/index.html has no closing </head> tag");
  html = html.replace("</head>", `${injection}\n</head>`);
}
writeFileSync(indexPath, html);

console.log(`Built native web bundle at ${output}`);
