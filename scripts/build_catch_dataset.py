#!/usr/bin/env python3
"""Build a deterministic, interview-level MRIP + as-of environment dataset.

The MRIP definitions and cache/download helpers are imported from
build_first_coast_history.py. Environmental reads are strictly read-only.
"""
import argparse
import bisect
import csv
import datetime as dt
import importlib.util
import json
import math
import os
import sqlite3
import statistics
import sys
import time
from collections import defaultdict
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MRIP_SCRIPT = os.path.join(ROOT, "scripts", "build_first_coast_history.py")
DB_PATH = "/Users/christiannunez/openclaw/fishing-engine/data/flagler.db"
TZ = ZoneInfo("America/New_York")
COUNTY_NAMES = {"31": "Duval", "35": "Flagler", "89": "Nassau", "109": "St. Johns"}
COUNTY_POINTS = {
    "31": (30.35, -81.40), "35": (29.47, -81.10),
    "89": (30.60, -81.45), "109": (29.84, -81.27),
}
ASOS = {"31": "KSGJ", "35": "KFIN", "89": "KSGJ", "109": "KSGJ"}
TIDE = {"31": "8720587", "35": "8720833", "89": "8720587", "109": "8720587"}
FRONT_LOCATION = {"31": "st_augustine_beach", "35": "flagler_beach", "89": "st_augustine_beach", "109": "st_augustine_beach"}
SAT = {"31": "sat:st_augustine_beach", "35": "sat:flagler_beach", "89": "sat:st_augustine_beach", "109": "sat:st_augustine_beach"}
OBS_STATIONS = ("41117", "SAUF1", "KSGJ", "KFIN", "KDAB",
                "sat:st_augustine_beach", "sat:flagler_beach")
OBS_VARS = (
    "water_temp_c", "wind_speed_ms", "wind_dir_deg", "wind_gust_ms", "pressure_hpa",
    "pressure_msl_hpa", "air_temp_c", "precip_1h_mm", "wave_height_m", "wave_period_s",
    "wave_avg_period_s", "sst_sat_c", "chlor_a_mgm3",
)
FEATURES = [
    "doy_sin", "doy_cos", "month", "hrsf", "area_is_ocean",
    "county_duval", "county_flagler", "county_nassau", "county_st_johns",
    "mode_f_1", "mode_f_2", "mode_f_3", "mode_f_4", "mode_f_5",
    "water_temp_c", "water_temp_anomaly_c",
    "wind_speed_ms", "wind_onshore_ms", "wind_gust_ms", "pressure_hpa",
    "pressure_delta_3h_hpa", "pressure_delta_24h_hpa", "air_temp_c", "rain_24h_mm",
    "wave_height_m", "wave_period_s", "tide_rising", "hours_to_next_high",
    "hours_to_next_low", "tide_range_day_m", "hours_from_sunrise", "hours_to_sunset",
    "is_daylight", "moon_illumination", "moon_phase_sin", "moon_phase_cos",
    "solunar_major", "solunar_minor", "hours_since_cold_front", "sst_sat_c", "chlor_a_mgm3",
]
_TIME_INDEX = {}


def load_history_module():
    spec = importlib.util.spec_from_file_location("first_coast_history", MRIP_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def epoch_local(day, hhmm):
    hour, minute = map(int, hhmm.split(":")) if hhmm else (12, 0)
    return int(dt.datetime.combine(day, dt.time(hour, minute), TZ).timestamp())


def import_astro():
    """The engine astro module is pure Python; import without opening its DB or network."""
    engine = "/Users/christiannunez/openclaw/fishing-engine"
    if engine not in sys.path:
        sys.path.insert(0, engine)
    try:
        from flagler import astro
        return astro
    except Exception as exc:
        print("engine astro import unavailable; using built-in fallback:", exc, file=sys.stderr)
        return None


def read_environment(db_path, start_epoch, end_epoch):
    uri = "file:" + os.path.abspath(db_path) + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute("PRAGMA query_only=ON")
    placeholders = ",".join("?" for _ in OBS_STATIONS)
    varholders = ",".join("?" for _ in OBS_VARS)
    sql = ("SELECT station_id,variable,valid_at,available_at,value,unit FROM observation "
           "WHERE station_id IN (" + placeholders + ") AND variable IN (" + varholders + ") "
           "AND valid_at BETWEEN ? AND ? ORDER BY station_id,variable,valid_at,recorded_at")
    raw = conn.execute(sql, (*OBS_STATIONS, *OBS_VARS, start_epoch - 2 * 86400, end_epoch + 86400))
    series = defaultdict(list)
    for station, variable, valid, available, value, unit in raw:
        series[(station, variable)].append((int(valid), int(available), float(value), unit))
    for key in series:
        # Identical valid-time observations can be re-ingested. Keep the most recent
        # recorded value, while the modeled availability timestamp remains the gate.
        dedup = {}
        for row in series[key]:
            dedup[row[0]] = row
        series[key] = sorted(dedup.values())
    tides = defaultdict(list)
    tide_rows = conn.execute(
        "SELECT station_id,valid_at,kind,height_m FROM tide_event WHERE station_id IN (?,?,?,?,?,?) "
        "AND valid_at BETWEEN ? AND ? ORDER BY station_id,valid_at",
        ("8720587", "8720692", "8720833", "8720954", "8721120", "8721147", start_epoch - 86400, end_epoch + 2 * 86400))
    for station, valid, kind, height in tide_rows:
        tides[station].append((int(valid), kind, float(height)))
    fronts = defaultdict(list)
    front_rows = conn.execute(
        "SELECT location_id,start_at,end_at,detected_at FROM event WHERE kind='cold_front' "
        "AND location_id IN ('flagler_beach','st_augustine_beach') AND start_at BETWEEN ? AND ? ORDER BY location_id,start_at",
        (start_epoch - 8 * 86400, end_epoch))
    for loc, start, end, detected in front_rows:
        fronts[loc].append((int(start), int(end), int(detected)))
    conn.close()
    return series, tides, fronts


def lookup(series, station, variables, t, max_age_h=4, valid_by=None):
    """Latest observation whose valid and available times are both no later than t."""
    valid_by = t if valid_by is None else valid_by
    for variable in variables:
        rows = series.get((station, variable), ())
        times = _TIME_INDEX.setdefault(id(rows), [r[0] for r in rows])
        pos = bisect.bisect_right(times, valid_by)
        for valid, available, value, unit in reversed(rows[:pos]):
            if valid <= valid_by and available <= t and valid >= valid_by - max_age_h * 3600:
                return value
    return None


def tide_features(rows, t, local_day):
    if not rows:
        return {"tide_rising": None, "hours_to_next_high": None, "hours_to_next_low": None, "tide_range_day_m": None}
    prev = [r for r in rows if r[0] <= t]
    nxt = [r for r in rows if r[0] > t]
    prev_event = max(prev, key=lambda r: r[0]) if prev else None
    next_hi = next((r for r in nxt if r[1] == "H"), None)
    next_lo = next((r for r in nxt if r[1] == "L"), None)
    day0 = int(dt.datetime.combine(local_day, dt.time(), TZ).timestamp())
    day1 = int(dt.datetime.combine(local_day + dt.timedelta(days=1), dt.time(), TZ).timestamp())
    today = [r[2] for r in rows if day0 <= r[0] < day1]
    highs = [r[2] for r in rows if day0 <= r[0] < day1 and r[1] == "H"]
    lows = [r[2] for r in rows if day0 <= r[0] < day1 and r[1] == "L"]
    tr = (max(highs) - min(lows)) if highs and lows else (max(today) - min(today) if len(today) >= 2 else None)
    return {
        "tide_rising": (1.0 if prev_event[1] == "L" else 0.0) if prev_event else None,
        "hours_to_next_high": (next_hi[0] - t) / 3600 if next_hi else None,
        "hours_to_next_low": (next_lo[0] - t) / 3600 if next_lo else None,
        "tide_range_day_m": tr,
    }


def env_features(trip, env, astro, astro_cache):
    series, tides, fronts = env
    day = dt.date.fromisoformat(trip["interview_date"])
    hhmm = trip["time_local"] or "12:00"
    t = epoch_local(day, hhmm)
    doy = day.timetuple().tm_yday
    context_features = {"hrsf", "area_is_ocean", "county_duval", "county_flagler", "county_nassau", "county_st_johns",
                        "mode_f_1", "mode_f_2", "mode_f_3", "mode_f_4", "mode_f_5"}
    feats = {f: None for f in FEATURES if f not in context_features}
    feats["doy_sin"] = math.sin(2 * math.pi * (doy - 1) / 365.2425)
    feats["doy_cos"] = math.cos(2 * math.pi * (doy - 1) / 365.2425)
    feats["month"] = day.month
    county = trip["county_fips"]
    water = lookup(series, "41117", ("water_temp_c",), t, 6)
    if water is None:
        water = lookup(series, "SAUF1", ("water_temp_c",), t, 6)
    feats["water_temp_c"] = water
    ndbc = "41117"
    q = lookup(series, ndbc, ("wind_speed_ms",), t, 3)
    wd = lookup(series, ndbc, ("wind_dir_deg",), t, 3)
    gust = lookup(series, ndbc, ("wind_gust_ms",), t, 3)
    if q is None: q = lookup(series, "SAUF1", ("wind_speed_ms",), t, 3)
    if wd is None: wd = lookup(series, "SAUF1", ("wind_dir_deg",), t, 3)
    if gust is None: gust = lookup(series, "SAUF1", ("wind_gust_ms",), t, 3)
    feats["wind_speed_ms"] = q
    feats["wind_onshore_ms"] = q * math.cos(math.radians((wd - 90 + 180) % 360 - 180)) if q is not None and wd is not None else None
    feats["wind_gust_ms"] = gust
    pressure = lookup(series, ndbc, ("pressure_hpa",), t, 3)
    pressure_station = ndbc
    pressure_vars = ("pressure_hpa",)
    if pressure is None:
        pressure_station, pressure_vars = ASOS[county], ("pressure_msl_hpa",)
        pressure = lookup(series, pressure_station, pressure_vars, t, 3)
    feats["pressure_hpa"] = pressure
    for hours, name in ((3, "pressure_delta_3h_hpa"), (24, "pressure_delta_24h_hpa")):
        then = lookup(series, pressure_station, pressure_vars, t, 3, t - hours * 3600)
        feats[name] = pressure - then if pressure is not None and then is not None else None
    airport = ASOS[county]
    feats["air_temp_c"] = lookup(series, airport, ("air_temp_c",), t, 3)
    rain = [r[2] for r in series.get((airport, "precip_1h_mm"), ()) if t - 24 * 3600 < r[0] <= t and r[1] <= t]
    feats["rain_24h_mm"] = sum(rain) if rain else None
    if trip["area"] == "ocean":
        feats["wave_height_m"] = lookup(series, ndbc, ("wave_height_m",), t, 6)
        feats["wave_period_s"] = lookup(series, ndbc, ("wave_period_s", "wave_avg_period_s"), t, 6)
    station = TIDE[county]
    feats.update(tide_features(tides.get(station, ()), t, day))
    if astro:
        lat, lon = COUNTY_POINTS[county]
        start = int(dt.datetime.combine(day, dt.time(), TZ).timestamp())
        end = int(dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), TZ).timestamp())
        astro_key = (day.isoformat(), county, hhmm)
        if astro_key not in astro_cache:
            sun = astro.sun_events(start, end, lat, lon)
            phase = astro.moon_phase(t)
            windows = astro.solunar_windows(start, end, lat, lon)
            astro_cache[astro_key] = (sun, phase, windows)
        sun, phase, windows = astro_cache[astro_key]
        rise, setting = sun["sunrise"], sun["sunset"]
        feats["hours_from_sunrise"] = (t - rise) / 3600 if rise is not None else None
        feats["hours_to_sunset"] = (setting - t) / 3600 if setting is not None else None
        feats["is_daylight"] = float(rise is not None and setting is not None and rise <= t < setting)
        feats["moon_illumination"] = phase["illumination"]
        frac = phase["fraction"]
        feats["moon_phase_sin"] = math.sin(2 * math.pi * frac)
        feats["moon_phase_cos"] = math.cos(2 * math.pi * frac)
        feats["solunar_major"] = float(any(w["kind"].startswith("major") and w["start"] <= t <= w["end"] for w in windows))
        feats["solunar_minor"] = float(any(w["kind"].startswith("minor") and w["start"] <= t <= w["end"] for w in windows))
    loc = FRONT_LOCATION[county]
    occurred = [s for s, e, detected in fronts.get(loc, ()) if s <= t and detected <= t]
    feats["hours_since_cold_front"] = (t - max(occurred)) / 3600 if occurred else None
    sat_station = SAT[county]
    feats["sst_sat_c"] = lookup(series, sat_station, ("sst_sat_c",), t, 120)
    feats["chlor_a_mgm3"] = lookup(series, sat_station, ("chlor_a_mgm3",), t, 120)
    return feats


def read_trip_details(cache, years, counties, mrip):
    """Recover exact source TIME and INTSITE without changing the history builder."""
    details = {}
    for filename in mrip.ps_zip_names(years):
        path = os.path.join(cache, filename)
        for d in mrip.read_zip_csvs(path, "trip_", years):
            if d.get("ST") != "12" or d.get("CNTY") not in counties or d.get("MODE_FX") != "3" or d.get("AREA_X") not in mrip.AREAS:
                continue
            key = (d.get("YEAR", ""), d.get("WAVE", ""), d.get("ID_CODE", ""))
            raw = (d.get("TIME") or "").strip()
            time_local = ""
            if raw.isdigit() and len(raw) in (3, 4):
                raw = raw.zfill(4)
                hour, minute = int(raw[:2]), int(raw[2:])
                if hour <= 23 and minute <= 59:
                    time_local = "%02d:%02d" % (hour, minute)
            details[key] = {"time_local": time_local, "intsite": (d.get("INTSITE") or "").strip()}
    return details


def make_trips(cache, years, with_volusia=False):
    mrip = load_history_module()
    counties = dict(mrip.COUNTIES, **(mrip.VOLUSIA if with_volusia else {}))
    trips, diagnostics = mrip.collect_mrip(cache, set(years), counties)
    details = read_trip_details(cache, set(years), counties, mrip)
    catalog = mrip.species_catalog()
    result = []
    invalid_dates = []
    for (year_s, wave, id_code), trip in sorted(trips.items()):
        if trip["imputed_proxy"]:
            continue
        idcode = trip["id_code"]
        raw_date = idcode[5:13] if len(idcode) >= 13 else ""
        try:
            interview_date = dt.datetime.strptime(raw_date, "%Y%m%d").date()
        except ValueError:
            invalid_dates.append((year_s, wave, idcode, "bad YYYYMMDD"))
            continue
        if interview_date.year != trip["year"] or interview_date.month != trip["month"]:
            invalid_dates.append((year_s, wave, idcode, "ID_CODE date disagrees with YEAR/MONTH"))
            continue
        county = str(trip["county"])
        extra = details.get((year_s, wave, id_code), {"time_local": "", "intsite": ""})
        hits = set(trip["species_hits"])
        any_fish = any(s not in mrip.BAIT and s not in mrip.UNKNOWN for s in hits)
        row = {
            "interview_date": interview_date.isoformat(),
            "time_local": extra["time_local"],
            "time_imputed_noon": int(not extra["time_local"]),
            "county_fips": county, "county": counties.get(county, county),
            "area": trip["area"], "mode_f": trip["mode_f"], "intsite": extra["intsite"],
            "hrsf": trip["hrsf"], "wp_int": trip["w"], "any_fish": int(any_fish),
            "year": trip["year"], "month": trip["month"],
        }
        row["area_is_ocean"] = int(trip["area"] == "ocean")
        for code, slug in (("31", "duval"), ("35", "flagler"), ("89", "nassau"), ("109", "st_johns")):
            row["county_" + slug] = int(county == code)
        for mode in ("1", "2", "3", "4", "5"):
            row["mode_f_" + mode] = int(str(trip["mode_f"]) == mode)
        row["hrsf"] = trip["hrsf"]
        for species_id, entry in catalog.items():
            aliases = set(entry["mrip"])
            row["species_" + species_id] = int(bool(hits & aliases))
        row["_epoch_local"] = epoch_local(interview_date, row["time_local"] or "12:00")
        row["_trip_key"] = (year_s, wave, id_code)
        result.append(row)
    if invalid_dates:
        raise ValueError("%d retained MRIP rows have invalid/mismatched embedded dates; first: %r" % (len(invalid_dates), invalid_dates[0]))
    return result, catalog, diagnostics


def main():
    started = time.monotonic()
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "mrip"))
    ap.add_argument("--out", default=os.path.join(ROOT, ".cache", "catch", "trips.csv"))
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--years", default="2015-2025")
    ap.add_argument("--with-volusia", action="store_true")
    a = ap.parse_args()
    y0, y1 = map(int, a.years.split("-"))
    os.makedirs(a.cache, exist_ok=True)
    rows, catalog, qa = make_trips(a.cache, range(y0, y1 + 1), a.with_volusia)
    env = read_environment(a.db, min(r["_epoch_local"] for r in rows), max(r["_epoch_local"] for r in rows))
    astro = import_astro()
    astro_cache = {}
    for row in rows:
        row.update(env_features(row, env, astro, astro_cache))
    # Per-trip-year-excluded, circular +/-15 day-of-year climatology.
    daily = defaultdict(list)
    for station in ("41117", "SAUF1"):
        for valid, available, value, unit in env[0].get((station, "water_temp_c"), ()):
            local_day = dt.datetime.fromtimestamp(valid, TZ).date()
            if (local_day.month, local_day.day) == (2, 29):
                continue
            leap = local_day.year % 4 == 0 and (local_day.year % 100 != 0 or local_day.year % 400 == 0)
            doy = local_day.timetuple().tm_yday - (1 if leap and local_day.month > 2 else 0)
            daily[(local_day.year, doy)].append(value)
    daily_mean = {key: statistics.fmean(values) for key, values in daily.items()}
    for row in rows:
        day = dt.date.fromisoformat(row["interview_date"])
        leap = day.year % 4 == 0 and (day.year % 100 != 0 or day.year % 400 == 0)
        doy = day.timetuple().tm_yday - (1 if leap and day.month > 2 else 0)
        samples = [v for (yr, d), v in daily_mean.items() if yr != day.year and min((d - doy) % 365, (doy - d) % 365) <= 15]
        if row["water_temp_c"] is not None and samples:
            row["water_temp_anomaly_c"] = row["water_temp_c"] - statistics.fmean(samples)
        else:
            row["water_temp_anomaly_c"] = None
        row.pop("_epoch_local", None)
        row.pop("_trip_key", None)
    fieldnames = list(rows[0].keys())
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print("trips=%d MRIP=%r" % (len(rows), {k: qa[k] for k in ("trip_rows", "catch_rows", "imputed_proxy_trip_rows", "trips_without_catch_rows")}))
    print("area=%s" % json.dumps({k: sum(r["area"] == k for r in rows) for k in ("ocean", "inland")}, sort_keys=True))
    print("species=%s" % json.dumps({s: sum(r["species_" + s] for r in rows) for s in catalog}, sort_keys=True))
    miss = {name: sum(r.get(name) in (None, "") for r in rows) for name in FEATURES}
    print("missing=%s" % json.dumps({k: {"n": v, "pct": round(100 * v / len(rows), 2)} for k, v in miss.items()}, sort_keys=True))
    print("wrote=%s" % a.out)
    print("runtime_seconds=%.1f" % (time.monotonic() - started))


if __name__ == "__main__":
    main()
