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

export function hourlyOutlook(suitability, insideWindow) {
  if (!insideWindow) return "Outside window";
  if (!Number.isFinite(suitability)) return "—";
  return suitability >= 70 ? "Great" : suitability >= 50 ? "Good" : "Poor";
}

export function observationRows(run, kind, locationId) {
  return (run?.inputs?.observations ?? []).filter((x) => x?.kind === kind && x?.ok && (!x.locationId || x.locationId === locationId)).flatMap((x) => {
    if (Array.isArray(x.values?.rows)) return x.values.rows;
    const values = x.values ?? {};
    if (kind === "waveForecast" && values.waveHeightM != null && Number.isFinite(+values.waveHeightM)) return [{ ...values, waveHeightM: +values.waveHeightM, time: values.time ?? x.validFrom ?? x.fetchedAt }];
    if (kind === "hourlyForecast" && (values.temperature != null || values.temperatureC != null || values.windSpeed != null)) return [{ ...values, temperature: values.temperature ?? values.temperatureC, temperatureUnit: values.temperatureUnit ?? (values.temperatureC != null ? "C" : "F"), time: values.time ?? x.validFrom ?? x.fetchedAt, startTime: values.startTime ?? x.validFrom ?? x.fetchedAt, endTime: values.endTime ?? x.validTo }];
    if (kind === "waterTemperature" && values.temperatureF != null) return [values];
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
