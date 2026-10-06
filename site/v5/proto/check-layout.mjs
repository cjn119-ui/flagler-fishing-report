const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (el) => {
  const style = getComputedStyle(el), r = el.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && r.width > 0 && r.height > 0;
};
const textRects = (el) => {
  const box = (x) => x.getBoundingClientRect();
  const clips = [el];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(hidden|clip|auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`)) clips.push(p);
  }
  return [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).flatMap((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    return [...range.getClientRects()].map((r) => {
      let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
      for (const c of clips) { const b=box(c); left=Math.max(left,b.left); right=Math.min(right,b.right); top=Math.max(top,b.top); bottom=Math.min(bottom,b.bottom); }
      return {left,right,top,bottom,width:right-left,height:bottom-top};
    }).filter((r) => r.width > 0 && r.height > 0);
  });
};
const clipped = (el, r) => {
  const own = getComputedStyle(el);
  if (own.textOverflow === "ellipsis" || Number.parseInt(own.webkitLineClamp,10) > 0) return false;
  if (r.left < -1 || r.right > innerWidth + 1) return true;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p), pr = p.getBoundingClientRect();
    if (/(hidden|clip|auto|scroll)/.test(s.overflowX) && (r.left < pr.left - 1 || r.right > pr.right + 1)) {
      if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") return false;
      return true;
    }
  }
  return false;
};
function inspect(label) {
  const texts = [...document.querySelectorAll("body *")].filter((el) => visible(el) && !el.closest("#review,.sr-only,a.skip,[aria-hidden='true'],details:not([open])") &&
    (!document.querySelector(".sheet") || el.closest(".sheet")) &&
    textRects(el).some((r) => r.width && r.height));
  const overlaps = [], clips = [];
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i], ars = textRects(a);
    const style=getComputedStyle(a), hiddenText=/(hidden|clip)/.test(style.overflowX) && a.scrollWidth>a.clientWidth+1 && style.textOverflow!=="ellipsis" && Number.parseInt(style.webkitLineClamp,10)<1;
    if (hiddenText || ars.some((r) => clipped(a, r))) clips.push(`${label}: ${a.tagName}.${a.className || ""}(${a.textContent.trim().slice(0,42)}) clipped`);
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.closest("#tabbar") || b.closest("#tabbar")) continue;
      const brs = textRects(b);
      if (ars.some((ar) => brs.some((br) => Math.min(ar.right, br.right) - Math.max(ar.left, br.left) > 2 &&
          Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top) > 2)))
        overlaps.push(`${label}: ${a.tagName}.${a.className || ""}(${a.textContent.trim().slice(0,24)}) × ${b.tagName}.${b.className || ""}(${b.textContent.trim().slice(0,24)})`);
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1)
    clips.push(`${label}: horizontal scroll ${document.documentElement.scrollWidth}/${innerWidth}`);
  return { overlaps, clips };
}
const click = async (selector) => { const el = document.querySelector(selector); if (!el) return false; el.click(); await wait(); return true; };
async function closeSheet() { if (document.querySelector(".sheet")) { await click(".sheet .xbtn"); await wait(60); } }

export async function run() {
  await wait(800);
  const all = { width: innerWidth, height: innerHeight, states: {}, totals: { cases: 0, overlap: 0, clipped: 0 }, findings: [] };
  const states = [...document.querySelectorAll("#review-states button")];
  for (const state of states) {
    state.click(); await wait(140);
    const stateId = state.dataset.id, stateOut = all.states[stateId] = {};
    for (const theme of ["light", "dark"]) {
      await click(`#review-themes button[data-id="${theme}"]`);
      const themeOut = stateOut[theme] = {};
      for (const tab of ["today", "spots", "species", "plan"]) {
      await click(`.tab[data-tab="${tab}"]`);
      await wait(80);
        window.scrollTo(0,0);
        const key = `${stateId}/${theme}/${tab}`;
        const found = inspect(key); all.findings.push(...found.overlaps, ...found.clips);
        const nav = document.querySelector("#tabbar"), content = document.querySelector("#view");
        if (nav && matchMedia("(max-width:899px)").matches) {
          window.scrollTo(0,document.documentElement.scrollHeight); await wait(16);
          const last = [...content.children].filter(visible).at(-1), nr = nav.getBoundingClientRect(), lr = last?.getBoundingClientRect();
          if (lr && lr.bottom > nr.top + 1 && lr.top < nr.bottom) all.findings.push(`${key}: last content overlaps floating tabs`);
          window.scrollTo(0,0);
        }
        themeOut[tab] = { overlap: found.overlaps.length, clipped: found.clips.length };
        all.totals.cases++;
        await closeSheet();
        if (await click("#spot-pill")) {
          const sf = inspect(`${key}/spot-sheet`); all.findings.push(...sf.overlaps, ...sf.clips);
          all.totals.cases++; themeOut[`${tab}+spot-sheet`] = { overlap: sf.overlaps.length, clipped: sf.clips.length };
          await closeSheet();
        }
      }
      await click('.tab[data-tab="species"]');
      const fish = document.querySelector(".sp");
      if (fish) {
        fish.click(); await wait(100);
        const sf = inspect(`${stateId}/${theme}/species-sheet`); all.findings.push(...sf.overlaps, ...sf.clips);
        all.totals.cases++; themeOut["species-sheet"] = { overlap: sf.overlaps.length, clipped: sf.clips.length };
        await closeSheet();
      }
    }
  }
  all.totals.overlap = all.findings.filter((x) => x.includes(" × ")).length;
  all.totals.clipped = all.findings.length - all.totals.overlap;
  document.documentElement.dataset.layoutAudit = "complete";
  const output = document.createElement("pre"); output.id = "layout-audit-output";
  output.textContent = JSON.stringify(all, null, 2); output.style.cssText = "position:fixed;z-index:99999;inset:8px auto auto 8px;max-width:90vw;max-height:80vh;overflow:auto;background:#fff;color:#111;padding:12px;font:12px monospace";
  document.body.append(output); window.__layoutAudit = all;
  console.info("LAYOUT_AUDIT", JSON.stringify({ width: all.width, totals: all.totals, findings: all.findings.slice(0, 30) }));
  return all;
}
