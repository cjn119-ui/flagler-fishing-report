const REFRESH_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const els = Object.fromEntries(['refresh','freshness','conditions-freshness','updated','notice','report-date','report-content','connection'].map(id => [id, document.getElementById(id)]));
const LIVE = {weather:{path:'api/live/weather.json', stale:2*60*60*1000}, marine:{path:'api/live/marine.json', stale:3*60*60*1000}, tides:{path:'api/live/tides.json', stale:0}};
let refreshing = false;

function setFreshness(kind, text, target = els.freshness) {
  target.className = `freshness ${kind}`;
  target.querySelector('span').textContent = text;
}
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
const speciesSentenceSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('en', {granularity:'sentence'}) : null;
function firstSpeciesSentence(item) {
  const original = String(item).trim();
  if (!original || !speciesSentenceSegmenter) return original;
  const first = speciesSentenceSegmenter.segment(original)[Symbol.iterator]().next().value?.segment;
  return first?.trim() || original;
}
function renderReport(data) {
  // Keep source references readable as escaped plain text in the report.
  const clean = String(data.report_text || '').replace(/\s+\|\s+/g, ' · ');
  const sourceHeading = /^(OUTLOOK|WEATHER(?:\s+SUMMARY)?(?:\s*[—-]\s*PALM COAST)?|PALM COAST WEATHER|FLAGLER BEACH\s*[—-]\s*SURF,\s*TIDES\s*&\s*OUTLOOK|LIKELY FISH\s*&\s*APPROACH|CONDITIONS|BEACH CONDITIONS|FLAGLER BEACH CONDITIONS|SURF\s*&\s*SAFETY|SURF\/MARINE|MARINE(?: CONDITIONS)?|TIDES?|LOW\s*\/\s*HIGH TIDE|FISHING CONDITIONS(?:\s*[—-]\s*FLAGLER BEACH)?|FISHING APPROACH|BEST FISHING WINDOWS?|FISHING WINDOWS?|LIKELY SPECIES(?:\s*&\s*APPROACH)?|SPECIES|EARLY OBSERVATIONS|SOURCES|HAZARDS|WEATHER HAZARDS|SAFETY)(?:\s*\([^)]*\))?(?:\s*:\s*(.*)|\s+[•*-]\s*(.*))?$/i;
  const groups = [
    {key:'conditions', title:'Conditions', icon:'<path d="M4 15.5a4.5 4.5 0 0 1 4.3-4.5A5.8 5.8 0 0 1 19.5 13a3.5 3.5 0 0 1-.5 7H8a4 4 0 0 1-4-4.5Z"/><path d="m7 22 1.5-2M12 22l1.5-2M17 22l1.5-2"/>', empty:'No weather or marine detail is included in this report.', emptyPreview:'No weather or marine detail in the report'},
    {key:'tides', title:'Tides', icon:'<path d="M3 18h18M4 14l5-5 4 3 7-8"/><circle cx="9" cy="9" r="1"/><circle cx="13" cy="12" r="1"/>', empty:'No tide information is included in this report.', emptyPreview:'No tide information in the report'},
    {key:'hazards', title:'Hazards', icon:'<path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v4M12 16h.01"/>', empty:'No hazards are listed in this report.', emptyPreview:'No hazards listed in the report'},
    {key:'notes', title:'Report Notes', icon:'<path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 4v5h5M9 13h6M9 17h6"/>', empty:'No additional notes are included in this report.', emptyPreview:'No additional report notes'},
    {key:'windows', title:'Fishing Windows', icon:'<path d="M4 20 20 4M8 4h12v12"/><path d="M5 13.5a3.5 3.5 0 1 0 5 5M3 21l4-4"/>', empty:'No fishing-window guidance is included in this report.', emptyPreview:'No fishing-window guidance in the report'},
    {key:'species', title:'Likely Species', icon:'<path d="M3 12c3.2-4.3 8.7-6.3 14-4.7l4 2.2-4 2.3c-5.3 1.9-10.8-.1-14-4.8Z"/><path d="M17 9.7 21 7v10l-4-2.7M8 10.2h.01"/>', empty:'No source-backed species guidance is included in this report.', emptyPreview:'No species guidance in the report'},
    {key:'sources', title:'Sources', icon:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>', empty:'No source list is included in this report.', emptyPreview:'No report sources listed'}
  ].map(group => ({...group, bullets:[], subsections:[]}));
  const groupFor = key => groups.find(group => group.key === key);
  const addContent = (key, subsection, bullets) => {
    const group = groupFor(key);
    if (!subsection) { group.bullets.push(...bullets); return; }
    let part = group.subsections.find(candidate => candidate.title === subsection);
    if (!part) { part = {title:subsection, bullets:[]}; group.subsections.push(part); }
    part.bullets.push(...bullets);
  };

  for (const block of clean.split(/\n\s*\n/)) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const headingLine = lines[0].replace(/^[^A-Za-z0-9]+/, '').trim();
    // Skip only the generated report's location/date title. Other Palm Coast
    // headings (for example, PALM COAST WEATHER) contain report content.
    if (/^Palm Coast\s*\/\s*Flagler Beach\s*[—-]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s+\d{4})?$/i.test(headingLine)) continue;
    const dateOnly = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s+\d{4})?$/i;
    if (dateOnly.test(headingLine)) continue;
    const match = headingLine.match(sourceHeading);
    const rawTitle = match ? match[1].replace(/\s+/g, ' ').toUpperCase() : 'REPORT NOTES';
    const bodyLines = match ? [match[2] || match[3] || '', ...lines.slice(1)].filter(Boolean) : lines;
    const bullets = bodyLines.flatMap(line => {
      const normalized = line.replace(/\s+/g, ' ').trim();
      const bullet = normalized.match(/^[•*-]\s+(.*)$/);
      return bullet ? [bullet[1].trim()].filter(Boolean) : [normalized].filter(Boolean);
    });
    const safety = [];
    const regularBullets = [];
    for (const bullet of bullets) {
      const safetyMatch = bullet.match(/^Safety:\s*(.*)$/i);
      if (safetyMatch) safety.push(safetyMatch[1]);
      else regularBullets.push(bullet);
    }

    if (/^FISHING CONDITIONS(?: — FLAGLER BEACH| - FLAGLER BEACH)?$/.test(rawTitle)) {
      for (const bullet of regularBullets) {
        const labeled = bullet.match(/^(Surf\/marine|Tide|Hazards):\s*(.*)$/i);
        if (!labeled) { addContent('conditions', 'Fishing Conditions', [bullet]); continue; }
        const label = labeled[1].toLowerCase();
        const body = labeled[2].trim() || bullet;
        if (label === 'surf/marine') addContent('conditions', 'Surf / Marine', [body]);
        else if (label === 'tide') addContent('tides', '', [body]);
        else addContent('hazards', 'Hazards', [body]);
      }
      if (safety.length) addContent('hazards', 'Safety', safety);
      continue;
    }

    let key = 'notes';
    let subsection = '';
    if (/^(WEATHER|WEATHER SUMMARY|PALM COAST WEATHER|WEATHER — PALM COAST|WEATHER - PALM COAST)$/.test(rawTitle)) { key = 'conditions'; subsection = 'Weather'; }
    else if (/^(MARINE|MARINE CONDITIONS)$/.test(rawTitle)) { key = 'conditions'; subsection = 'Marine'; }
    else if (rawTitle === 'BEACH CONDITIONS') { key = 'conditions'; subsection = 'Beach Conditions'; }
    else if (rawTitle === 'FLAGLER BEACH CONDITIONS') { key = 'conditions'; subsection = 'Flagler Beach Conditions'; }
    else if (rawTitle === 'SURF/MARINE') { key = 'conditions'; subsection = 'Surf / Marine'; }
    else if (/^(TIDES?|LOW \/ HIGH TIDE)$/.test(rawTitle)) key = 'tides';
    else if (rawTitle === 'CONDITIONS') key = 'conditions';
    else if (rawTitle === 'HAZARDS') key = 'hazards';
    else if (rawTitle === 'WEATHER HAZARDS') { key = 'hazards'; subsection = 'Weather Hazards'; }
    else if (rawTitle === 'SAFETY') { key = 'hazards'; subsection = 'Safety'; }
    else if (rawTitle === 'SURF & SAFETY') { key = 'hazards'; subsection = 'Surf & Safety'; }
    else if (/^(FISHING APPROACH|BEST FISHING WINDOWS?|FISHING WINDOWS?|FLAGLER BEACH — SURF, TIDES & OUTLOOK|FLAGLER BEACH - SURF, TIDES & OUTLOOK)$/.test(rawTitle)) key = 'windows';
    else if (rawTitle === 'LIKELY SPECIES' || rawTitle === 'SPECIES') key = 'species';
    else if (/^(LIKELY SPECIES & APPROACH|LIKELY FISH & APPROACH)$/.test(rawTitle)) { key = 'species'; subsection = 'Species & Approach'; }
    else if (rawTitle === 'OUTLOOK') subsection = 'Outlook';
    else if (rawTitle === 'EARLY OBSERVATIONS') subsection = 'Early Observations';
    else if (rawTitle === 'SOURCES') key = 'sources';

    addContent(key, subsection, regularBullets);
    if (safety.length) addContent('hazards', 'Safety', safety);
  }

  const listMarkup = items => items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const chunks = groups.map(group => {
    const allItems = [...group.bullets, ...group.subsections.flatMap(part => part.bullets)];
    const cautionPattern = /\b(hazard|danger|unsafe|rough|high surf|strong current|rip current|warning|advisory|avoid|poor|cancel|storm|lightning|closed|restricted|small craft)\b/i;
    const positivePattern = /\b(favorable|good conditions|calm|light wind|best window|improving|productive)\b/i;
    const caution = allItems.some(item => cautionPattern.test(item)
      && !/\b(no|none|not|without)\b.{0,30}\b(hazard|risk|danger|warning|advisory|unsafe|poor|rough)\b/i.test(item));
    const positive = allItems.some(item => positivePattern.test(item));
    const rank = caution ? 'caution' : positive ? 'good' : 'neutral';
    const rankText = {good:'Good signal', neutral:'Mixed / unknown', caution:'Caution'}[rank];
    const firstItem = allItems.find(item => item.trim());
    const preview = firstItem ? (firstItem.length > 94 ? `${firstItem.slice(0, 91).trimEnd()}…` : firstItem) : group.emptyPreview;
    const subsectionMarkup = group.subsections.map(part => `<div class="report-subsection"><h4>${escapeHtml(part.title)}</h4>${listMarkup(part.bullets)}</div>`).join('');
    const emptyMarkup = allItems.length ? '' : `<p class="section-empty">${escapeHtml(group.empty)}</p>`;
    const speciesMarkup = group.key === 'species' && allItems.length
      ? '<p class="species-note">Regional guidance only — not verified same-day catches.</p>' : '';
    const speciesCards = [];
    const speciesContext = [];
    if (group.key === 'species') {
      for (const item of group.bullets) {
        const habitatPair = item.match(/^(Mullet) near (the eastern Intracoastal);\s*(shrimp) farther (upriver)(?:\s*\((regional guidance)\))?$/i);
        if (habitatPair) {
          speciesCards.push({name:habitatPair[1], context:`Near ${habitatPair[2]}`});
          speciesCards.push({name:habitatPair[3], context:`Farther ${habitatPair[4]}${habitatPair[5] ? ` (${habitatPair[5]})` : ''}`});
          continue;
        }
        const listed = item.match(/^([^.;]+);\s*(.+)$/);
        const names = listed && /,|\band\b/i.test(listed[1])
          ? listed[1].replace(/\s+and\s+/i, ', ').split(/,\s*/).map(name => name.trim()).filter(Boolean)
          : [];
        if (!names.length) { speciesContext.push(item); continue; }
        for (const name of names) speciesCards.push({name, context:listed[2]});
      }
    }
    const speciesLeadsMarkup = group.key === 'species' && allItems.length
      ? `${speciesCards.length ? `<div class="species-list">${speciesCards.map(species => `<article class="species-card"><h4>${escapeHtml(species.name)}</h4><p><b>Bait</b><span>Not specified by source</span></p><p><b>Likelihood</b><span>Not stated by source</span></p><small>${escapeHtml(species.context)} · not confirmed same-day in Flagler</small></article>`).join('')}</div>` : ''}${speciesContext.length ? `<div class="report-subsection species-context"><h4>Regional fishing context</h4>${listMarkup(speciesContext.map(firstSpeciesSentence))}</div>` : ''}${group.subsections.map(part => `<div class="report-subsection"><h4>${escapeHtml(part.title)}</h4>${listMarkup(part.bullets.map(firstSpeciesSentence))}</div>`).join('')}`
      : '';
    const bodyContentMarkup = group.key === 'species' && allItems.length
      ? `${speciesLeadsMarkup}<details class="species-source-details"><summary>Full source detail (${allItems.length} bullets)</summary>${listMarkup(group.bullets)}${subsectionMarkup}</details>`
      : `${listMarkup(group.bullets)}${subsectionMarkup}`;
    const bodyId = `report-section-${group.key}`;
    return `<details class="report-section section-${group.key}" data-rank="${rank}"><summary aria-controls="${bodyId}"><span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${group.icon}</svg></span><div class="section-summary"><h3>${escapeHtml(group.title)}</h3><span class="section-preview">${escapeHtml(preview)}</span></div><span class="rank-mark ${rank}" role="img" aria-label="${rankText}" title="${rankText}"></span><span class="section-toggle" aria-hidden="true"></span></summary><div class="section-body" id="${bodyId}">${emptyMarkup}${speciesMarkup}${bodyContentMarkup}</div></details>`;
  }).join('');
  els['report-content'].innerHTML = chunks;
  els['report-content'].setAttribute('aria-busy', 'false');
  els['report-date'].textContent = new Intl.DateTimeFormat(undefined, {dateStyle:'medium', timeZone:'UTC'}).format(new Date(`${data.report_date}T12:00:00Z`));
  const time = new Date(data.generated_at);
  els.updated.textContent = `Report generated ${new Intl.DateTimeFormat(undefined, {dateStyle:'medium', timeStyle:'short'}).format(time)}`;
  const age = Date.now() - time.getTime();
  if (!Number.isFinite(age) || age < -5 * 60 * 1000) setFreshness('stale', 'Timestamp needs review');
  else if (age > STALE_AFTER_MS) setFreshness('stale', 'Older report');
  else setFreshness('fresh', 'Recently published');
}
function localTime(stamp, options = {hour:'numeric', minute:'2-digit'}) {
  const time = new Date(stamp);
  return Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat(undefined, options).format(time) : 'Time unavailable';
}
function shortStamp(stamp) {
  const d = new Date(stamp);
  if (!Number.isFinite(d.getTime())) return 'time unavailable';
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? {hour:'numeric', minute:'2-digit'} : {weekday:'short', hour:'numeric', minute:'2-digit'}).format(d);
}
function setTileState(name, kind, label) {
  const state = document.querySelector(`#${name}-card .tile-state`);
  state.className = `tile-state ${kind}`;
  state.textContent = label;
}
function ageLabel(stamp) {
  const time = new Date(stamp).getTime();
  if (!Number.isFinite(time)) return null;
  const age = Date.now() - time;
  if (age < -5 * 60 * 1000) return 'timestamp needs review';
  const minutes = Math.max(0, Math.floor(age / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}
function observationIsStale(name, data) {
  const time = new Date(data.observed_at).getTime();
  const age = Date.now() - time;
  return !Number.isFinite(time) || age < -5 * 60 * 1000 || age > LIVE[name].stale;
}
function forecastIsFresh(forecast) {
  const timestamp = new Date(forecast?.updated_at || forecast?.fetched_at).getTime();
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= -5 * 60 * 1000 && age <= 24 * 60 * 60 * 1000;
}

const ICONS = {
  temp:'<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/>',
  wind:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8"/>',
  drop:'<path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3Z"/>',
  wave:'<path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-1M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-1"/>',
  period:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  rain:'<path d="M6 15a4 4 0 0 1 .6-7.9A5.5 5.5 0 0 1 17.3 9 3.5 3.5 0 0 1 17 16H6Z"/><path d="m8 19-1 2m5-2-1 2m5-2-1 2"/>',
  feels:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
};
function metricIcon(label) {
  const l = label.toLowerCase();
  const key = l.startsWith('air') ? 'temp' : l.startsWith('feels') ? 'feels' : l.startsWith('wind') || l.startsWith('gust') ? 'wind'
    : l.startsWith('humid') ? 'drop' : l.startsWith('wave') ? 'wave' : l.startsWith('dominant') ? 'period' : l.startsWith('water') ? 'temp'
    : l.startsWith('high') || l.startsWith('forecast high') ? 'up' : l.startsWith('low') || l.startsWith('forecast low') ? 'down' : l.includes('rain') ? 'rain' : null;
  if (!key) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'metric-icon'); svg.setAttribute('aria-hidden', 'true'); svg.innerHTML = ICONS[key];
  return svg;
}
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const compass = deg => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
function addMetric(container, label, value, detail = '') {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return;
  const item = document.createElement('div'); item.className = 'metric';
  if (detail) item.title = detail;
  const header = document.createElement('div'); header.className = 'metric-label';
    const symbol = document.createElement('span'); symbol.className = 'metric-symbol'; symbol.setAttribute('aria-hidden', 'true'); const icon = metricIcon(label); if (icon) symbol.append(icon);
  const name = document.createElement('span'); name.textContent = label;
  if (detail) header.setAttribute('aria-label', `${label} (${detail})`);
  header.append(symbol, name);
  const amount = document.createElement('strong'); amount.textContent = value;
  item.append(header, amount);
  if (detail) { const note = document.createElement('small'); note.className = 'metric-detail'; note.textContent = detail; item.append(note); }
  container.append(item);
}
function addUnavailableMetric(container, label) {
  const item = document.createElement('div'); item.className = 'metric unavailable-metric';
  const header = document.createElement('div'); header.className = 'metric-label';
  const name = document.createElement('span'); name.textContent = label; header.append(name);
  const amount = document.createElement('strong'); amount.textContent = 'Unavailable';
  item.append(header, amount); container.append(item);
}
function renderLive(name, data) {
  const box = document.getElementById(`${name}-values`);
  const time = document.getElementById(`${name}-time`);
  const forecastTime = name === 'weather' ? document.getElementById('weather-forecast-time') : null;
  box.replaceChildren();
  if (name === 'weather') {
    const v = data.values || {};
    const forecast = data.forecast && typeof data.forecast === 'object' ? data.forecast : {};
    if (typeof v.text_description === 'string' && v.text_description.trim()) { const desc = document.createElement('p'); desc.className='weather-description'; desc.textContent=v.text_description; box.append(desc); }
    addMetric(box, 'Air', v.temperature_c == null ? null : `${(v.temperature_c*9/5+32).toFixed(0)}°F`);
    if (v.feels_like_c == null || !Number.isFinite(Number(v.feels_like_c))) addUnavailableMetric(box, 'Feels like');
    else addMetric(box, 'Feels like', `${(Number(v.feels_like_c)*9/5+32).toFixed(0)}°F`, v.feels_like_basis || '');
    addMetric(box, 'Wind', v.wind_speed_ms == null ? null : `${(v.wind_speed_ms*2.23694).toFixed(0)} mph${v.wind_direction_deg == null ? '' : ` ${compass(v.wind_direction_deg)}`}`);
    addMetric(box, 'Gust', v.wind_gust_ms == null ? null : `${(v.wind_gust_ms*2.23694).toFixed(0)} mph`);
    addMetric(box, 'Humidity', v.relative_humidity_pct == null ? null : `${Math.round(v.relative_humidity_pct)}%`);
    addMetric(box, forecast.high_period ? `High · ${forecast.high_period}` : 'Forecast high', forecast.high_f == null ? null : `${Math.round(forecast.high_f)}°F`);
    addMetric(box, forecast.low_period ? `Low · ${forecast.low_period}` : 'Forecast low', forecast.low_f == null ? null : `${Math.round(forecast.low_f)}°F`);
    const rainLabel = forecast.precipitation_period ? `Forecast rain · ${forecast.precipitation_period}` : 'Forecast rain chance';
    if (forecast.precipitation_probability_pct == null || !Number.isFinite(Number(forecast.precipitation_probability_pct))) addUnavailableMetric(box, rainLabel);
    else addMetric(box, rainLabel, `${Math.round(Number(forecast.precipitation_probability_pct))}% chance`);
    if (forecastTime) {
      const updatedAt = forecast.updated_at || forecast.fetched_at;
      const updated = updatedAt ? new Date(updatedAt) : null;
      forecastTime.textContent = updated && Number.isFinite(updated.getTime())
        ? `Forecast updated ${shortStamp(updatedAt)}`
        : 'Forecast update unavailable';
    }
  } else if (name === 'marine') {
    const v = data.values || {};
    addMetric(box, 'Waves', v.wave_height_m == null ? null : `${(v.wave_height_m*3.28084).toFixed(1)} ft`);
    addMetric(box, 'Dominant period', v.dominant_period_s == null ? null : `${v.dominant_period_s.toFixed(0)} sec`);
    addMetric(box, 'Water', v.water_temperature_c == null ? null : `${(v.water_temperature_c*9/5+32).toFixed(0)}°F`);
    addMetric(box, 'Wind', v.wind_speed_ms == null ? null : `${(v.wind_speed_ms*2.23694).toFixed(0)} mph`);
  } else {
    const events = Array.isArray(data.events) ? data.events
      .filter(event => event && typeof event.time === 'string' && Number.isFinite(Date.parse(event.time)) && Number.isFinite(Number(event.height_ft)) && (event.type === 'High' || event.type === 'Low'))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time)) : [];
    const nextEvent = events.find(event => Date.parse(event.time) >= Date.now());
    if (nextEvent) box.append(renderNextTideEvent(nextEvent));
    if (events.length) box.append(renderTideChart(events));
  }
  const metrics = box.querySelectorAll('.metric');
  if (metrics.length % 2) metrics[metrics.length - 1].classList.add('metric-wide');
  if (!box.childElementCount) {
    const empty = document.createElement('span'); empty.className='tile-empty';
    empty.textContent = name === 'tides' && Array.isArray(data.events) && data.events.length === 0
      ? 'No high or low tide events in this prediction window.'
      : 'No valid values in the latest source response.';
    box.append(empty);
  }
  const age = name === 'tides' ? null : ageLabel(data.observed_at);
  if (name === 'tides') {
    time.textContent = data.prediction_date ? `Next 24h · ${ageLabel(data.fetched_at) || 'fetch time unavailable'}` : 'Prediction date unavailable';
    setTileState(name, 'prediction', 'Prediction');
  } else {
    time.textContent = age ? `Observed ${shortStamp(data.observed_at)} · ${age}` : 'Observation time unavailable';
    const old = observationIsStale(name, data);
    setTileState(name, old ? 'stale' : 'fresh', old ? 'Stale' : 'Current');
  }
}
function renderNextTideEvent(event) {
  const card = document.createElement('div'); card.className = `next-tide-event ${event.type.toLowerCase()}`;
  const label = document.createElement('span'); label.className = 'next-tide-label'; label.textContent = 'Next predicted event';
  const value = document.createElement('strong'); value.className = 'next-tide-type'; value.textContent = event.type;
  const height = document.createElement('strong'); height.className = 'next-tide-height'; height.textContent = `${Number(event.height_ft).toFixed(1)} ft`;
  const time = document.createElement('time'); time.className = 'next-tide-time'; time.dateTime = event.time;
  time.textContent = new Intl.DateTimeFormat(undefined, {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}).format(new Date(event.time));
  card.append(label, value, height, time);
  return card;
}
function renderTideChart(events) {
  const wrap = document.createElement('div'); wrap.className = 'tide-list';
  const title = document.createElement('p'); title.className = 'chart-caption'; title.textContent = 'Predicted highs and lows'; wrap.append(title);
  const list = document.createElement('ul');
  for (const event of events) {
    const li = document.createElement('li'); li.className = event.type.toLowerCase();
    const type = document.createElement('b'); type.textContent = event.type;
    const time = document.createElement('time'); time.dateTime = event.time; time.textContent = new Intl.DateTimeFormat(undefined, {weekday:'short', hour:'numeric', minute:'2-digit'}).format(new Date(event.time));
    const height = document.createElement('span'); height.textContent = `${Number(event.height_ft).toFixed(1)} ft`;
    li.append(type, time, height); list.append(li);
  }
  wrap.append(list);
  const note = document.createElement('small'); note.textContent = 'NOAA predictions for Smith Creek; heights above MLLW.'; wrap.append(note);
  return wrap;
}

async function refreshLive(name) {
  try {
    const response = await fetch(`../${LIVE[name].path}?check=${Date.now()}`, {cache:'no-store'});
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error('Source unavailable');
    renderLive(name, payload);
    return {name, ok:true, data:payload};
  } catch {
    setTileState(name, 'error', 'Unavailable');
    const box = document.getElementById(`${name}-values`); box.replaceChildren();
    const empty = document.createElement('span'); empty.className='tile-empty'; empty.textContent='Could not fetch current source data. Try refresh again.'; box.append(empty);
    document.getElementById(`${name}-time`).textContent='No current source timestamp';
    return {name, ok:false};
  }
}
function renderTripSuggestion(results) {
  const root = document.getElementById('trip-suggestion');
  const copy = root.querySelector('.trip-suggestion-copy');
  const weatherResult = results.find(result => result.name === 'weather' && result.ok);
  const marineResult = results.find(result => result.name === 'marine' && result.ok);
  const weather = weatherResult && !observationIsStale('weather', weatherResult.data) ? weatherResult.data : null;
  const marine = marineResult && !observationIsStale('marine', marineResult.data) ? marineResult.data : null;
  const w = weather?.values || {}, f = weather?.forecast || {}, m = marine?.values || {};
  const flags = [];
  let known = 0;
  const windMph = w.wind_speed_ms == null ? NaN : Number(w.wind_speed_ms) * 2.23694;
  const gustMph = w.wind_gust_ms == null ? NaN : Number(w.wind_gust_ms) * 2.23694;
  const waveFt = m.wave_height_m == null ? NaN : Number(m.wave_height_m) * 3.28084;
  const rainPct = !forecastIsFresh(f) || f.precipitation_probability_pct == null ? NaN : Number(f.precipitation_probability_pct);
  let hasWind = false, hasSea = false, hasRain = Number.isFinite(rainPct);
  if (Number.isFinite(windMph)) { known++; hasWind = true; if (windMph >= 20) flags.push('nearby airport wind is elevated'); }
  if (Number.isFinite(gustMph)) { known++; hasWind = true; if (gustMph >= 25) flags.push('nearby airport gusts are elevated'); }
  if (Number.isFinite(waveFt)) { known++; hasSea = true; if (waveFt >= 5) flags.push('offshore buoy seas are elevated'); }
  if (Number.isFinite(rainPct)) { known++; if (rainPct >= 60) flags.push('forecast rain chance is high'); }
  root.classList.remove('good', 'caution', 'uncertain');
  if (!known) {
    root.classList.add('uncertain');
    copy.textContent = 'Not enough current source data for a useful read. Check the local beach forecast and advisories before heading out.';
    return;
  }
  if (flags.length) {
    root.classList.add('caution');
    copy.textContent = `Worth a closer check: ${flags.join('; ')}. This is a quick read, not a beach or marine safety forecast; check local beach conditions and advisories.`;
  } else if (hasWind && hasSea && hasRain) {
    root.classList.add('good');
    copy.textContent = 'No major flags in the available nearby-airport, offshore-buoy, and forecast readings. Quick read only—not a beach safety forecast; check local conditions and advisories.';
  } else {
    root.classList.add('uncertain');
    copy.textContent = 'Some readings look manageable, but key inputs are missing. Quick read only; check the local beach forecast and advisories.';
  }
}
function renderFishingGrade(results) {
  const root = document.getElementById('fishing-grade');
  const title = root.querySelector('#fishing-grade-title');
  const badge = root.querySelector('.fishing-grade-badge');
  const summary = root.querySelector('.fishing-grade-summary');
  const rationale = root.querySelector('.fishing-grade-rationale');
  const weatherResult = results.find(result => result.name === 'weather' && result.ok);
  const marineResult = results.find(result => result.name === 'marine' && result.ok);
  const weather = weatherResult && !observationIsStale('weather', weatherResult.data) ? weatherResult.data : null;
  const marine = marineResult && !observationIsStale('marine', marineResult.data) ? marineResult.data : null;
  const w = weather?.values || {}, f = weather?.forecast || {}, m = marine?.values || {};
  const wind = w.wind_speed_ms == null ? NaN : Number(w.wind_speed_ms) * 2.23694;
  const waves = m.wave_height_m == null ? NaN : Number(m.wave_height_m) * 3.28084;
  const forecastFresh = forecastIsFresh(f);
  const rain = !forecastFresh || f.precipitation_probability_pct == null ? NaN : Number(f.precipitation_probability_pct);
  const missing = [];
  if (!Number.isFinite(wind)) missing.push(weather ? 'sustained wind value missing' : 'nearby weather observation missing or stale');
  if (!Number.isFinite(waves)) missing.push(marine ? 'wave-height value missing' : 'offshore buoy observation missing or stale');
  if (!Number.isFinite(rain)) missing.push(!weather ? 'current weather/forecast unavailable' : !forecastFresh ? 'forecast update missing or older than 24 hours' : 'forecast rain chance missing');
  // Score the same rounded values shown below so rounding cannot make a
  // rationale appear to fall on the opposite side of a displayed cutoff.
  const scoredWind = Number.isFinite(wind) ? Math.round(wind) : NaN;
  const scoredWaves = Number.isFinite(waves) ? Number(waves.toFixed(1)) : NaN;
  const scoredRain = Number.isFinite(rain) ? Math.round(rain) : NaN;
  const fmt = (value, suffix) => `${suffix.trim() === 'ft' ? value.toFixed(1) : Math.round(value)}${suffix}`;
  const dimensions = [];
  if (Number.isFinite(scoredWind)) dimensions.push({label:`Nearby airport wind ${fmt(scoredWind, ' mph')}`, points:scoredWind <= 10 ? 2 : scoredWind <= 15 ? 1 : 0});
  if (Number.isFinite(scoredWaves)) dimensions.push({label:`Offshore buoy seas ${fmt(scoredWaves, ' ft')}`, points:scoredWaves <= 2 ? 2 : scoredWaves <= 4 ? 1 : 0});
  if (Number.isFinite(scoredRain)) dimensions.push({label:`Forecast rain chance ${fmt(scoredRain, '%')}`, points:scoredRain <= 20 ? 2 : scoredRain <= 50 ? 1 : 0});
  rationale.replaceChildren();
  for (const item of dimensions) {
    const li = document.createElement('li');
    li.textContent = `${item.label}: ${item.points}/2 points`;
    rationale.append(li);
  }
  root.classList.remove('grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f', 'incomplete');
  if (missing.length) {
    root.classList.add('incomplete');
    title.textContent = 'Grade withheld · incomplete data';
    badge.textContent = '—'; badge.setAttribute('aria-label', 'Grade withheld');
    summary.textContent = `No grade until all 3 current inputs are available: ${missing.join('; ')}.`;
    const li = document.createElement('li'); li.textContent = 'The grade is intentionally withheld rather than inferred from stale or partial readings.'; rationale.append(li);
    return;
  }
  const points = dimensions.reduce((sum, item) => sum + item.points, 0);
  const bands = points >= 6 ? ['A', 'Favorable snapshot', 'grade-a']
    : points >= 5 ? ['B', 'Promising snapshot', 'grade-b']
    : points >= 4 ? ['C', 'Mixed snapshot', 'grade-c']
    : points >= 2 ? ['D', 'Challenging snapshot', 'grade-d']
    : ['F', 'Unfavorable snapshot', 'grade-f'];
  root.classList.add(bands[2]);
  title.textContent = bands[1];
  badge.textContent = bands[0]; badge.setAttribute('aria-label', `Grade ${bands[0]}`);
  summary.textContent = `Grade ${bands[0]} · ${points}/6 points across three current indicators. Higher scores mean fewer weather-related friction signals—not a prediction of fish activity.`;
  const scoring = document.createElement('li');
  scoring.textContent = 'Rubric per indicator (shown rounded): wind ≤10 / ≤15 / >15 mph, seas ≤2 / ≤4 / >4 ft, and rain ≤20 / ≤50 / >50% score 2 / 1 / 0 points respectively.';
  rationale.append(scoring);
}
async function refreshCurrentConditions() {
  setFreshness('pending', 'Checking conditions…', els['conditions-freshness']);
  const results = await Promise.all(Object.keys(LIVE).map(refreshLive));
  renderTripSuggestion(results);
  renderFishingGrade(results);
  const checkedAt = new Intl.DateTimeFormat(undefined, {timeStyle:'short'}).format(new Date());
  const unavailable = results.filter(result => !result.ok).length;
  if (unavailable) {
    const label = unavailable === 1 ? '1 tile unavailable' : `${unavailable} tiles unavailable`;
    setFreshness('error', `${label} · checked ${checkedAt}`, els['conditions-freshness']);
    return results;
  }
  const oldObservations = results.some(result => result.name !== 'tides' && observationIsStale(result.name, result.data));
  if (oldObservations) {
    setFreshness('stale', `Older observations · checked ${checkedAt}`, els['conditions-freshness']);
    return results;
  }
  setFreshness('fresh', `Conditions checked ${checkedAt}`, els['conditions-freshness']);
  return results;
}
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  els.refresh.disabled = true;
  els.refresh.querySelector('span').textContent = '…';
  try {
    await Promise.all([refreshReport(), refreshCurrentConditions()]);
  } finally {
    refreshing = false;
    els.refresh.disabled = false;
    els.refresh.querySelector('span').textContent = '↻';
  }
}
async function refreshReport() {
  els.connection.textContent = 'Checking for updates…'; els.notice.hidden = true;
  els['report-content'].setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`../api/report.json?check=${Date.now()}`, {cache:'no-store'});
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      const details = payload.message || 'The report could not be loaded.';
      throw Object.assign(new Error(details), {kind:payload.error || 'unavailable'});
    }
    renderReport(payload);
    const cached = response.headers.get('X-Report-Cache') === 'offline';
    els.connection.textContent = cached ? 'Offline · saved report' : 'Connected · checked just now';
    if (cached) {
      els.notice.textContent = 'You are offline. Showing the last report saved on this device; refresh when you reconnect.';
      els.notice.hidden = false;
      setFreshness('stale', 'Saved report · offline');
    }
  } catch (error) {
    const malformed = error.kind === 'malformed';
    setFreshness('error', malformed ? 'Report data issue' : 'Unable to refresh');
    els.connection.textContent = navigator.onLine ? 'Could not update' : 'Offline';
    const hasPreviousReport = Boolean(els['report-content'].textContent.trim()) && !els['report-content'].textContent.includes('Loading the latest');
    els.notice.textContent = malformed
      ? `${error.message} No older report is substituted.`
      : hasPreviousReport
        ? 'Could not refresh. The report already shown remains on screen, but its latest freshness could not be confirmed.'
        : 'The report could not be reached and no saved copy is available yet. Check your connection and try again.';
    els.notice.hidden = false;
    if (!els['report-content'].textContent.trim() || els['report-content'].textContent.includes('Loading the latest')) {
      els['report-content'].innerHTML = '<p>There is no report available to show right now.</p>';
    }
  } finally {
    els['report-content'].setAttribute('aria-busy', 'false');
  }
}
els.refresh.addEventListener('click', refreshAll);
refreshAll();
setInterval(refreshAll, REFRESH_MS);
let lastForeground = Date.now();
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (Date.now() - lastForeground > 60 * 1000) refreshAll(); lastForeground = Date.now(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
