import { GRID_FORECAST, weeklyOutlook, renderWeek } from "../shared/week.js?v=calc-20260930";
import { localDay } from "../v2/logic.js?v=calc-20260930";

const status = document.getElementById("week-status");
const chart = document.getElementById("week-chart");
let last = 0;

async function load() {
  try {
    const res = await fetch(GRID_FORECAST, { headers: { Accept: "application/geo+json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const props = (await res.json()).properties;
    const days = weeklyOutlook(props.periods, 7, { today: localDay(new Date()) });
    if (!days.length) throw new Error("empty");
    renderWeek(chart, days, { today: localDay(new Date()) });
    status.textContent = `NWS forecast · updated ${new Intl.DateTimeFormat(undefined, { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(props.updateTime))}`;
    last = Date.now();
  } catch {
    if (!last) { chart.replaceChildren(); status.textContent = "Forecast unavailable"; }
    else status.textContent += " · refresh failed";
  }
}
load();
setInterval(load, 15 * 60e3);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - last > 5 * 60e3) load(); });
document.getElementById("refresh")?.addEventListener("click", load);
