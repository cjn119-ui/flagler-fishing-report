#!/usr/bin/env python3
"""Build a statewide Florida shore-intercept MRIP context artifact.

This intentionally reports statewide saltwater shore-survey context. It is not
a county-level estimate or a prediction for a specific selected map point.
Uses the cached NOAA MRIP public-use files and the same transparent estimator
as build_first_coast_history.py; it does not change the First Coast artifact.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import build_first_coast_history as base

# Florida county FIPS codes, including interior counties. MRIP shore mode plus
# AREA_X (ocean / inland) remains the saltwater sampling boundary.
COUNTIES = {
    "1":"Alachua", "3":"Baker", "5":"Bay", "7":"Bradford", "9":"Brevard",
    "11":"Broward", "13":"Calhoun", "15":"Charlotte", "17":"Citrus", "19":"Clay",
    "21":"Collier", "23":"Columbia", "27":"DeSoto", "29":"Dixie", "31":"Duval",
    "33":"Escambia", "35":"Flagler", "37":"Franklin", "39":"Gadsden", "41":"Gilchrist",
    "43":"Glades", "45":"Gulf", "47":"Hamilton", "49":"Hardee", "51":"Hendry",
    "53":"Hernando", "55":"Highlands", "57":"Hillsborough", "59":"Holmes",
    "61":"Indian River", "63":"Jackson", "65":"Jefferson", "67":"Lafayette", "69":"Lake",
    "71":"Lee", "73":"Leon", "75":"Levy", "77":"Liberty", "79":"Madison",
    "81":"Manatee", "83":"Marion", "85":"Martin", "86":"Miami-Dade", "87":"Monroe",
    "89":"Nassau", "91":"Okaloosa", "93":"Okeechobee", "95":"Orange", "97":"Osceola",
    "99":"Palm Beach", "101":"Pasco", "103":"Pinellas", "105":"Polk", "107":"Putnam",
    "109":"St. Johns", "111":"St. Lucie", "113":"Santa Rosa", "115":"Sarasota",
    "117":"Seminole", "119":"Sumter", "121":"Suwannee", "123":"Taylor", "125":"Union",
    "127":"Volusia", "129":"Wakulla", "131":"Walton", "133":"Washington",
}
REGIONS = {
    "eastAtlantic": {"label": "Florida East Atlantic", "counties": ["9", "11", "31", "35", "61", "85", "86", "89", "99", "109", "111", "127"]},
    "gulf": {"label": "Florida Gulf Coast", "counties": ["5", "15", "17", "21", "29", "33", "37", "45", "53", "57", "71", "75", "81", "91", "101", "103", "113", "115", "123", "129", "131", "133"]},
    "keys": {"label": "Florida South Atlantic & Keys", "counties": ["11", "86", "87", "99"]},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), "..", ".cache", "mrip"))
    parser.add_argument("--years", default="2015-2025")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "v5", "data", "florida-coastal-history.json"))
    args = parser.parse_args()
    start, end = map(int, args.years.split("-"))
    years = set(range(start, end + 1))
    os.makedirs(args.cache, exist_ok=True)
    trips, qa = base.collect_mrip(args.cache, years, COUNTIES)
    catalog = base.species_catalog()
    def history_for(group, label, diagnostics=None):
        artifact = {"region": label, "years": [start, end], "qa": diagnostics or {}, "notes": [
            "NOAA MRIP Access Point Angler Intercept Survey, Florida shore mode (MODE_FX=3), interviewed anglers.",
            "Rates are survey context for the named county group, not catch probabilities or point-specific estimates.",
            "Ocean (AREA_X=1) and inland/estuarine (AREA_X=5) shore strata are retained separately.",
            "Estimator, non-proxy denominator and species alias union match build_first_coast_history.py.",
            "County grouping is a broad coastal region; local habitat and current conditions still vary by point.",
        ]}
        if "Keys" in label:
            artifact["notes"].append("The cached 2015-2025 shore sample has no Monroe County interviews; this South Atlantic context comes from adjacent Broward, Miami-Dade and Palm Beach Counties.")
        for area in base.AREAS.values():
            rows = [trip for trip in group if trip["area"] == area]
            artifact[area] = {
                "all": base.summarize(rows, catalog),
                "by_month": {str(month): base.summarize([trip for trip in rows if trip["month"] == month], catalog) for month in range(1, 13)},
            }
            for summary in artifact[area]["by_month"].values():
                if "species" in summary:
                    summary["species"] = dict(list(summary["species"].items())[:15])
        artifact["water_temp"] = {"station": None, "by_day_of_year": [None] * 365, "years_with_data": []}
        return artifact
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "region": "Florida statewide saltwater shore surveys",
        "years": [start, end],
        "notes": [
            "NOAA MRIP Access Point Angler Intercept Survey, Florida shore mode (MODE_FX=3), interviewed anglers.",
            "Statewide coastal context only; these rates are not local to a selected point and are not catch probabilities.",
            "Ocean (AREA_X=1) and inland/estuarine (AREA_X=5) shore strata are retained separately.",
            "Survey methods, estimator, non-proxy denominator and species alias union match build_first_coast_history.py.",
            "Point-specific current weather and marine inputs are fetched separately; no First Coast water-temperature climatology is reused.",
        ],
        "bait_excluded": sorted(base.BAIT),
        "qa": qa,
    }
    statewide = history_for(list(trips.values()), "Florida statewide saltwater shore surveys", qa)
    for area in base.AREAS.values():
        result[area] = statewide[area]
    result["water_temp"] = statewide["water_temp"]
    result["regions"] = {}
    for key, config in REGIONS.items():
        codes = set(config["counties"])
        region_trips = [trip for trip in trips.values() if trip["county"] in codes]
        region_qa = {"trip_rows": len(region_trips), "county_codes": sorted(codes, key=int),
                     "county_names": [COUNTIES[code] for code in sorted(codes, key=int)]}
        result["regions"][key] = history_for(region_trips, config["label"] + " shore surveys", region_qa)
    # Leave all Florida-wide climatologies unavailable rather than borrowing
    # NDBC 41117 from the First Coast.
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as output:
        json.dump(result, output, separators=(",", ":"))
    print(f"wrote {args.out}: ocean n={result['ocean']['all']['n']} inland n={result['inland']['all']['n']}", file=sys.stderr)


if __name__ == "__main__":
    main()
