#!/usr/bin/env python3
"""Contract and exported-prediction reproducibility check for phase A model output."""
import csv
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, "site", "v5", "data", "catch-model.json")
DATA = os.path.join(ROOT, ".cache", "catch", "trips.csv")
FIXTURES = os.path.join(ROOT, ".cache", "catch", "prediction-fixtures.json")
REPORT = os.path.join(ROOT, "docs", "v5-catch-model-report.md")


def assert_close(a, b, tol=1e-10):
    assert abs(a - b) <= tol, "%.15g != %.15g" % (a, b)


def main():
    assert os.path.exists(DATA), "build the catch dataset first"
    assert os.path.exists(REPORT), "fit the model and write the report first"
    with open(FIXTURES, encoding="utf-8") as f:
        fixtures = json.load(f)
    assert fixtures.get("model_version") == "mrip-env-l2-logit-v1"
    if not os.path.exists(MODEL):
        assert not fixtures["fixtures"], "prediction fixtures require an exported positive-skill target"
        print("PASS: no target beat climatology; no model artifact or prediction fixtures")
        return
    with open(MODEL, encoding="utf-8") as f:
        model = json.load(f)
    assert set(("generated_at", "model_version", "features", "targets", "notes")) <= set(model)
    assert model["model_version"] == fixtures["model_version"]
    assert model["targets"]
    assert all(set(("name", "mean", "sd")) <= set(x) and x["sd"] > 0 for x in model["features"])
    assert all(set(("intercept", "coef", "cv")) <= set(t) for t in model["targets"].values())
    assert all(t["cv"]["brier_skill"] > 0 for t in model["targets"].values())
    with open(DATA, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert fixtures["fixtures"]
    for fixture in fixtures["fixtures"]:
        target = fixture["target"]
        assert target in model["targets"]
        row = rows[int(fixture["row_index"])]
        entry = model["targets"][target]
        score = entry["intercept"]
        for feature in model["features"]:
            name, mean, sd = feature["name"], feature["mean"], feature["sd"]
            if name.endswith("__missing"):
                value = float(row.get(name[:-9], "") in ("", None))
            else:
                raw = row.get(name, "")
                value = mean if raw in ("", None) else float(raw)
            score += entry["coef"][name] * ((value - mean) / sd)
        pred = 1 / (1 + math.exp(-max(-35, min(35, score))))
        assert_close(pred, fixture["prediction"])
    report = open(REPORT, encoding="utf-8").read()
    for target, entry in model["targets"].items():
        line = next((x for x in report.splitlines() if x.startswith("| %s |" % target)), None)
        assert line, "missing report row for " + target
        cells = line.split("|")[1:-1]
        assert math.isclose(float(cells[5].strip()), entry["cv"]["brier_skill"], abs_tol=5.1e-5)
    print("PASS: JSON contract; %d exported model predictions reproduce fixtures and report CV skill" % len(fixtures["fixtures"]))


if __name__ == "__main__":
    main()
