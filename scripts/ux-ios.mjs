import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".agent-handoff/shots/redesign");
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { webkit, chromium, firefox, devices } = require("/opt/homebrew/lib/node_modules/playwright");
const sampleToday = await readFile(join(root, "ios-www/v5/proto/sample-rich.json"), "utf8");
const sampleTomorrow = await readFile(join(root, "ios-www/v5/proto/sample-rich-tomorrow.json"), "utf8");
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(join(root, "ios-www", `.${pathname}`));
    if (!file.startsWith(join(root, "ios-www") + "/")) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".jpg") || file.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
    response.writeHead(200, { "content-type": `${type}; charset=utf-8` }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/v5/proto/index.html`;
const initialResponse = await fetch(base);
if (!initialResponse.ok) { server.close(); throw new Error(`UX fixture server returned HTTP ${initialResponse.status}`); }
let browser, browserName;
const failures = [];
for (const [name, engine] of [["WebKit", webkit], ["Chromium", chromium], ["Firefox", firefox]]) {
  try {
    const options = { headless: true };
    if (name === "Chromium" && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) options.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && name === "Chromium") options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    browser = await engine.launch(options); browserName = name; break;
  }
  catch (error) { failures.push(`${name}: ${error.message.split("\n")[0]}`); }
}
if (!browser) { server.close(); throw new Error(`No installed Playwright browser is available. ${failures.join("; ")}`); }
if (browserName !== "WebKit") console.log(`WebKit unavailable; using installed ${browserName} (${failures[0] ?? ""}).`);
const descriptor = devices["iPhone 15 Pro"] ?? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const context = await browser.newContext({ ...descriptor, viewport: { width: 375, height: 812 }, reducedMotion: "no-preference" });
await context.route("**/api/**", async (route) => {
  const body = route.request().url().includes("tomorrow") ? sampleTomorrow : sampleToday;
  await route.fulfill({ status: 200, contentType: "application/json", body });
});
const page = await context.newPage();
const touchCdp = browserName === "Chromium" ? await context.newCDPSession(page) : null;
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => consoleErrors.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
await page.clock.install({ time: new Date("2026-10-07T12:00:00-04:00") });

async function openApp(hash = "") {
  await page.goto(`${base}${hash ? `#${hash}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.locator("#view[aria-busy=false]").waitFor({ timeout: 8000 }).catch(async (error) => {
      console.log("startup debug", { errors: consoleErrors, html: (await page.locator("body").innerText()).slice(0, 500), url: page.url() }); throw error;
  });
}
async function reloadApp() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#view[aria-busy=false]").waitFor({ timeout: 8000 }).catch(async (error) => {
    console.log("reload debug", { errors: consoleErrors, html: (await page.locator("body").innerText()).slice(0, 400), url: page.url() }); throw error;
  });
}
async function setAppearance(name) {
  await page.locator("#more").click();
  await page.locator(".more-sheet .appearance").getByRole("button", { name, exact: true }).click();
  const values = { Auto: "auto", Dark: "dark", Night: "night", Light: "light" };
  await page.waitForFunction((v) => localStorage.getItem("v5proto.theme") === JSON.stringify(v), values[name]);
  await page.locator(".xbtn[aria-label=Close]").evaluate((button) => button.click());
  await page.waitForTimeout(250);
}
async function touchSwipe(selector, dx, dy = 0) {
  if (selector !== "#view") await page.locator(selector).scrollIntoViewIfNeeded();
  const coords = await page.locator(selector).evaluate((el) => {
    const box = el.getBoundingClientRect(), x = Math.max(24, Math.min(innerWidth - 24, box.left + Math.min(box.width / 2, innerWidth / 2))), y = el.matches(".scrub") ? box.top + box.height / 2 : Math.min(innerHeight - 120, Math.max(box.top + 80, innerHeight / 2));
    return { x, y };
  });
  if (touchCdp && selector !== ".scrub") {
    await touchCdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...coords, id: 41, radiusX: 1, radiusY: 1, force: 1 }] });
    await touchCdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: coords.x + dx, y: coords.y + dy, id: 41, radiusX: 1, radiusY: 1, force: 1 }] });
    await touchCdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.locator(selector).evaluate((el, delta) => {
      const x = delta.x, y = delta.y, mk = (xx, yy) => new Touch({ identifier: 41, target: el, clientX: xx, clientY: yy, pageX: xx + scrollX, pageY: yy + scrollY, screenX: xx, screenY: yy });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [mk(x, y)], targetTouches: [mk(x, y)], changedTouches: [mk(x, y)] }));
      el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [mk(x + delta.dx, y + delta.dy)], targetTouches: [mk(x + delta.dx, y + delta.dy)], changedTouches: [mk(x + delta.dx, y + delta.dy)] }));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [mk(x + delta.dx, y + delta.dy)] }));
    }, { dx, dy, ...coords });
  }
  await page.waitForTimeout(410);
}
async function dragTabbar(fromIndex, toIndex) {
  const box = await page.locator(".tabs").boundingBox();
  const x = (index) => box.x + box.width * ((index + .5) / 5), y = box.y + box.height / 2;
  await page.mouse.move(x(fromIndex), y); await page.mouse.down();
  for (let step = 1; step <= 5; step++) await page.mouse.move(x(fromIndex + (toIndex - fromIndex) * step / 5), y);
  await page.mouse.up(); await page.waitForTimeout(360);
}
async function assertSheetExit() {
  await page.locator("#more").click();
  const panel = page.locator(".sheet");
  await panel.waitFor();
  await page.locator(".xbtn[aria-label=Close]").evaluate((button) => button.click());
  const started = Date.now();
  await page.waitForTimeout(155);
  assert.equal(await panel.count(), 1, "sheet must remain in DOM during its exit animation");
  assert.ok(Date.now() - started >= 150, "sheet exit must not be removed before 150ms");
  await page.waitForTimeout(100);
  await panel.waitFor({ state: "detached", timeout: 600 });
  assert.ok(Date.now() - started <= 600, `sheet must detach within 600ms (observed ${Date.now() - started}ms)`);
}
async function startFrameTrace() {
  await page.evaluate(() => { window.__frameTimes = []; window.__frameLast = performance.now(); window.__frameTick = () => { const n = performance.now(); window.__frameTimes.push(n - window.__frameLast); window.__frameLast = n; window.__frameHandle = requestAnimationFrame(window.__frameTick); }; window.__frameHandle = requestAnimationFrame(window.__frameTick); });
}
async function stopFrameTrace() {
  return page.evaluate(() => { cancelAnimationFrame(window.__frameHandle); const values = [...window.__frameTimes].sort((a, b) => a - b); const p95 = values.length ? values[Math.ceil(values.length * .95) - 1] : 0; return { frames: values.length, p95: +p95.toFixed(2), over25: values.filter((x) => x > 25).length }; });
}

try {
  await openApp();
  const longestSpot = [...ACTIVE_SPOTS].sort((a, b) => b.name.length - a.name.length)[0];
  assert.ok(longestSpot, "ACTIVE_SPOTS must include a longest spot name");
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const tab of ["today", "spots", "species", "plan", "log"]) {
      await page.goto(base + "#spot=" + encodeURIComponent(longestSpot.id) + "&tab=" + tab, { waitUntil: "domcontentloaded" });
      await page.locator("#view[aria-busy=false]").waitFor();
      assert.equal(await page.locator("#spot-label").innerText(), longestSpot.name, "longest active spot name should be scoped in the header");
      const metrics = await page.evaluate(() => ({ width: innerWidth, pill: document.querySelector("#spot-pill").getBoundingClientRect().right, toolsLeft: document.querySelector(".tools").getBoundingClientRect().left, toolsRight: document.querySelector(".tools").getBoundingClientRect().right, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(metrics.pill <= metrics.toolsLeft + 1 && metrics.toolsRight <= width + 1 && metrics.doc <= width + 1 && metrics.body <= width + 1, "long-name header overflow at " + width + "px on " + tab + ": " + JSON.stringify(metrics));
    }
  }
  await page.goto(base, { waitUntil: "domcontentloaded" }); await page.locator("#view[aria-busy=false]").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "auto should resolve to daytime Dark at frozen midday");
  assert.equal(await page.evaluate(() => localStorage.getItem("v5proto.theme")), null, "auto default must not write a preference");
  assert.equal(await page.locator("#spot-label").innerText(), "Best anywhere", "default spot pill label must remain complete at 375px");
  const headerMetrics = await page.evaluate(() => Object.fromEntries([".bar", ".brand", "#spot-pill", ".tools", "#refresh", "#more"].map((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return [s, { left: r.left, right: r.right, width: r.width }]; })));
  assert.ok(headerMetrics["#spot-pill"].right < 375, `spot pill must fit beside header actions: ${JSON.stringify(headerMetrics)}`);
  assert.equal(await page.locator("#toast").getAttribute("aria-live"), "polite");
  for (const [label, expected] of [["Auto", "dark"], ["Dark", "dark"], ["Night", "dark"], ["Light", "light"]]) {
    await setAppearance(label);
    if (label === "Night") assert.equal(await page.locator("html").getAttribute("data-night"), "1");
    if (label !== "Night") assert.notEqual(await page.locator("html").getAttribute("data-night"), "1");
    await reloadApp();
    assert.equal(await page.locator("html").getAttribute("data-theme"), expected, `${label} persists across reload`);
  }
  await page.evaluate(() => { location.hash = "theme=night"; });
  await page.waitForFunction(() => document.documentElement.dataset.night === "1");
  assert.equal(await page.evaluate(() => localStorage.getItem("v5proto.theme")), JSON.stringify("light"), "hash override must not replace saved preference");
  await page.evaluate(() => localStorage.removeItem("v5proto.theme"));
  await page.clock.resume();
  await openApp();

  await touchSwipe("#view", -130);
  assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "spots");
  await touchSwipe("#view", -130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "species");
  await touchSwipe("#view", -130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "plan");
  await touchSwipe("#view", -130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "log");
  await touchSwipe("#view", -130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "log", "last tab must not wrap");
  await touchSwipe("#view", 130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "plan");
  await touchSwipe("#view", 130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "species");
  await touchSwipe("#view", 130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "spots");
  await touchSwipe("#view", 130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "today");
  await touchSwipe("#view", 130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "today", "first tab must not wrap");
  if (await page.locator(".scrub").count()) { await touchSwipe(".scrub", -130); assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "today", "scrubber swipe must be ignored"); }

  await startFrameTrace();
  console.log("ux checkpoint: tab and swipe coverage complete");
  for (const tab of ["spots", "species", "plan", "log", "today"]) {
    await page.locator("[data-tab=" + tab + "]").click({ force: true });
    await page.waitForTimeout(310);
  }
  for (let i = 0; i < 4; i++) await dragTabbar(i, i + 1);
  assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "log");
  for (let i = 4; i > 0; i--) await dragTabbar(i, i - 1);
  assert.equal(await page.locator(".tab[aria-current=page]").getAttribute("data-tab"), "today");
  for (const direction of [-130, -130, -130, -130, 130]) await touchSwipe("#view", direction);
  for (let i = 0; i < 5; i++) { console.log(`ux checkpoint: sheet exit ${i + 1}/25`); await assertSheetExit(); }
  await page.locator("#more").click();
  await page.locator(".xbtn[aria-label=Close]").click();
  await page.waitForTimeout(240);
  for (let i = 0; i < 20; i++) { console.log(`ux checkpoint: sheet exit ${i + 6}/25`); await assertSheetExit(); }
  const frameStats = await stopFrameTrace();
  console.log("frame-time sample: " + JSON.stringify(frameStats));

  await page.goto(base + "#tab=species", { waitUntil: "domcontentloaded" }); await page.locator("#view[aria-busy=false]").waitFor();
  await page.locator(".species-avatar").first().click();
  await page.locator(".species-detail-photo").waitFor();
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });
  await page.locator("#more").click(); await page.getByRole("button", { name: "Image credits" }).click();
  assert.ok(await page.locator(".credits-list li").count() > 0, "Credits screen must list image manifest entries");
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });

  await page.evaluate(() => { location.hash = "tab=log"; });
  await page.waitForFunction(() => document.querySelector(".tab[aria-current=page]")?.dataset.tab === "log", null, { timeout: 3000 });
  await page.locator(".log-card").waitFor({ timeout: 3000 });
  await page.getByRole("button", { name: "Log a catch" }).click();
  await page.getByRole("button", { name: "Save catch" }).click();
  assert.ok(await page.locator(".field-error:not(:empty)").count(), "empty form should show inline validation errors");
  await page.locator("#catch-species").selectOption("whiting");
  await page.getByRole("button", { name: "Save catch" }).click();
  await page.locator(".log-entry").waitFor();
  await page.locator(".log-entry").first().click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator("#catch-count").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator(".log-entry").first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Delete this catch from this device?").waitFor();
  await page.getByRole("button", { name: "Delete catch" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".log-entry").length === 0, null, { timeout: 1000 });
  assert.equal(await page.getByRole("button", { name: "Export CSV" }).count(), 1);

  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ["dark", "night", "light"]) {
    if (theme === "light") { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Light", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    else if (theme === "night") { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Night", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    else { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Dark", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });
    for (const tab of ["today", "spots", "species", "plan", "log"]) {
      await page.locator(`.tabs .tab[data-tab=${tab}]`).evaluate((button) => button.click());
      await page.waitForFunction((name) => document.querySelector(".tab[aria-current=page]")?.dataset.tab === name, tab, { timeout: 3000 });
      await page.locator("#view[aria-busy=false]").waitFor();
      await page.waitForTimeout(320);
      await page.screenshot({ path: join(out, `${tab}-${theme}-375.png`), fullPage: true });
    }
  }

  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const tab of ["today", "spots", "species", "plan", "log"]) {
      await page.locator(`[data-tab=${tab}]`).click({ force: true }); await page.locator("#view[aria-busy=false]").waitFor();
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, farthest: Math.max(0, ...[...document.querySelectorAll("body *")].map((el) => el.getBoundingClientRect().right - innerWidth)) }));
      assert.ok(metrics.document <= width + 1 && metrics.farthest <= 1, `horizontal overflow at ${width}px on ${tab}: ${JSON.stringify(metrics)}`);
    }
  }
  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(" | ")}`);
  console.log("ux-ios: passed on " + browserName + "; 4 theme persistence cases, hash override, content swipes, tab-bar drags, long-name header checks (320/375/430 × 5 tabs), sheet close cycles, catch add/edit/delete/validation/export, screenshots, frame sample " + JSON.stringify(frameStats) + ", zero console errors.");
} finally {
  await context.close(); await browser.close(); server.close();
}
