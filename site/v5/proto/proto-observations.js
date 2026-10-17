export function fmtWind(row) {
  const raw = row?.windSpeed;
  if (raw == null || raw === "") return "";
  const value = String(raw).trim();
  return `${row?.windDirection ? `${row.windDirection} ` : ""}${/\bmph\b/i.test(value) ? value : `${value} mph`}`.trim();
}

export function temperatureF(row) {
  const value = Number(row?.temperature ?? row?.temperatureC);
  if (!Number.isFinite(value)) return null;
  return row?.temperatureUnit === "C" || row?.temperatureC != null ? value * 9 / 5 + 32 : value;
}

// Published runs keep only the compact gridForecast; read the air temperature for `at` from it when no hourly row exists.
export function gridTemperatureF(run, locationId, at) {
  const t = +new Date(at);
  for (const o of run?.inputs?.observations ?? []) {
    if (o?.kind !== "gridForecast" || !o.ok || (o.locationId && o.locationId !== locationId)) continue;
    const row = (o.values?.temperature ?? []).find((x) => Date.parse(x?.validFrom) <= t && t < Date.parse(x?.validTo));
    if (row && row.value != null && Number.isFinite(+row.value)) return +row.value;
  }
  return null;
}

export function hourlyOutlook(suitability, insideWindow) {
  if (!insideWindow) return Number.isFinite(suitability) ? `Outside windows · fit ${suitability}` : "Outside windows";
  if (!Number.isFinite(suitability)) return "—";
  return suitability >= 70 ? "Great" : suitability >= 50 ? "Good" : "Poor";
}

export function observationRows(run, kind, locationId) {
  return (run?.inputs?.observations ?? []).filter((x) => x?.kind === kind && x?.ok && (!x.locationId || x.locationId === locationId)).flatMap((x) => {
    if (Array.isArray(x.values?.rows)) return x.values.rows;
    const values = x.values ?? {};
    if (kind === "waveForecast" && values.waveHeightM != null && Number.isFinite(+values.waveHeightM)) return [{ ...values, waveHeightM: +values.waveHeightM, time: values.time ?? x.validFrom ?? x.fetchedAt }];
    if (kind === "hourlyForecast" && (values.temperature != null || values.temperatureC != null || values.windSpeed != null)) return [{ ...values, temperature: values.temperature ?? values.temperatureC, temperatureUnit: values.temperatureUnit ?? (values.temperatureC != null ? "C" : "F"), time: values.time ?? x.validFrom ?? x.fetchedAt, startTime: values.startTime ?? x.validFrom ?? x.fetchedAt, endTime: values.endTime ?? x.validTo }];
    const time = values.time ?? x.observedAt ?? x.fetchedAt;
    if (kind === "waves" && values.waveHeightM != null && Number.isFinite(+values.waveHeightM)) return [{ ...values, waveHeightM: +values.waveHeightM, time }];
    // Buoys report Celsius; normalise so every reader can use temperatureF.
    if (kind === "waterTemperature" && values.temperatureF != null) return [{ ...values, time }];
    if (kind === "waterTemperature" && values.temperatureC != null && Number.isFinite(+values.temperatureC)) return [{ ...values, temperatureF: +values.temperatureC * 9 / 5 + 32, time }];
    return [];
  });
}

export function inPeriod(row, at) {
  const t = Date.parse(at), start = Date.parse(row?.startTime ?? row?.validFrom ?? row?.time), end = Date.parse(row?.endTime ?? row?.validTo);
  return Number.isFinite(t) && Number.isFinite(start) && start <= t && (!Number.isFinite(end) || t < end);
}

export function observationFor(rows, at) {
  const t = Date.parse(at);
  return rows.filter((row) => inPeriod(row, at) && Number.isFinite(Date.parse(row?.endTime ?? row?.validTo)))
    .sort((a, b) => Date.parse(b.startTime ?? b.validFrom ?? b.time) - Date.parse(a.startTime ?? a.validFrom ?? a.time))[0]
    ?? rows.filter((row) => Number.isFinite(Date.parse(row?.startTime ?? row?.validFrom ?? row?.time)))
      .sort((a, b) => Math.abs(Date.parse(a.startTime ?? a.validFrom ?? a.time) - t) - Math.abs(Date.parse(b.startTime ?? b.validFrom ?? b.time) - t))[0]
    ?? null;
}

// Tide direction at `at` from high/low predictions: heading to a high is incoming, to a low outgoing; within 20 min of a turn it's slack.
export function tideDirectionAt(rows, at) {
  const t = +new Date(at);
  const events = (rows ?? []).map((x) => ({ t: Date.parse(x.time), type: String(x.type ?? "").toUpperCase() }))
    .filter((x) => Number.isFinite(x.t) && (x.type === "H" || x.type === "L")).sort((a, b) => a.t - b.t);
  const next = events.find((x) => x.t > t), prev = events.filter((x) => x.t <= t).at(-1);
  if (!Number.isFinite(t) || !next) return null;
  if (next.t - t <= 20 * 60e3 || (prev && t - prev.t <= 20 * 60e3)) return "slack";
  return next.type === "H" ? "incoming" : "outgoing";
}

export function tideChartXPositions(rows) {
  if (!rows.length) return [];
  const start = Date.parse(rows[0].time), span = Math.max(1, Date.parse(rows.at(-1).time) - start);
  return rows.map((row) => (Date.parse(row.time) - start) / span * 100);
}

export function waveHeightFeetLabel(wave, mode) {
  if (mode === "inshore" || wave?.waveHeightM == null || !Number.isFinite(+wave.waveHeightM)) return null;
  return `${(+wave.waveHeightM * 3.28084).toFixed(1)} ft`;
}
