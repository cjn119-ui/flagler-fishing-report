import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const liveMode = process.env.UX_LIVE === "1";
const out = join(root, `.agent-handoff/shots/r/${liveMode ? "live" : "sample"}`);
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { webkit, chromium, firefox, devices } = require("/opt/homebrew/lib/node_modules/playwright");
const sampleToday = await readFile(join(root, "ios-www/v5/proto/sample-rich.json"), "utf8");
const sampleTomorrow = await readFile(join(root, "ios-www/v5/proto/sample-rich-tomorrow.json"), "utf8");
let todayBody = sampleToday, tomorrowBody = sampleTomorrow;
if (liveMode) {
  const [today, tomorrow] = await Promise.all(["today", "tomorrow"].map(horizon => readFile(join(root, `ios-www/api/v5/${horizon}.json`), "utf8")));
  todayBody = today; tomorrowBody = tomorrow;
  console.log("ux-ios: running against live API reports copied into scratch ios-www/api/v5.");
}
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
  const body = route.request().url().includes("tomorrow") ? tomorrowBody : todayBody;
  await route.fulfill({ status: 200, contentType: "application/json", body });
});
const page = await context.newPage();
const touchCdp = browserName === "Chromium" ? await context.newCDPSession(page) : null;
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => consoleErrors.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
await page.clock.install({ time: new Date(liveMode ? `${JSON.parse(todayBody).targetDate}T08:00:00-04:00` : "2026-10-07T12:00:00-04:00") });

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
  await page.locator(".more-sheet .appearance").getByRole("button", { name, exact: true }).evaluate((button) => button.click());
  const values = { Auto: "auto", Dark: "dark", Night: "night", Light: "light" };
  await page.waitForFunction((v) => localStorage.getItem("v5proto.theme") === JSON.stringify(v), values[name], { timeout: 5000 }).catch(async (error) => {
    console.log("appearance debug", { requested: name, stored: await page.evaluate(() => localStorage.getItem("v5proto.theme")), preference: await page.locator("html").getAttribute("data-theme-preference"), buttons: await page.locator(".more-sheet .appearance button").evaluateAll((items) => items.map((button) => [button.textContent, button.getAttribute("aria-pressed")])), errors: consoleErrors }); throw error;
  });
  await page.locator(".xbtn[aria-label=Close]").evaluate((button) => button.click());
  await page.waitForTimeout(250);
}
async function touchSwipe(selector, dx, dy = 0) {
  if (selector !== "#view") await page.locator(selector).scrollIntoViewIfNeeded();
  const coords = await page.locator(selector).evaluate((el) => {
    const safe = el.id === "view" ? el.querySelector(".page-heading") ?? el.querySelector("#verdict") ?? el.querySelector(".card-h") ?? el : el;
    const box = safe.getBoundingClientRect(), x = Math.max(24, Math.min(innerWidth - 24, innerWidth / 2)), y = el.matches(".scrub") ? box.top + box.height / 2 : Math.max(24, Math.min(innerHeight - 120, box.top + box.height / 2));
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
  await page.waitForTimeout(650);
}
async function cleanNavigationState(tab) {
  await page.waitForFunction((name) => document.querySelector('.tab[aria-current="page"]')?.dataset.tab === name, tab, { timeout: 3000 });
  await page.waitForTimeout(390);
  const state = await page.evaluate(() => ({
    active: document.querySelector('.tab[aria-current="page"]')?.dataset.tab,
    peeks: document.querySelectorAll(".tab-peek").length,
    viewTransform: document.querySelector("#view").style.transform,
    tabIndex: document.querySelector(".tabs").style.getPropertyValue("--tab-i"),
    vIn: document.querySelector("#view").classList.contains("v-in"),
    stagger: document.querySelector("#view .stagger") !== null
  }));
  assert.equal(state.active, tab, `active tab settles on ${tab}`);
  assert.equal(state.peeks, 0, "no swipe preview remains after navigation");
  assert.equal(state.viewTransform, "", "#view has no inline transform after navigation");
  assert.equal(state.tabIndex, "", "inline --tab-i is unset after navigation");
  assert.equal(state.vIn, false, "tab slide does not apply the rise class");
  assert.equal(state.stagger, false, "tab slide does not replay stagger classes");
}
async function dragSheet(distance, steps, delay) {
  const box = await page.locator(".sheet-b").boundingBox();
  const x = box.x + Math.min(18, box.width / 8), y = box.y + Math.min(18, box.height / 8);
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + distance * i / steps);
    if (delay) await page.waitForTimeout(delay);
  }
  await page.mouse.up();
}
async function dragTabbar(fromIndex, toIndex) {
  const box = await page.locator(".tabs").boundingBox();
  const x = (index) => box.x + box.width * ((index + .5) / 5), y = box.y + box.height / 2;
  await page.mouse.move(x(fromIndex), y); await page.mouse.down();
  for (let step = 1; step <= 5; step++) await page.mouse.move(x(fromIndex + (toIndex - fromIndex) * step / 5), y);
  await page.mouse.up();
  const target = ["today", "spots", "species", "plan", "log"][toIndex];
  await page.waitForFunction((tab) => document.querySelector('.tab[aria-current="page"]')?.dataset.tab === tab, target, { timeout: 3000 });
  await page.waitForTimeout(360);
}
async function dragSegment(fromIndex, toIndex) {
  const box=await page.locator(".seg.day").boundingBox(), x=(index)=>box.x+box.width*((index+.5)/2), y=box.y+box.height/2;
  await page.mouse.move(x(fromIndex),y); await page.mouse.down();
  for(let step=1;step<=5;step++) await page.mouse.move(x(fromIndex+(toIndex-fromIndex)*step/5),y);
  await page.mouse.up(); await page.waitForTimeout(420);
}
async function assertSheetExit() {
  await page.locator("#more").click();
  await page.locator(".sheet").waitFor();
  const elapsed = await page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector("#sheet-root"), panel = root.querySelector(".sheet"), start = performance.now();
    const observer = new MutationObserver(() => { if (!root.contains(panel)) { observer.disconnect(); resolve(performance.now() - start); } });
    observer.observe(root, { childList: true, subtree: true });
    document.querySelector(".xbtn[aria-label=Close]").click();
  }));
  assert.ok(elapsed >= 170 && elapsed <= 600, `sheet removal must follow its exit animation (observed ${elapsed.toFixed(1)}ms)`);
}
async function assertButtonContrast() {
  const failures = await page.evaluate(() => {
    const rgb = (value) => { const nums=value.match(/[\d.]+/g)?.map(Number); return nums?.length>=3?nums.slice(0,3).map((x)=>x/255):null; };
    const lum = (value) => { const c=rgb(value); if(!c)return null; const [r,g,b]=c.map((x)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4); return .2126*r+.7152*g+.0722*b; };
    return [...document.querySelectorAll(".btn")].filter((button)=>button.getClientRects().length&&getComputedStyle(button).visibility==="visible").map((button)=>{const s=getComputedStyle(button),a=lum(s.color),b=lum(s.backgroundColor);return {label:button.innerText.trim(),ratio:a==null||b==null?0:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:s.color,background:s.backgroundColor};}).filter((x)=>x.ratio<4.5);
  });
  assert.deepEqual(failures, [], `every visible .btn must meet 4.5:1 text contrast: ${JSON.stringify(failures)}`);
}
async function loadVisibleImages() {
  await page.evaluate(async () => {
    const images=[...document.images];
    for (const image of images) image.loading="eager";
    for (let y=0; y<document.body.scrollHeight; y+=Math.max(400,innerHeight*.75)) { window.scrollTo(0,y); await new Promise(requestAnimationFrame); }
    const loaded=Promise.all(images.map((image)=>image.complete?Promise.resolve():new Promise((resolve)=>{image.addEventListener("load",resolve,{once:true});image.addEventListener("error",resolve,{once:true});})));
    await Promise.race([loaded,new Promise((resolve)=>setTimeout(resolve,8000))]);
    await Promise.all(images.filter((image)=>image.complete&&image.naturalWidth>0).map((image)=>image.decode().catch(()=>{})));
    window.scrollTo(0,0);
  });
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
  assert.doesNotMatch(await page.locator("#verdict .bet .mchip").innerText().catch(()=>""), /^Pier$/i, "default verdict must not recommend closed pier fishing");
  await page.locator(".why-verdict > summary").click();
  const openDisclosureCount = await page.locator("#view details[open]").count();
  await page.clock.fastForward(60_000);
  assert.equal(await page.locator("#view details[open]").count(), openDisclosureCount, "minute re-render preserves open disclosures");
  await page.locator(".seg.day").waitFor();
  assert.equal(await page.locator(".today-hero .condition-cell").count(), 4, "Today keeps all four compact hero condition cells visible");
  const heroGeometry = await page.evaluate(() => { const v = document.querySelector("#verdict").getBoundingClientRect(); return [...document.querySelectorAll(".today-hero .condition-cell")].map(el => ({ label: el.querySelector("small")?.textContent, bottom: el.getBoundingClientRect().bottom, verdictTop: v.top })); });
  assert.ok(heroGeometry.every(x => x.bottom <= x.verdictTop + 3), `hero conditions remain visible above the verdict: ${JSON.stringify(heroGeometry)}`);
  await dragSegment(0,1); assert.equal(await page.locator(".seg.day button[aria-pressed=true]").innerText(),"Tomorrow","report-day indicator drag commits the nearer option");
  await dragSegment(1,0); assert.equal(await page.locator(".seg.day button[aria-pressed=true]").innerText(),"Today","report-day drag snaps back to Today");
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
  if (liveMode) {
    await page.goto(`${base}#spot=staug-pier&mode=pier&tab=today`, { waitUntil: "domcontentloaded" }); await page.locator("#view[aria-busy=false]").waitFor();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("mode"), "surf", "closed mode in the hash is coerced to an open mode");
    await page.evaluate(() => { history.replaceState(null,"",location.pathname); localStorage.setItem("v5proto.spot", JSON.stringify({spot:"staug-pier",mode:"pier"})); });
    await reloadApp();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("mode"), "surf", "saved closed mode is coerced to an open mode");
    await page.goto(`${base}#tab=species`, { waitUntil: "domcontentloaded" }); await page.locator("#view[aria-busy=false]").waitFor();
    await page.locator('[data-fk="sp-sheepshead"]').click(); await page.locator(".species-detail").waitFor();
    assert.equal(await page.getByRole("button", { name: "Target this" }).isDisabled(), true, "closed St Augustine Pier focus cannot target sheepshead");
    await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({state:"detached",timeout:1000});
    await page.evaluate(() => localStorage.removeItem("v5proto.spot"));
    await openApp();
  }

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

  const tapSlide = await page.evaluate(() => {
    document.querySelector('.tab[data-tab="spots"]').click();
    const animation = [...document.querySelector("#view").getAnimations()].find((item) => item.effect?.getKeyframes().some((frame) => frame.transform));
    return { keyframes: animation?.effect?.getKeyframes() ?? [], vIn: document.querySelector("#view").classList.contains("v-in"), stagger: !!document.querySelector("#view .stagger") };
  });
  assert.equal(tapSlide.keyframes[0]?.transform, `translateX(${await page.evaluate(() => innerWidth)}px)`, `Today to Spots tap enters from the next tab direction: ${JSON.stringify(tapSlide.keyframes)}`);
  assert.equal(tapSlide.vIn, false, "tap navigation does not run v-in");
  assert.equal(tapSlide.stagger, false, "tap navigation does not replay stagger");
  await cleanNavigationState("spots");

  await startFrameTrace();
  await touchSwipe("#view", -128);
  await cleanNavigationState("species");
  const swipeFrameStats = await stopFrameTrace();

  await page.evaluate(() => {
    for (const tab of ["today", "spots", "species"]) document.querySelector(`.tab[data-tab="${tab}"]`).click();
  });
  await cleanNavigationState("species");
  await page.locator('.tab[data-tab="plan"]').evaluate((button) => button.click());
  await touchSwipe("#view", -128);
  await cleanNavigationState("log");

  await page.locator('.tab[data-tab="today"]').evaluate((button) => button.click());
  await page.locator("#more").evaluate((button) => button.click());
  await page.locator(".sheet").waitFor();
  const interruptedBySheet = await page.evaluate(() => ({ peeks: document.querySelectorAll(".tab-peek").length, viewTransform: document.querySelector("#view").style.transform, tabIndex: document.querySelector(".tabs").style.getPropertyValue("--tab-i") }));
  assert.deepEqual(interruptedBySheet, { peeks: 0, viewTransform: "", tabIndex: "" }, "opening a sheet during a tab slide clears transient tab state");
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });

  await page.locator("#more").click(); await page.locator(".sheet").waitFor(); await page.waitForTimeout(330);
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });
  await page.locator("#more").click(); await page.locator(".sheet").waitFor(); await page.waitForTimeout(330);
  await startFrameTrace();
  await dragSheet(40, 1, 0);
  await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });
  await page.locator("#more").click(); await page.locator(".sheet").waitFor(); await page.waitForTimeout(330);
  await dragSheet(26, 4, 55);
  await page.waitForTimeout(420);
  assert.equal(await page.locator(".sheet").count(), 1, "slow small sheet drag springs back without closing");
  assert.equal(await page.locator(".sheet").evaluate((panel) => panel.style.transform), "", "sheet drag settles without a leftover transform");
  const sheetFrameStats = await stopFrameTrace();
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('.tab[data-tab="today"]').evaluate((button) => button.click());
  const reducedState = await page.evaluate(() => ({
    view: getComputedStyle(document.querySelector("#view")).transform,
    pill: getComputedStyle(document.querySelector(".tabs"), "::before").transform,
    animationTransforms: [...document.querySelector("#view").getAnimations()].flatMap((animation) => animation.effect?.getKeyframes() ?? []).filter((frame) => frame.transform && frame.transform !== "none")
  }));
  assert.equal(reducedState.view, "none", `reduced tab transition uses opacity only: ${JSON.stringify(reducedState)}`);
  assert.equal(reducedState.pill, "none", "reduced tab indicator does not transform");
  assert.deepEqual(reducedState.animationTransforms, [], "reduced tab animation has no transform keyframes");
  await page.locator("#more").click(); await page.locator(".sheet").waitFor();
  assert.equal(await page.locator(".sheet").evaluate((panel) => getComputedStyle(panel).transform), "none", "reduced sheet entrance does not transform");
  await page.locator(".xbtn[aria-label=Close]").click(); await page.locator(".sheet").waitFor({ state: "detached", timeout: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openApp();
  console.log("motion frame-time sample: " + JSON.stringify({ swipe: swipeFrameStats, sheetDrag: sheetFrameStats }));

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
  await page.getByRole("button", { name: "Log your first catch" }).click();
  await page.getByRole("button", { name: "Save catch" }).click();
  assert.ok(await page.locator(".field-error:not(:empty)").count(), "empty form should show inline validation errors");
  await page.locator("#catch-species").selectOption("whiting");
  const catchRun = JSON.parse(liveMode ? todayBody : sampleToday);
  await page.locator("#catch-occurredAt").fill(`${catchRun.targetDate}T08:00`);
  await page.getByRole("button", { name: "Save catch" }).click();
  await page.locator(".log-entry").waitFor();
  const savedCatch = await page.evaluate(() => JSON.parse(localStorage.getItem("v5proto.catches"))[0]);
  assert.equal(savedCatch.occurredAt, `${catchRun.targetDate}T12:00:00.000Z`, "datetime-local catch time is interpreted as America/New_York");
  assert.equal(savedCatch.context.runGeneratedAt, catchRun.generatedAt, "catch context uses the report whose targetDate matches the catch date");
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
      assert.equal(await page.locator(".seg.day").count(), tab === "log" || tab === "plan" ? 0 : 1, `report-day control visibility on ${tab}`);
      console.log(`ux screenshot: ${tab}/${theme}`);
      await assertButtonContrast();
      await loadVisibleImages();
      const brokenImages=await page.evaluate(()=>[...document.querySelectorAll("img.photo")].filter((image)=>!image.classList.contains("photo-placeholder")&&image.naturalWidth===0).map((image)=>image.alt||image.src));
      assert.deepEqual(brokenImages,[],`photos must decode when scrolled into view on ${tab}/${theme}`);
      if(tab==="today"&&liveMode){
        const height=await page.evaluate(()=>document.documentElement.scrollHeight);
        assert.ok(height<=2.3*812,`live Today height ${height}px exceeds 2.3 screen heights`);
      }
      if(tab==="plan") {
        const metrics=await page.locator(".hourly-scroll").count() ? await page.locator(".hourly-scroll").evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,labels:[...el.querySelectorAll("th")].map(x=>x.innerText)})) : null;
        if(metrics) { assert.ok(metrics.scroll<=metrics.client+1,`hourly forecast fits viewport: ${JSON.stringify(metrics)}`); assert.deepEqual(metrics.labels,["Time","Sky","Conditions","Outlook"]); }
      }
      if(tab==="spots"){
        await page.evaluate(()=>{location.hash="spot=flagler-pier&tab=spots";});
        await page.waitForFunction(()=>location.hash.includes("flagler-pier"));
        assert.ok(await page.getByText("Closed · est. reopen Jan 2027",{exact:true}).count(),"Flagler closure badge appears beside the title");
        assert.equal(await page.getByText("Photo: 2016, before Hurricane Ian",{exact:true}).count(),0,"historical caption is hidden outside detail");
        await page.locator(".spot-feature .btn").click();
        await page.locator(".closure-detail").waitFor();
        assert.ok(await page.getByText("Photo: 2016, before Hurricane Ian",{exact:true}).count(),"historical caption appears in detail");
        assert.ok((await page.locator(".closure-detail").innerText()).includes("January 2027"),"Flagler detail explains its estimated reopening month");
        assert.ok(await page.locator('.closure-detail a[href="https://www.cityofflaglerbeach.com/thepier"]').count(),"Flagler detail includes the source link");
        await page.locator(".xbtn[aria-label=Close]").click();
        await page.locator(".sheet").waitFor({state:"detached",timeout:1000});
        await page.goto(`${base}#tab=spots`,{waitUntil:"domcontentloaded"}); await page.locator("#view[aria-busy=false]").waitFor();
      }
      if (process.env.UX_NO_SCREENSHOTS !== "1") await page.screenshot({ path: join(out, `${tab}-${theme}-375.png`), fullPage: true });
    }
  }

  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const tab of ["today", "spots", "species", "plan", "log"]) {
      await page.locator(`[data-tab=${tab}]`).click({ force: true }); await page.locator("#view[aria-busy=false]").waitFor();
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => {
        const overflow = ["#app", "#tabbar", "#sheet-root"].map((selector) => [selector, document.querySelector(selector)?.getBoundingClientRect()]).filter(([, rect]) => rect).map(([selector, rect]) => ({ selector, left: Math.round(rect.left), right: Math.round(rect.right) })).filter((rect) => rect.right > innerWidth + 1 || rect.left < -1);
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, farthest: Math.max(0, ...overflow.map((el) => el.right - innerWidth)), overflow };
      });
      assert.ok(metrics.document <= width + 1 && metrics.body <= width + 1 && metrics.farthest <= 1, `page horizontal overflow at ${width}px on ${tab}: ${JSON.stringify(metrics)}`);
    }
  }
  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(" | ")}`);
  console.log("ux-ios: passed on " + browserName + "; 4 theme persistence cases, hash override, motion direction/settling/rapid input/interruption/sheet flick/reduced-motion checks, content swipes, tab-bar drags, long-name header checks (320/375/430 × 5 tabs), sheet close cycles, catch add/edit/delete/validation/export, " + (process.env.UX_NO_SCREENSHOTS === "1" ? "screenshots skipped (UX_NO_SCREENSHOTS=1), " : "screenshots, ") + "frame samples " + JSON.stringify({ overall: frameStats, swipe: swipeFrameStats, sheetDrag: sheetFrameStats }) + ", zero console errors.");
} finally {
  await context.close(); await browser.close(); server.close();
}
