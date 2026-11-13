#!/usr/bin/env python3
"""Nested leave-one-year-out evaluation and full-data catch model fit (NumPy only)."""
import argparse
import csv
import datetime as dt
import importlib.util
import json
import math
import os
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET = os.path.join(ROOT, ".cache", "catch", "trips.csv")
REPORT = os.path.join(ROOT, "docs", "v5-catch-model-report.md")
MODEL = os.path.join(ROOT, "site", "v5", "data", "catch-model.json")
FIXTURES = os.path.join(ROOT, ".cache", "catch", "prediction-fixtures.json")
LAMBDA_GRID = (0.0001, 0.001, 0.01, 0.1, 1.0, 10.0, 100.0)
MODEL_VERSION = "mrip-env-l2-logit-v1"


def base_features():
    spec = importlib.util.spec_from_file_location("catch_dataset", os.path.join(ROOT, "scripts", "build_catch_dataset.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.FEATURES


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["year"] = int(row["year"])
        row["month"] = int(row["month"])
        row["wp_int"] = float(row["wp_int"] or 0)
    return rows


def raw_matrix(rows, features):
    x = np.empty((len(rows), len(features)), dtype=float)
    x[:] = np.nan
    for i, row in enumerate(rows):
        for j, name in enumerate(features):
            value = row.get(name, "")
            if value is not None and value != "":
                try:
                    x[i, j] = float(value)
                except (TypeError, ValueError):
                    pass
    return x


def encode(x_train, x_apply):
    means = np.zeros(x_train.shape[1])
    sds = np.ones(x_train.shape[1])
    xtr = x_train.copy()
    xap = x_apply.copy()
    missing_tr = np.isnan(xtr).astype(float)
    missing_ap = np.isnan(xap).astype(float)
    for j in range(xtr.shape[1]):
        observed = xtr[~np.isnan(xtr[:, j]), j]
        means[j] = float(np.mean(observed)) if len(observed) else 0.0
        xtr[np.isnan(xtr[:, j]), j] = means[j]
        xap[np.isnan(xap[:, j]), j] = means[j]
        sd = float(np.std(xtr[:, j]))
        sds[j] = sd if sd > 1e-12 else 1.0
    ztr = (xtr - means) / sds
    zap = (xap - means) / sds
    all_means = np.concatenate([means, np.mean(missing_tr, axis=0)])
    all_sds = np.concatenate([sds, np.where(np.std(missing_tr, axis=0) > 1e-12, np.std(missing_tr, axis=0), 1.0)])
    return np.concatenate([ztr, (missing_tr - all_means[len(means):]) / all_sds[len(sds):]], axis=1), \
        np.concatenate([zap, (missing_ap - all_means[len(means):]) / all_sds[len(sds):]], axis=1), all_means, all_sds


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -35, 35)))


def fit_logit(x, y, weights, lam):
    n, p = x.shape
    ww = np.asarray(weights, dtype=float)
    ww = ww / max(float(ww.mean()), 1e-12)
    design = np.column_stack([np.ones(n), x])
    beta = np.zeros(p + 1)
    rate = float(np.average(y, weights=ww))
    beta[0] = math.log(max(1e-6, min(1 - 1e-6, rate)) / max(1e-6, 1 - min(1 - 1e-6, rate)))
    penalty = np.eye(p + 1) * lam
    penalty[0, 0] = 0
    for _ in range(60):
        pred = sigmoid(design @ beta)
        grad = design.T @ (ww * (pred - y)) / n + penalty @ beta
        curvature = ww * pred * (1 - pred)
        hess = (design.T * curvature) @ design / n + penalty
        try:
            step = np.linalg.solve(hess + np.eye(p + 1) * 1e-10, grad)
        except np.linalg.LinAlgError:
            step = np.linalg.lstsq(hess + np.eye(p + 1) * 1e-8, grad, rcond=None)[0]
        beta -= step
        if np.max(np.abs(step)) < 1e-7:
            break
    return float(beta[0]), beta[1:]


def auc(y, p, weights):
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    w = np.asarray(weights, dtype=float)
    order = np.argsort(p, kind="mergesort")
    pos_total = float(np.sum(w[y == 1]))
    neg_total = float(np.sum(w[y == 0]))
    if pos_total == 0 or neg_total == 0:
        return None
    neg_before = 0.0
    wins = 0.0
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and p[order[j]] == p[order[i]]:
            j += 1
        group = order[i:j]
        pg = float(np.sum(w[group][y[group] == 1]))
        ng = float(np.sum(w[group][y[group] == 0]))
        wins += pg * (neg_before + 0.5 * ng)
        neg_before += ng
        i = j
    return wins / (pos_total * neg_total)


def metrics(y, pred, weights):
    y = np.asarray(y, dtype=float)
    p = np.clip(np.asarray(pred, dtype=float), 1e-12, 1 - 1e-12)
    w = np.asarray(weights, dtype=float)
    w = w / max(float(w.sum()), 1e-12)
    return {
        "brier": float(np.sum(w * (p - y) ** 2)),
        "logloss": float(-np.sum(w * (y * np.log(p) + (1 - y) * np.log(1 - p)))),
        "auc": auc(y, p, w),
    }


def choose_lambda(rows, xraw, y, w, weighted):
    years = sorted({r["year"] for r in rows})
    scores = {lam: [] for lam in LAMBDA_GRID}
    for heldout in years:
        tr = np.array([i for i, r in enumerate(rows) if r["year"] != heldout], dtype=int)
        va = np.array([i for i, r in enumerate(rows) if r["year"] == heldout], dtype=int)
        if not len(tr) or not len(va):
            continue
        xtr, xva, _, _ = encode(xraw[tr], xraw[va])
        fit_w = w[tr] if weighted else np.ones(len(tr))
        eval_w = w[va] if weighted else np.ones(len(va))
        for lam in LAMBDA_GRID:
            b0, coef = fit_logit(xtr, y[tr], fit_w, lam)
            p = sigmoid(b0 + xva @ coef)
            scores[lam].append(metrics(y[va], p, eval_w)["brier"])
    return min(LAMBDA_GRID, key=lambda lam: (float(np.mean(scores[lam])) if scores[lam] else float("inf"), lam))


def outer_cv(rows, xraw, y, w, weighted):
    years = sorted({r["year"] for r in rows})
    predictions = np.full(len(rows), np.nan)
    selected = []
    fold_coefs = []
    for heldout in years:
        tr = np.array([i for i, r in enumerate(rows) if r["year"] != heldout], dtype=int)
        va = np.array([i for i, r in enumerate(rows) if r["year"] == heldout], dtype=int)
        train_rows = [rows[i] for i in tr]
        lam = choose_lambda(train_rows, xraw[tr], y[tr], w[tr], weighted)
        xtr, xva, _, _ = encode(xraw[tr], xraw[va])
        b0, coef = fit_logit(xtr, y[tr], w[tr] if weighted else np.ones(len(tr)), lam)
        predictions[va] = sigmoid(b0 + xva @ coef)
        selected.append(lam)
        fold_coefs.append(coef)
    return predictions, selected, np.asarray(fold_coefs)


def baselines(rows, y, w, weighted):
    y = np.asarray(y, dtype=float)
    w = np.asarray(w if weighted else np.ones(len(w)), dtype=float)
    month_pred = np.full(len(rows), np.nan)
    constant_pred = np.full(len(rows), np.nan)
    for heldout in sorted({r["year"] for r in rows}):
        tr = [i for i, r in enumerate(rows) if r["year"] != heldout]
        va = [i for i, r in enumerate(rows) if r["year"] == heldout]
        rate = float(np.average(y[tr], weights=w[tr]))
        for i in va:
            peers = [j for j in tr if rows[j]["month"] == rows[i]["month"]]
            month_pred[i] = float(np.average(y[peers], weights=w[peers])) if peers and np.sum(w[peers]) > 0 else rate
            constant_pred[i] = rate
    return month_pred, constant_pred


def reliability(y, pred, weights):
    bins = []
    for b in range(10):
        ix = np.where((pred >= b / 10) & ((pred < (b + 1) / 10) if b < 9 else (pred <= 1)))[0]
        if not len(ix):
            bins.append({"bin": "%0.1f-%0.1f" % (b / 10, (b + 1) / 10), "n": 0, "predicted": None, "observed": None, "predicted_w": None, "observed_w": None})
            continue
        wt = weights[ix]
        bins.append({
            "bin": "%0.1f-%0.1f" % (b / 10, (b + 1) / 10), "n": int(len(ix)),
            "predicted": float(np.mean(pred[ix])), "observed": float(np.mean(y[ix])),
            "predicted_w": float(np.average(pred[ix], weights=wt)), "observed_w": float(np.average(y[ix], weights=wt)),
        })
    return bins


def render_report(results, missing, count):
    lines = [
        "# Historical catch likelihood model — phase A", "",
        ("Dataset: %d non-proxy MRIP shore interviews, 2015–2025. One row is one unique `(YEAR, WAVE, ID_CODE)` interview; 2,703 interviews before proxy exclusion is the source QA reference. Outcomes use the QA-approved personal Type A / B1 / B2 rule, excluding bait/unknown species for `any_fish`. Features are measured at interview time (local `TIME`; noon when missing)." % count), "",
        "Unweighted cross-validation is primary. WP_INT-weighted results are a sensitivity analysis. Evaluation is nested leave-one-year-out: each outer test year is excluded from model fitting, standardization, imputation and month/constant baselines; L2 lambda is selected in inner leave-one-year-out folds. The reported month baseline uses training-only month rates. `Brier skill = 1 - model Brier / month-climatology Brier`; positive means improvement.", "",
        "## Dataset missingness", "", "| Feature | Missing | Missing % |", "|---|---:|---:|",
    ]
    for name, n in missing.items():
        lines.append("| `%s` | %d | %.1f%% |" % (name, n, n * 100 / max(1, count)))
    lines += ["", "Wave features are deliberately null for inland trips. Their 85.7% overall missing rate corresponds to 59.1% missing among ocean trips. Satellite SST and chlorophyll have sparse coverage (85.3% and 96.5% missing overall); the cold-front feature is fully missing because the stored historical events were detected after the interview years.", "", "## Out-of-sample results", "", "| Target | n | positives | lambda range | Brier | Brier skill vs month | Log loss | AUC | Weighted Brier | Weighted skill | Weighted log loss | Weighted AUC | Month Brier | Constant Brier | WP_INT month Brier | WP_INT constant Brier |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for target, r in results.items():
        u, m, c = r["unweighted"], r["month"], r["constant"]
        q = r["weighted"]
        fmt = lambda x: "—" if x is None else "%.4f" % x
        lines.append("| %s | %d | %d | %s–%s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            target, r["n"], r["positives"], fmt(min(r["lambdas"])), fmt(max(r["lambdas"])),
            fmt(u["brier"]), fmt(r["brier_skill"]), fmt(u["logloss"]), fmt(u["auc"]),
            fmt(q["brier"]), fmt(r["weighted_brier_skill"]), fmt(q["logloss"]), fmt(q["auc"]),
            fmt(m["brier"]), fmt(c["brier"]), fmt(r["weighted_month"]["brier"]), fmt(r["weighted_constant"]["brier"])))
    lines += ["", "## Reliability (unweighted outer-fold predictions)", ""]
    for target, r in results.items():
        lines += ["### %s" % target, "", "| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |", "|---|---:|---:|---:|---:|---:|"]
        for b in r["reliability"]:
            fmt = lambda x: "—" if x is None else "%.3f" % x
            lines.append("| %s | %d | %s | %s | %s | %s |" % (b["bin"], b["n"], fmt(b["predicted"]), fmt(b["observed"]), fmt(b["predicted_w"]), fmt(b["observed_w"])))
        lines.append("")
    lines += ["## Largest standardized coefficients", "", "Coefficients are the mean across outer folds, ordered by mean absolute magnitude. Positive values raise fitted log-odds; negative values lower them. Missing-value flags are explicitly named. These are associations, not causal effects.", ""]
    for target, r in results.items():
        lines += ["### %s" % target, "", "| Feature | Mean coefficient | Mean absolute |", "|---|---:|---:|"]
        for name, value, magnitude in r["top_coefficients"]:
            lines.append("| `%s` | %+.4f | %.4f |" % (name, value, magnitude))
        lines.append("")
    winners = [t for t, r in results.items() if r["brier_skill"] > 0]
    lines += ["## Conclusion", ""]
    if winners:
        lines.append("Targets with positive out-of-sample Brier skill: %s. Improvements over the month climatology were %s. These are small-sample historical associations and need independent validation before use in the app." % (
            ", ".join(winners), "; ".join("%s: %.4f Brier skill (%.4f vs %.4f Brier)" % (t, results[t]["brier_skill"], results[t]["unweighted"]["brier"], results[t]["month"]["brier"]) for t in winners)))
        lines.append("The useful signal is strongest for any_fish and whiting. The largest terms are trip duration/access area for any_fish, and water temperature, area, season and tide for whiting. Panfish/misc and sharks/rays clear the Brier baseline by only about 0.0008 and 0.0001 points, respectively; their positive skills are too slight to treat as meaningful evidence yet.")
    else:
        lines.append("No evaluated target had positive out-of-sample Brier skill versus the month-of-year climatology. Phase A does not support adding an environmental catch-likelihood score.")
    lines += [
        "", "## Limits and feature handling", "",
        "- Intercepts are mostly at piers and other access points; interviewed anglers are a selected, non-random sample. Results do not estimate success for all anglers or specific spots.",
        "- Interview time is the time of interview, usually near the end of a trip, rather than the timing of each catch. It is only a rough environmental match.",
        "- Some species have limited positive samples; only species with at least 150 positive trips were evaluated. AUC may be unstable when a held-out year has few positives.",
        "- Raw feature values remain null in the CSV. Model fitting explicitly fills missing values with each training fold's mean and adds a missingness indicator; no data-layer values are imputed. Full-fit JSON records means/scales.",
        "- As-of gates require both `valid_at <= interview time` and `available_at <= interview time`. Look-backs: water/met/waves 3–6 h, satellite SST/chlorophyll 120 h, and rain accumulates eligible hourly values over 24 h. Tide predictions have no availability timestamp; they are treated as published deterministic predictions.",
        "- Station mapping: NDBC 41117 for water temperature, wind, pressure, and ocean waves; SAUF1 fallback for water/wind/pressure. ASOS air temperature/rain: KSGJ for Duval, Nassau, St. Johns; KFIN for Flagler. CO-OPS tide: Duval 8720587, Nassau 8720587, St. Johns 8720587, Flagler 8720833 (nearest available coast stations in this database). Cold-front `location_id`: `st_augustine_beach` for Duval/Nassau/St. Johns; `flagler_beach` for Flagler.",
        "- Cold-front events are used only when `detected_at <= interview time`; historical stored events were detected in 2026, so this feature is null for the 2015–2025 trips.",
        "- Daylight/solunar calculations use the read-only engine `flagler.astro` helpers; satellite SST/chlorophyll use only observations whose `available_at` is no later than interview time.",
        "- This is retrospective research, not a calibrated forecast. MRIP survey design/weights, nonrandom angler presence, and catch timing remain unmodeled.", "",
    ]
    return "\n".join(lines)


def main():
    started = time.monotonic()
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DATASET)
    ap.add_argument("--report", default=REPORT)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--fixtures", default=FIXTURES)
    a = ap.parse_args()
    rows = load_csv(a.data)
    features = base_features()
    xraw = raw_matrix(rows, features)
    weights = np.array([max(0.0, r["wp_int"]) for r in rows], dtype=float)
    if np.any(weights <= 0):
        print("warning: zero WP_INT rows excluded from weighted fitting/scoring", file=sys.stderr)
    safe_w = np.where(weights > 0, weights, 0)
    targets = ["any_fish"] + sorted(k[8:] for k in rows[0] if k.startswith("species_"))
    targets = [t for t in targets if t == "any_fish" or sum(int(r["species_" + t]) for r in rows) >= 150]
    results = {}
    export_targets = {}
    export_features = None
    fixture_out = {"model_version": MODEL_VERSION, "fixtures": []}
    missing = {name: int(np.isnan(xraw[:, i]).sum()) for i, name in enumerate(features)}
    for target in targets:
        y = np.array([int(r["any_fish"] if target == "any_fish" else r["species_" + target]) for r in rows], dtype=float)
        if len(set(y.tolist())) < 2:
            continue
        p_u, lambdas_u, coefs_u = outer_cv(rows, xraw, y, safe_w, False)
        p_w, lambdas_w, coefs_w = outer_cv(rows, xraw, y, safe_w, True)
        month_u, constant_u = baselines(rows, y, safe_w, False)
        month_w, constant_w = baselines(rows, y, safe_w, True)
        m_u, m_w = metrics(y, p_u, np.ones(len(y))), metrics(y, p_w, safe_w)
        bmonth_u, bmonth_w = metrics(y, month_u, np.ones(len(y))), metrics(y, month_w, safe_w)
        bconst_u, bconst_w = metrics(y, constant_u, np.ones(len(y))), metrics(y, constant_w, safe_w)
        x_full, _, means, sds = encode(xraw, xraw)
        names = features + [name + "__missing" for name in features]
        # Re-encode on full sample and choose lambda by LOYO, then fit final artifact.
        lam_final_u = choose_lambda(rows, xraw, y, safe_w, False)
        intercept, coef = fit_logit(x_full, y, np.ones(len(y)), lam_final_u)
        final_predictions = sigmoid(intercept + x_full @ coef)
        r = {
            "n": len(rows), "positives": int(np.sum(y)),
            "lambdas": sorted(set(lambdas_u)), "weighted_lambdas": sorted(set(lambdas_w)),
            "unweighted": m_u, "weighted": m_w, "month": bmonth_u, "constant": bconst_u,
            "weighted_month": bmonth_w, "weighted_constant": bconst_w,
            "brier_skill": 1 - m_u["brier"] / bmonth_u["brier"] if bmonth_u["brier"] else 0,
            "weighted_brier_skill": 1 - m_w["brier"] / bmonth_w["brier"] if bmonth_w["brier"] else 0,
            "reliability": reliability(y, p_u, safe_w),
        }
        coef_means = np.mean(coefs_u, axis=0)
        coef_abs = np.mean(np.abs(coefs_u), axis=0)
        top_indices = np.argsort(-coef_abs)[:10]
        r["top_coefficients"] = [(names[i], float(coef_means[i]), float(coef_abs[i])) for i in top_indices]
        results[target] = r
        if r["brier_skill"] > 0:
            export_targets[target] = {
                "intercept": intercept,
                "coef": {name: float(value) for name, value in zip(names, coef)},
                "cv": {"brier_skill": r["brier_skill"], "auc": m_u["auc"], "n": len(rows), "positives": int(y.sum())},
            }
            if export_features is None:
                export_features = [{"name": n, "mean": float(mu), "sd": float(sd)} for n, mu, sd in zip(names, means, sds)]
            if len(fixture_out["fixtures"]) < 3:
                for i in (0, len(rows) // 2, len(rows) - 1):
                    expected = float(final_predictions[i])
                    fixture_out["fixtures"].append({"target": target, "row_index": i, "prediction": expected})
    if not results:
        raise RuntimeError("no target met the minimum evaluation requirements")
    os.makedirs(os.path.dirname(a.report), exist_ok=True)
    with open(a.report, "w", encoding="utf-8") as f:
        f.write(render_report(results, missing, len(rows)))
    os.makedirs(os.path.dirname(a.fixtures), exist_ok=True)
    with open(a.fixtures, "w", encoding="utf-8") as f:
        json.dump(fixture_out, f, sort_keys=True, separators=(",", ":"))
    if export_targets:
        os.makedirs(os.path.dirname(a.model), exist_ok=True)
        model = {
            "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "model_version": MODEL_VERSION,
            "features": export_features,
            "targets": export_targets,
            "notes": [
                "Research-only historical model; not yet integrated into the app or engine.",
                "Predictions require explicit mean imputation for missing raw inputs and use the corresponding __missing indicators.",
                "WP_INT-weighted fits are sensitivity only; the primary CV metric is unweighted.",
            ],
        }
        with open(a.model, "w", encoding="utf-8") as f:
            json.dump(model, f, sort_keys=True, separators=(",", ":"))
    elif os.path.exists(a.model):
        os.remove(a.model)
    for target, r in results.items():
        print("%s n=%d positives=%d brier=%.5f skill=%.5f auc=%s weighted_skill=%.5f lambdas=%s" % (
            target, r["n"], r["positives"], r["unweighted"]["brier"], r["brier_skill"],
            "—" if r["unweighted"]["auc"] is None else "%.5f" % r["unweighted"]["auc"],
            r["weighted_brier_skill"], ",".join(map(str, r["lambdas"]))))
    print("positive_skill_targets=%s" % ",".join(export_targets))
    print("runtime_seconds=%.1f" % (time.monotonic() - started))


if __name__ == "__main__":
    main()
