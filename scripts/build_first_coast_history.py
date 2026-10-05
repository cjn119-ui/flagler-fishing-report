#!/usr/bin/env python3
"""Build site/v5/data/first-coast-history.json from public NOAA data.

Offline, occasional job (not part of the 30-minute refresh):

  python3 scripts/build_first_coast_history.py [--cache DIR] [--years 2015-2025] [--with-volusia]

Sources (downloaded into --cache, reused on later runs):
  * NOAA MRIP Access Point Angler Intercept Survey microdata (trip_YYYYW.csv,
    catch_YYYYW.csv) from MRIP_Survey_Data/CSV/ps_*.zip. Each trip row is one
    interviewed angler; catch rows give that angler's TOT_CAT per species.
  * NDBC 41117 (St. Augustine offshore) yearly standard meteorological archives,
    for a water-temperature climatology.

First Coast = Florida (ST 12) counties Duval 31, Flagler 35, Nassau 89, St. Johns 109.
Shore mode only (MODE_FX 3). AREA_X 1 (ocean <= 3 mi) is the surf/pier bucket;
AREA_X 5 (inland) is kept separately for a future inshore view.

Rates are unweighted shares of interviewed anglers plus WP_INT-weighted versions.
They describe what intercepted anglers reported, mostly at piers, not a
calibrated forecast for a specific day.
"""
import argparse, csv, glob, gzip, io, json, math, os, statistics, sys, urllib.request, zipfile
from collections import defaultdict
from datetime import datetime, timezone

MRIP_BASE = "https://www.st.nmfs.noaa.gov/st1/recreational/MRIP_Survey_Data/CSV"
NDBC_BASE = "https://www.ndbc.noaa.gov/data/historical/stdmet"
COUNTIES = {"31": "Duval", "35": "Flagler", "89": "Nassau", "109": "St. Johns"}
VOLUSIA = {"127": "Volusia"}
AREAS = {"1": "ocean", "5": "inland"}
MODE_F = {"1": "man-made (pier/jetty)", "3": "shore (other)", "4": "shore (other)", "5": "beach/bank"}
# Bait and forage; counted separately, never as a "catch" for the any-fish rate.
BAIT = {
    "HERRING FAMILY", "ANCHOVY FAMILY", "SCALED SARDINE", "SPANISH SARDINE", "ATLANTIC THREAD HERRING",
    "BALLYHOO", "MULLET FAMILY", "MULLET GENUS", "WHITE MULLET", "STRIPED MULLET", "ROUND SCAD",
    "BIGEYE SCAD", "ATLANTIC MENHADEN", "MENHADEN GENUS", "PINFISH", "ATLANTIC BUMPER",
}
UNKNOWN = {"", "UNIDENTIFIED FISH"}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    print("download", url, file=sys.stderr)
    tmp = path + ".part"
    with urllib.request.urlopen(url, timeout=300) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(tmp, path)
    return path


def ps_zip_names(years):
    names = set()
    for y in years:
        names.add("ps_2015_2019_csv.zip" if 2015 <= y <= 2019 else f"ps_{y}_csv.zip")
    return sorted(names)


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def read_zip_csvs(zpath, prefix, years):
    with zipfile.ZipFile(zpath) as z:
        for name in sorted(z.namelist()):
            base = os.path.basename(name)
            if not base.startswith(prefix) or not base.endswith(".csv"):
                continue
            year = int(base[len(prefix):len(prefix) + 4])
            if year not in years:
                continue
            with z.open(name) as raw:
                yield from csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1", newline=""))


def collect_mrip(cache, years, counties):
    zips = [fetch(f"{MRIP_BASE}/{n}", os.path.join(cache, n)) for n in ps_zip_names(years)]
    trips = {}
    for z in zips:
        for d in read_zip_csvs(z, "trip_", years):
            if d["ST"] != "12" or d["CNTY"] not in counties or d["MODE_FX"] != "3" or d["AREA_X"] not in AREAS:
                continue
            month = int(num(d.get("MONTH")) or 0)
            if not 1 <= month <= 12:
                continue
            t = (d.get("TIME") or "").strip()
            hour = int(t[:-2]) if t.isdigit() and len(t) >= 3 else None
            trips[d["ID_CODE"]] = {
                "year": int(d["YEAR"]), "month": month, "county": d["CNTY"], "area": AREAS[d["AREA_X"]],
                "mode_f": d.get("MODE_F", ""), "w": num(d.get("WP_INT")) or 0.0,
                "hrsf": num(d.get("HRSF")) or None, "hour": hour if hour is not None and 0 <= hour <= 23 else None,
                "catch": defaultdict(float),
            }
    for z in zips:
        for d in read_zip_csvs(z, "catch_", years):
            t = trips.get(d["ID_CODE"])
            if t is None:
                continue
            n = num(d.get("TOT_CAT"))
            if n > 0:
                t["catch"][(d.get("COMMON") or "").strip().upper()] += n
    return trips


def summarize(group):
    """Rates for a list of trips: unweighted and WP_INT-weighted."""
    n = len(group)
    if not n:
        return {"n": 0}
    W = sum(t["w"] for t in group) or None
    def rate(pred):
        u = sum(1 for t in group if pred(t)) / n
        w = (sum(t["w"] for t in group if pred(t)) / W) if W else None
        return round(u, 4), (round(w, 4) if w is not None else None)
    fish = lambda t: sum(v for k, v in t["catch"].items() if k not in BAIT and k not in UNKNOWN)
    any_u, any_w = rate(lambda t: fish(t) > 0)
    hrs = [t["hrsf"] for t in group if t["hrsf"]]
    species = defaultdict(lambda: [0, 0.0, 0.0])  # trips with >=1, total fish, weighted trips with >=1
    for t in group:
        for k, v in t["catch"].items():
            if k in UNKNOWN:
                continue
            s = species[k]
            s[0] += 1; s[1] += v; s[2] += t["w"]
    sp = {
        k: {"p": round(c / n, 4), "pw": round(w / W, 4) if W else None, "per_trip": round(tot / n, 3)}
        for k, (c, tot, w) in species.items()
    }
    return {
        "n": n,
        "p_any_fish": any_u, "p_any_fish_w": any_w,
        "fish_per_trip": round(sum(fish(t) for t in group) / n, 3),
        "median_hours": round(statistics.median(hrs), 2) if hrs else None,
        "species": dict(sorted(sp.items(), key=lambda kv: -kv[1]["p"])),
    }


def collect_water(cache, years, station="41117"):
    daily = defaultdict(list)
    for y in years:
        path = os.path.join(cache, f"{station}h{y}.txt.gz")
        try:
            fetch(f"{NDBC_BASE}/{station}h{y}.txt.gz", path)
        except Exception as e:  # station years before deployment 404
            print(f"skip {station} {y}: {e}", file=sys.stderr)
            continue
        by_day = defaultdict(list)
        with gzip.open(path, "rt") as f:
            header = None
            for line in f:
                parts = line.split()
                if line.startswith("#"):
                    header = header or [p.lstrip("#") for p in parts]
                    continue
                if not header or len(parts) != len(header):
                    continue
                row = dict(zip(header, parts))
                wt = num(row.get("WTMP"))
                if not row.get("WTMP") or wt >= 99 or wt <= 0:
                    continue
                by_day[(int(row["YY"]), int(row["MM"]), int(row["DD"]))].append(wt)
        for (yy, mm, dd), vals in by_day.items():
            doy = datetime(yy, mm, dd).timetuple().tm_yday
            daily[min(doy, 365)].append(statistics.fmean(vals))
    out = []
    for doy in range(1, 366):
        window = [v for k in range(doy - 7, doy + 8) for v in daily.get((k - 1) % 365 + 1, [])]
        if len(window) < 10:
            out.append(None)
            continue
        window.sort()
        q = lambda p: window[min(len(window) - 1, int(p * (len(window) - 1) + 0.5))]
        c2f = lambda c: round(c * 9 / 5 + 32, 1)
        out.append({"mean_f": c2f(statistics.fmean(window)), "p10_f": c2f(q(.1)), "p90_f": c2f(q(.9)), "n_days": len(window)})
    return {"station": station, "by_day_of_year": out, "years_with_data": sorted({y for y in years if os.path.exists(os.path.join(cache, f"{station}h{y}.txt.gz"))})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), "..", ".cache", "history"))
    ap.add_argument("--years", default="2015-2025")
    ap.add_argument("--with-volusia", action="store_true")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "v5", "data", "first-coast-history.json"))
    a = ap.parse_args()
    y0, y1 = map(int, a.years.split("-"))
    years = set(range(y0, y1 + 1))
    os.makedirs(a.cache, exist_ok=True)
    counties = dict(COUNTIES, **(VOLUSIA if a.with_volusia else {}))

    trips = collect_mrip(a.cache, years, counties)
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "region": "First Coast (NE Florida): " + ", ".join(counties.values()),
        "years": [y0, y1],
        "notes": [
            "MRIP Access Point Angler Intercept Survey microdata, Florida shore mode, interviewed anglers only.",
            "p = share of interviewed angler trips that reported >= 1 of that species; pw weights by WP_INT.",
            "p_any_fish excludes bait/forage species and unidentified fish.",
            "Ocean shore intercepts are mostly at man-made structures (piers/jetties).",
            "Interview hour is when the angler was interviewed, usually near the end of the trip.",
        ],
        "bait_excluded": sorted(BAIT),
    }
    for area in AREAS.values():
        group = [t for t in trips.values() if t["area"] == area]
        result[area] = {
            "all": summarize(group),
            "by_month": {str(m): summarize([t for t in group if t["month"] == m]) for m in range(1, 13)},
            "by_county": {name: summarize([t for t in group if t["county"] == c]) for c, name in counties.items()},
            "by_site_type": {label: summarize([t for t in group if MODE_F.get(t["mode_f"]) == label]) for label in sorted(set(MODE_F.values()))},
            "by_interview_hour": {f"{h:02d}": summarize([t for t in group if t["hour"] is not None and h <= t["hour"] < h + 3]) for h in range(0, 24, 3)},
            "by_year": {str(y): summarize([t for t in group if t["year"] == y]) for y in sorted(years)},
        }
        # Keep the per-slice species lists short; the "all" list keeps everything.
        for key in ("by_month", "by_county", "by_site_type", "by_interview_hour", "by_year"):
            for s in result[area][key].values():
                if "species" in s:
                    s["species"] = dict(list(s["species"].items())[:15])
    result["water_temp"] = collect_water(a.cache, years)

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(result, f, separators=(",", ":"))
    print(f"wrote {a.out}: ocean n={result['ocean']['all']['n']} inland n={result['inland']['all']['n']}", file=sys.stderr)


if __name__ == "__main__":
    main()
