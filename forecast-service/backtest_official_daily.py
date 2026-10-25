"""Leakage-safe daily backtest for the Ministry-attributed national Robusta series."""
from __future__ import annotations

import csv
import json
import math
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

from official_robusta_daily import DATA, LICENSE_URL, SERIES_ID, SOURCE_URL, fetch

ROOT = Path(__file__).resolve().parent
METHODS = ("persistence", "ridge_0.1", "ridge_1", "ridge_10", "hgb_3", "extra_5")


def load_data(refresh: bool = False) -> list[tuple[str, float]]:
    if refresh or not (DATA / "vn_robusta_daily_official.csv").exists():
        fetch()
    with (DATA / "vn_robusta_daily_official.csv").open(encoding="utf-8") as f:
        rows = [(r["date"], float(r["price_vnd_kg"])) for r in csv.DictReader(f)]
    return sorted(dict(rows).items())


def features_for(prices: np.ndarray, dates: list[date]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    log_returns = np.zeros(len(prices), dtype=float)
    log_returns[1:] = np.diff(np.log(prices))
    x, y, target_indices = [], [], []
    for index in range(30, len(prices) - 1):
        recent_returns = log_returns[: index + 1]
        observed_date = dates[index]
        row = [recent_returns[-lag] for lag in range(1, 6)]
        for window in (3, 5, 10, 20):
            row.extend((
                float(np.sum(recent_returns[-window:])),
                float(np.std(recent_returns[-window:])),
                float(prices[index] / prices[index - window] - 1),
            ))
        row.extend((
            math.sin(2 * math.pi * observed_date.month / 12),
            math.cos(2 * math.pi * observed_date.month / 12),
            math.sin(2 * math.pi * observed_date.weekday() / 7),
            math.cos(2 * math.pi * observed_date.weekday() / 7),
        ))
        x.append(row)
        y.append(math.log(prices[index + 1] / prices[index]))
        target_indices.append(index + 1)
    return np.asarray(x), np.asarray(y), np.asarray(target_indices)


def predict_in_walk_forward(
    method: str,
    x: np.ndarray,
    y: np.ndarray,
    target_indices: np.ndarray,
    prices: np.ndarray,
    start: int,
    stop: int,
    retrain_every: int = 10,
) -> list[tuple[float, float, float]]:
    results: list[tuple[float, float, float]] = []
    for batch_start in range(start, stop, retrain_every):
        batch_stop = min(batch_start + retrain_every, stop)
        if method == "persistence":
            returns = np.zeros(batch_stop - batch_start)
        else:
            train_x = x[:batch_start]
            train_y = y[:batch_start]
            if method.startswith("ridge_"):
                alpha = float(method.split("_")[1])
                model = Ridge(alpha=alpha).fit(train_x, train_y)
            elif method == "hgb_3":
                model = HistGradientBoostingRegressor(
                    max_iter=60,
                    max_leaf_nodes=3,
                    l2_regularization=5,
                    learning_rate=0.05,
                    min_samples_leaf=30,
                    random_state=42,
                ).fit(train_x, train_y)
            elif method == "extra_5":
                model = ExtraTreesRegressor(
                    n_estimators=50,
                    min_samples_leaf=5,
                    max_features=0.8,
                    n_jobs=1,
                    random_state=42,
                ).fit(train_x, train_y)
            else:
                raise ValueError(f"Unknown model: {method}")
            returns = model.predict(x[batch_start:batch_stop])
        for offset, predicted_return in enumerate(returns):
            row_index = batch_start + offset
            target_index = int(target_indices[row_index])
            base = float(prices[target_index - 1])
            actual = float(prices[target_index])
            predicted = base * math.exp(float(predicted_return))
            results.append((predicted, actual, base))
    return results


def score(rows: list[tuple[float, float, float]]) -> dict:
    predicted = np.asarray([row[0] for row in rows], dtype=float)
    actual = np.asarray([row[1] for row in rows], dtype=float)
    base = np.asarray([row[2] for row in rows], dtype=float)
    errors = predicted - actual
    pct_errors = np.abs(errors / actual)
    actual_changed = actual != base
    predicted_moved = predicted != base
    direction_scored = actual_changed & predicted_moved
    return {
        "n": int(len(rows)),
        "mae_vnd_kg": round(float(np.mean(np.abs(errors))), 2),
        "rmse_vnd_kg": round(float(np.sqrt(np.mean(errors**2))), 2),
        "mape_pct": round(float(np.mean(pct_errors) * 100), 4),
        "within_0_5pct_pct": round(float(np.mean(pct_errors <= 0.005) * 100), 2),
        "within_1pct_pct": round(float(np.mean(pct_errors <= 0.01) * 100), 2),
        "within_2pct_pct": round(float(np.mean(pct_errors <= 0.02) * 100), 2),
        "within_3pct_pct": round(float(np.mean(pct_errors <= 0.03) * 100), 2),
        "direction_calls": int(np.sum(direction_scored)),
        "direction_coverage_on_changed_days_pct": round(
            float(np.mean(predicted_moved[actual_changed]) * 100), 2
        ) if np.any(actual_changed) else None,
        "direction_hit_when_called_pct": round(
            float(np.mean(np.sign(predicted[direction_scored] - base[direction_scored])
                          == np.sign(actual[direction_scored] - base[direction_scored])) * 100), 2
        ) if np.any(direction_scored) else None,
        "naive_persistence_mae_vnd_kg": round(float(np.mean(np.abs(actual - base))), 2),
        "skill_vs_persistence_pct": round(
            float((1 - np.mean(np.abs(errors)) / np.mean(np.abs(actual - base))) * 100), 2
        ) if np.mean(np.abs(actual - base)) else 0.0,
    }


def run(refresh: bool = False) -> dict:
    observations = load_data(refresh=refresh)
    day_strings = [row[0] for row in observations]
    days = [date.fromisoformat(day) for day in day_strings]
    prices = np.asarray([row[1] for row in observations], dtype=float)
    x, y, target_indices = features_for(prices, days)
    supervised_count = len(y)
    validation_start = int(supervised_count * 0.60)
    holdout_start = int(supervised_count * 0.80)

    validation = {
        method: score(predict_in_walk_forward(
            method, x, y, target_indices, prices, validation_start, holdout_start
        ))
        for method in METHODS
    }
    selected = min(validation, key=lambda name: validation[name]["mae_vnd_kg"])
    holdout = {
        method: score(predict_in_walk_forward(
            method, x, y, target_indices, prices, holdout_start, supervised_count
        ))
        for method in METHODS
    }
    index_validation, index_holdout = int(target_indices[validation_start]), int(target_indices[holdout_start])
    report = {
        "target": "Vietnam national daily Robusta price series; not Dak Lak-specific farmgate price",
        "series_id": SERIES_ID,
        "series_name": "Coffee Robusta (Ministry of Agriculture and Environment source)",
        "unit": "VND/kg",
        "observations": len(observations),
        "first_observation": day_strings[0],
        "last_observation": day_strings[-1],
        "latest_observation_age_days": (date.today() - days[-1]).days,
        "source_url": SOURCE_URL,
        "api_url": f"https://dulieukinhte.com/api/internal/data/series?ids={SERIES_ID}",
        "source_credit": "Trung tâm Thông tin (Bộ NN&MT), via Dữ Liệu Kinh Tế",
        "license_url": LICENSE_URL,
        "methodology": {
            "feature_info": "Lagged daily log returns, rolling return/volatility and price momentum windows (3/5/10/20 observations), month/weekday seasonality.",
            "target": "Next observed official-series price, not necessarily the next calendar day.",
            "training": "Expanding-origin walk-forward; model refit every 10 test rows using only observations available before each forecast.",
            "split": "Chronological 60% training / 20% model-selection validation / 20% untouched final holdout.",
            "model_selection": "Lowest validation MAE. Holdout does not select or tune a model.",
            "accuracy_metric": "Percentage of test predictions within 2% of the next observed price.",
        },
        "split_dates": {
            "validation_start": day_strings[index_validation - 1],
            "validation_end": day_strings[index_holdout - 1],
            "holdout_start": day_strings[index_holdout],
            "holdout_end": day_strings[-1],
        },
        "selected_by_validation": selected,
        "validation_scores": validation,
        "holdout_scores": holdout,
        "deployed_reference": "persistence",
        "interpretation": (
            "Use within_2pct_pct only as price-level closeness. It does not mean correct up/down direction. "
            "The persistence baseline predicts no price change and has zero directional calls. "
            "Do not present this national series as a Dak Lak quote or as a live forecast if its last observation is stale."
        ),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (DATA / "daily_robusta_backtest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    print(json.dumps(run(refresh=True), ensure_ascii=False, indent=2))
