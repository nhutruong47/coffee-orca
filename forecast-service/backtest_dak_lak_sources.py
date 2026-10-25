"""Compare independent public Dak Lak price sources with leakage-safe splits."""
from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone

from daily_local import DATA, load_source_history, source_snapshot

METHODS = ("persistence", "mean3", "mean5", "median5", "drift3", "drift5")
MIN_TRAIN = 40
MIN_VALIDATION = 8
MIN_HOLDOUT = 8
MIN_DIRECTION_CALLS = 8
MIN_MAE_SKILL = 5.0
MIN_DIRECTION_HIT = 55.0
HOLDOUT_START = "2026-09-01"
HOLDOUT_END_EXCLUSIVE = "2026-10-01"


def predict(history: list[float], method: str) -> float:
    last = history[-1]
    changes = [b - a for a, b in zip(history, history[1:])]
    if method == "persistence" or not changes:
        return last
    if method == "mean3":
        return last + statistics.mean(changes[-3:])
    if method == "mean5":
        return last + statistics.mean(changes[-5:])
    if method == "median5":
        return last + statistics.median(changes[-5:])
    if method == "drift3":
        return last + 0.25 * statistics.mean(changes[-3:])
    if method == "drift5":
        return last + 0.25 * statistics.mean(changes[-5:])
    raise ValueError(f"Unknown method: {method}")


def score(history: list[float], start: int, stop: int, method: str) -> dict:
    errors = []
    relative_errors = []
    calls = []
    changed_count = 0
    for i in range(start, stop):
        baseline = history[i - 1]
        actual = history[i]
        estimate = predict(history[:i], method)
        error = estimate - actual
        errors.append(error)
        relative_errors.append(abs(error / actual))
        if actual != baseline:
            changed_count += 1
            if estimate != baseline:
                calls.append((estimate, actual, baseline))
    n = len(errors)
    return {
        "n": n,
        "mae_vnd_kg": round(statistics.mean(abs(e) for e in errors), 2) if n else None,
        "rmse_vnd_kg": round(math.sqrt(statistics.mean(e * e for e in errors)), 2) if n else None,
        "mape_pct": round(statistics.mean(relative_errors) * 100, 3) if n else None,
        "within_0_5pct_pct": round(100 * statistics.mean(e <= 0.005 for e in relative_errors), 1) if n else None,
        "within_1pct_pct": round(100 * statistics.mean(e <= 0.01 for e in relative_errors), 1) if n else None,
        "within_2pct_pct": round(100 * statistics.mean(e <= 0.02 for e in relative_errors), 1) if n else None,
        "changed_days": changed_count,
        "direction_calls": len(calls),
        "direction_call_coverage_pct": round(100 * len(calls) / changed_count, 1) if changed_count else None,
        "direction_hit_when_called_pct": round(
            100 * statistics.mean((estimate - baseline) * (actual - baseline) > 0 for estimate, actual, baseline in calls), 1
        ) if calls else None,
    }


def _insufficient(source_id: str, raw_rows: list[tuple[str, float]], frozen_distinct: list[tuple[str, float]], holdout_distinct: list[tuple[str, float]], reason: str) -> dict:
    snap = source_snapshot(source_id)
    return {
        "source": snap,
        "status": "insufficient_independent_history",
        "target": "Đắk Lắk Robusta reference, VND/kg; not a specific dealer transaction quote",
        "raw_observations": len(raw_rows),
        "raw_latest_date": raw_rows[-1][0] if raw_rows else None,
        "cutoff_exclusive": HOLDOUT_END_EXCLUSIVE,
        "holdout_start": HOLDOUT_START,
        "pre_holdout_distinct_moves": len(frozen_distinct),
        "holdout_distinct_moves": len(holdout_distinct),
        "minimum_training_rows": MIN_TRAIN,
        "minimum_validation_rows": MIN_VALIDATION,
        "minimum_holdout_rows": MIN_HOLDOUT,
        "validation_candidate": "none",
        "deployed_method": "none",
        "decision": reason,
    }


def _source_report(source_id: str) -> dict:
    raw_rows = load_source_history(source_id)
    raw_latest_date = raw_rows[-1][0] if raw_rows else None
    pre_holdout_raw = [row for row in raw_rows if row[0] < HOLDOUT_START]
    holdout_raw = [row for row in raw_rows if HOLDOUT_START <= row[0] < HOLDOUT_END_EXCLUSIVE]
    pre_holdout = [row for i, row in enumerate(pre_holdout_raw) if i == 0 or row[1] != pre_holdout_raw[i - 1][1]]
    holdout = [row for i, row in enumerate(holdout_raw) if i == 0 or row[1] != holdout_raw[i - 1][1]]
    if len(pre_holdout) < MIN_TRAIN + MIN_VALIDATION or len(holdout) < MIN_HOLDOUT:
        reason = (
            f"Insufficient independent history in frozen periods: {len(pre_holdout)} distinct pre-holdout price moves "
            f"and {len(holdout)} holdout moves; require at least {MIN_TRAIN + MIN_VALIDATION} and {MIN_HOLDOUT}."
        )
        return _insufficient(source_id, raw_rows, pre_holdout, holdout, reason)

    pre_dates = [day for day, _ in pre_holdout]
    pre_values = [value for _, value in pre_holdout]
    holdout_dates = [day for day, _ in holdout]
    holdout_values = [value for _, value in holdout]
    validation_count = max(MIN_VALIDATION, int(len(pre_values) * 0.20))
    train_end = len(pre_values) - validation_count
    if train_end < MIN_TRAIN:
        reason = f"Not enough training rows after reserving validation: {train_end}; minimum is {MIN_TRAIN}."
        return _insufficient(source_id, raw_rows, pre_holdout, holdout, reason)

    validation_scores = {
        method: score(pre_values, train_end, len(pre_values), method)
        for method in METHODS
    }
    baseline_mae = validation_scores["persistence"]["mae_vnd_kg"]
    eligible = []
    for method in METHODS:
        if method == "persistence":
            continue
        candidate = validation_scores[method]
        if (
            candidate["mae_vnd_kg"] <= baseline_mae * (1 - MIN_MAE_SKILL / 100)
            and candidate["direction_calls"] >= MIN_DIRECTION_CALLS
            and candidate["direction_hit_when_called_pct"] is not None
            and candidate["direction_hit_when_called_pct"] >= MIN_DIRECTION_HIT
        ):
            eligible.append(method)
    validation_candidate = min(eligible, key=lambda m: validation_scores[m]["mae_vnd_kg"]) if eligible else "persistence"

    history_plus_holdout = pre_values + holdout_values
    holdout_start_index = len(pre_values)
    holdout_scores = {
        method: score(history_plus_holdout, holdout_start_index, len(history_plus_holdout), method)
        for method in METHODS
    }
    holdout_baseline = holdout_scores["persistence"]
    candidate_holdout = holdout_scores[validation_candidate]
    candidate_passed_holdout = validation_candidate != "persistence" and (
        candidate_holdout["mae_vnd_kg"] < holdout_baseline["mae_vnd_kg"]
        and candidate_holdout["direction_calls"] >= MIN_DIRECTION_CALLS
        and candidate_holdout["direction_hit_when_called_pct"] is not None
        and candidate_holdout["direction_hit_when_called_pct"] >= MIN_DIRECTION_HIT
    )

    # Do not deploy price-direction signals from a single short holdout.
    deployed_method = "persistence"
    if validation_candidate != "persistence" and not candidate_passed_holdout:
        decision = "Ứng viên qua validation nhưng không qua holdout cố định; không triển khai dự báo hướng."
    elif candidate_passed_holdout:
        decision = "Ứng viên qua validation và holdout ngắn; chưa triển khai tín hiệu thật, cần holdout mới qua thêm mùa vụ."
    else:
        decision = "Chưa có ứng viên vượt tiêu chí validation; giữ benchmark giữ giá, không phát tín hiệu tăng/giảm."

    return {
        "source": source_snapshot(source_id),
        "status": "evaluated",
        "target": "Đắk Lắk Robusta price reference, VND/kg; not a specific dealer transaction quote",
        "raw_observations": len(raw_rows),
        "raw_latest_date": raw_latest_date,
        "pre_holdout_independent_moves": len(pre_values),
        "holdout_independent_moves": len(holdout_values),
        "split": {
            "training_last_observation": pre_dates[train_end - 1],
            "validation_start": pre_dates[train_end],
            "validation_end": pre_dates[-1],
            "holdout_start": holdout_dates[0],
            "holdout_end": holdout_dates[-1],
            "train_rows": train_end,
            "validation_rows": validation_count,
            "holdout_rows": len(holdout_values),
            "scoring_note": "Collapsed consecutive identical published quotes; validation and holdout are separate calendar periods, and holdout is never used for model selection.",
        },
        "selection_rule": (
            f"Validation candidate must improve MAE by at least {MIN_MAE_SKILL}% over persistence and achieve "
            f"at least {MIN_DIRECTION_HIT}% directional accuracy on at least {MIN_DIRECTION_CALLS} calls; "
            "it must also beat persistence on the fixed holdout. No signal is deployed until additional seasonal holdouts confirm it."
        ),
        "validation_scores": validation_scores,
        "validation_candidate": validation_candidate,
        "validation_candidate_validation_skill_pct": round(
            (1 - validation_scores[validation_candidate]["mae_vnd_kg"] / baseline_mae) * 100, 2
        ) if baseline_mae else 0,
        "validation_candidate_holdout_score": candidate_holdout,
        "validation_candidate_holdout_skill_pct": round(
            (1 - candidate_holdout["mae_vnd_kg"] / holdout_baseline["mae_vnd_kg"]) * 100, 2
        ) if holdout_baseline["mae_vnd_kg"] else 0,
        "validation_candidate_passed_holdout": candidate_passed_holdout,
        "holdout_persistence_score": holdout_baseline,
        "deployed_method": deployed_method,
        "deployed_holdout_score": holdout_baseline,
        "decision": decision,
    }


def run() -> dict:
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Compare independent Dak Lak source histories with fixed train/validation/holdout periods; never merge methodologies.",
        "sources": {source: _source_report(source) for source in ("nongdanviet", "thitruongcaphe")},
        "caveat": "The public provincial histories cover only a few months; within-band closeness is not directional accuracy. Prices are compiled references, not individual dealer transaction quotes.",
    }
    (DATA / "dak_lak_source_comparison.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
