import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".agent-handoff/shots/ux");
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { webkit, chromium, firefox, devices } = require("/opt/homebrew/lib/node_modules/playwright");
const sampleToday = await readFile(join(root, "ios-www/v5/proto/sample-rich.json"), "utf8");
const sampleTomorrow = await readFile(join(root, "ios-www/v5/proto/sample-rich-tomorrow.json"), "utf8");
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", join(root, "ios-www")], { stdio: "ignore" });
const base = `http://127.0.0.1:${port}/v5/proto/index.html`;
let serverReady = false;
for (let attempt = 0; attempt < 50; attempt++) {
  if (server.exitCode != null) break;
  try { const response = await fetch(base); if (response.ok) { serverReady = true; break; } } catch { /* wait for python http.server to bind */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!serverReady) { server.kill(); throw new Error("python3 -m http.server did not become ready on its reserved local port"); }
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
if (!browser) { server.kill(); throw new Error(`No installed Playwright browser is available. ${failures.join("; ")}`); }
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
    console.log("startup debug", { errors: consoleErrors, html: (await page.locator("body").innerText()).slice(0, 500), serverExitCode: server.exitCode, url: page.url() }); throw error;
  });
}
async function reloadApp() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#view[aria-busy=false]").waitFor({ timeout: 8000 }).catch(async (error) => {
    console.log("reload debug", { errors: consoleErrors, html: (await page.locator("body").innerText()).slice(0, 400), serverExitCode: server.exitCode, url: page.url() }); throw error;
  });
}
async function setAppearance(name) {
  await page.locator("#more").click();
  await page.locator(".more-sheet .appearance").getByRole("button", { name, exact: true }).click();
  const values = { Auto: "auto", Dark: "dark", Night: "night", Light: "light" };
  await page.waitForFunction((v) => localStorage.getItem("v5proto.theme") === JSON.stringify(v), values[name]);
  await page.locator(".xbtn[aria-label=Close]").click();
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
  await page.waitForTimeout(300);
}

try {
  await openApp();
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

  await page.locator("[data-tab=log]").click({ force: true });
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
  assert.equal(await page.locator(".log-entry").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Export CSV" }).count(), 1);

  for (const theme of ["dark", "night", "light"]) {
    if (theme === "light") { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Light", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    else if (theme === "night") { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Night", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    else { await page.locator("#more").click(); await page.locator(".more-sheet .appearance").getByRole("button", { name: "Dark", exact: true }).click(); await page.locator(".xbtn[aria-label=Close]").click(); }
    for (const tab of ["today", "spots", "species", "plan", "log"]) {
      await page.locator(`[data-tab=${tab}]`).click({ force: true });
      await page.locator("#view[aria-busy=false]").waitFor();
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
  console.log(`ux-ios: passed on ${browserName}; 4 theme persistence cases, hash override, 10 tab swipes, catch add/edit/delete/validation/export, 15 screenshots, 20 viewport checks, zero console errors.`);
} finally {
  await context.close(); await browser.close(); server.kill();
}
