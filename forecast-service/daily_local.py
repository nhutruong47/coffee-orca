"""Daily Dak Lak Robusta reference data and honest walk-forward forecast."""
from __future__ import annotations

import csv
import math
import re
import statistics
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SOURCE = "https://nongdanviet.vn/gia-ca-phe/dak-lak"
TMC_SOURCE = "https://thitruongcaphe.vn/gia-ca-phe/ngay"
TMC_METHOD = "https://thitruongcaphe.vn/phuong-phap"
USER_AGENT = "Mozilla/5.0 (compatible; CoffeeForecast/1.0)"
METHODS = ("persistence", "drift3", "drift5", "median5", "mean5")


def fetch_history() -> list[tuple[str, float]]:
    request = urllib.request.Request(SOURCE, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=40) as response:
        html = response.read().decode("utf-8", errors="ignore")
    matches = re.findall(
        r"<tr[^>]*>\s*<td[^>]*>(20\d{2}-\d{2}-\d{2})</td>\s*<td[^>]*>([\d.,]+)</td>",
        html,
        re.I,
    )
    values: dict[str, float] = {}
    for day, raw in matches:
        price = float(raw.replace(".", "").replace(",", ""))
        if 30_000 <= price <= 300_000 and day <= date.today().isoformat():
            values[day] = price
    if not values:
        raise ValueError("No dated Dak Lak prices found in the source table")
    return sorted(values.items())


def refresh() -> dict:
    rows = fetch_history()
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "dak_lak_daily.csv"
    temp = path.with_suffix(".csv.tmp")
    with temp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "price_vnd_kg", "source"])
        writer.writerows((day, price, SOURCE) for day, price in rows)
    temp.replace(path)
    return {"count": len(rows), "first": rows[0][0], "last": rows[-1][0],
            "price": rows[-1][1], "source": SOURCE}


def load_history() -> list[tuple[str, float]]:
    path = DATA / "dak_lak_daily.csv"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        rows = [(r["date"], float(r["price_vnd_kg"])) for r in csv.DictReader(f)]
    return sorted(dict(rows).items())


def load_source_history(source: str) -> list[tuple[str, float]]:
    if source == "nongdanviet":
        rows = load_history()
        if rows:
            return rows
        return []
    if source == "thitruongcaphe":
        path = DATA / "thitruongcaphe_daily.csv"
        if not path.exists():
            return []
        values = {}
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("province") == "dak_lak":
                    values[row["date"]] = float(row["price_vnd_kg"])
        return sorted(values.items())
    raise ValueError(f"Unknown price source: {source}")


def source_snapshot(source: str) -> dict:
    rows = load_source_history(source)
    metadata = {}
    if source == "nongdanviet":
        url, method_url, label = SOURCE, "https://nongdanviet.vn/phuong-phap-luan", "Nông Dân Việt"
    else:
        url, method_url, label = TMC_SOURCE, TMC_METHOD, "Thị Trường Cà Phê"
    path = DATA / ("dak_lak_daily.csv" if source == "nongdanviet" else "thitruongcaphe_daily_meta.json")
    if source == "thitruongcaphe" and path.exists():
        import json
        metadata = json.loads(path.read_text(encoding="utf-8"))
    counts = metadata.get("province_counts", {})
    return {
        "source_id": source,
        "source_name": label,
        "source_url": url,
        "methodology_url": method_url,
        "observations": len(rows),
        "first_observation": rows[0][0] if rows else None,
        "last_observation": rows[-1][0] if rows else None,
        "latest_price": round(rows[-1][1]) if rows else None,
        "province_counts": counts,
        "methodology": metadata.get("methodology") or "Giá Đắk Lắk theo bảng lịch sử công khai; giá tham khảo, không phải báo giá của một đại lý cụ thể.",
        "license_note": metadata.get("license") or "Nguồn công khai; cần ghi nguồn, quyền tái sử dụng chưa xác minh.",
        "comparison_explanation": (
            "Bảng ngày ghi mức giá tham khảo tại thời điểm tổng hợp; số liệu nguồn có thể khác nhau do cách khảo sát, bộ lọc và thời điểm cập nhật."
        ),
    }


def compare_source_backtests() -> dict:
    comparisons = {}
    for source in ("nongdanviet", "thitruongcaphe"):
        rows = load_source_history(source)
        if len(rows) < 60:
            continue
        # Daily feeds may repeat the same quote across weekends or carry it
        # forward when the market is closed. Preserve raw values on disk, but
        # score the first observation of each price run to avoid treating stale
        # repeats as independent forecast successes.
        scored_rows = [row for i, row in enumerate(rows) if i == 0 or row[1] != rows[i - 1][1]]
        values = [price for _, price in scored_rows]
        n = len(values)
        if n < 40:
            continue
        train_end, validation_end = int(n * 0.60), int(n * 0.80)
        result = {}
        for method in ("persistence", "mean3", "mean5", "median5", "ridge5"):
            scores = {}
            for lo, hi, label in ((train_end, validation_end, "validation"), (validation_end, n, "holdout")):
                pairs = [(_predict(values[:i], method), values[i], values[i - 1]) for i in range(lo, hi)]
                if not pairs:
                    scores[label] = None
                    continue
                errors = [pred - actual for pred, actual, _ in pairs]
                actuals = [actual for _, actual, _ in pairs]
                baselines = [base for _, _, base in pairs]
                pct_errors = [abs(err / actual) for err, actual in zip(errors, actuals)]
                changed = [(pred, actual, base) for pred, actual, base in pairs if actual != base]
                called = [(pred, actual, base) for pred, actual, base in changed if pred != base]
                hits = sum((pred - base) * (actual - base) > 0 for pred, actual, base in called)
                scores[label] = {
                    "n": len(pairs),
                    "mae_vnd_kg": round(statistics.mean(abs(err) for err in errors), 1),
                    "within_1pct_pct": round(100 * statistics.mean(e <= 0.01 for e in pct_errors), 1),
                    "within_2pct_pct": round(100 * statistics.mean(e <= 0.02 for e in pct_errors), 1),
                    "direction_calls": len(called),
                    "direction_hit_when_called_pct": round(100 * hits / len(called), 1) if called else None,
                }
            result[method] = scores
        comparison = {
            "source": source_snapshot(source),
            "scoring_note": "Consecutive identical published quotes are collapsed for scoring; raw source observations remain stored unchanged.",
            "split": {"training_last_observation": scored_rows[train_end - 1][0],
                      "validation_start": scored_rows[train_end][0],
                      "validation_end": scored_rows[validation_end - 1][0],
                      "holdout_start": scored_rows[validation_end][0],
                      "holdout_end": scored_rows[-1][0],
                      "raw_observations": len(rows), "scored_price_changes": n},
            "scores": result,
        }
        baseline_mae = result["persistence"]["validation"]["mae_vnd_kg"]
        selected = min((m for m in result if m != "persistence"),
                       key=lambda m: result[m]["validation"]["mae_vnd_kg"])
        selected_validation_mae = result[selected]["validation"]["mae_vnd_kg"]
        comparison["validation_selected_candidate"] = selected
        comparison["validation_skill_vs_persistence_pct"] = round((1 - selected_validation_mae / baseline_mae) * 100, 2)
        comparison["deployed_method"] = "persistence" if selected_validation_mae >= baseline_mae * 0.95 else selected
        comparison["decision"] = "keep_persistence_no_verified_gain" if comparison["deployed_method"] == "persistence" else "candidate_only_not_deployed_until_further_holdout"
        comparisons[source] = comparison
    return comparisons


def _predict(values: list[float], method: str) -> float:
    last = values[-1]
    changes = [b - a for a, b in zip(values, values[1:])]
    if method == "persistence" or not changes:
        return last
    if method == "drift3":
        step = statistics.mean(changes[-3:])
    elif method == "drift5":
        step = statistics.mean(changes[-5:])
    elif method == "median5":
        step = statistics.median(changes[-5:])
    elif method == "mean5":
        step = statistics.mean(changes[-5:])
    else:
        return last
    return last + step


def _evaluate(values: list[float], start: int, stop: int, method: str) -> dict:
    errors, direction_hits, changed = [], [], 0
    for i in range(start, stop):
        prediction = _predict(values[:i], method)
        actual, previous = values[i], values[i - 1]
        errors.append((prediction - actual, prediction, actual, previous))
        if actual != previous:
            changed += 1
            if prediction != previous and (prediction - previous) * (actual - previous) > 0:
                direction_hits.append(1)
            else:
                direction_hits.append(0)
    abs_errors = [abs(error) for error, *_ in errors]
    return {
        "n": len(errors),
        "mae": round(statistics.mean(abs_errors), 1) if abs_errors else None,
        "rmse": round(math.sqrt(statistics.mean(e * e for e, *_ in errors)), 1) if errors else None,
        "direction_hit_pct": round(100 * statistics.mean(direction_hits), 1) if direction_hits else None,
        "changed_days": changed,
        "abs_errors": abs_errors,
    }


def get_forecast(source: str = "nongdanviet") -> dict | None:
    rows = load_source_history(source)
    raw_observation_count = len(rows)
    raw_latest_date = rows[-1][0] if rows else None
    # Score after a frozen daily cutoff: do not move validation/holdout just
    # because fresh source rows arrive, and never learn hyperparameters from
    # the holdout period. Exclude carried/unchanged quote repeats from scoring.
    freeze_before = "2026-10-01"
    rows = [row for row in rows if row[0] < freeze_before]
    rows = [row for i, row in enumerate(rows) if i == 0 or row[1] != rows[i - 1][1]]
    n = len(rows)
    if n < 60:
        return None
    dates = [d for d, _ in rows]
    values = [p for _, p in rows]
    train_end = int(n * 0.60)
    validation_end = int(n * 0.80)
    if train_end < 40 or validation_end <= train_end or validation_end >= n:
        return None

    baseline_validation = _evaluate(values, train_end, validation_end, "persistence")
    candidate_validation = {
        name: _evaluate(values, train_end, validation_end, name)
        for name in METHODS if name != "persistence"
    }
    eligible = [
        (name, result) for name, result in candidate_validation.items()
        if result["mae"] is not None
        and result["mae"] <= baseline_validation["mae"] * 0.95
        and result["direction_hit_pct"] is not None
        and result["direction_hit_pct"] >= 55.0
    ]
    selected = min(eligible, key=lambda item: item[1]["mae"])[0] if eligible else "persistence"
    holdout = _evaluate(values, validation_end, n, selected)
    holdout_candidates = {
        name: _evaluate(values, validation_end, n, name)
        for name in METHODS
    }
    validation = baseline_validation if selected == "persistence" else candidate_validation[selected]

    # A historical validation error band is descriptive, not a guaranteed interval.
    calibration_errors = sorted(baseline_validation["abs_errors"])
    q90 = calibration_errors[min(len(calibration_errors) - 1, math.ceil(0.90 * len(calibration_errors)) - 1)]
    latest_date, latest_price = rows[-1]
    try:
        next_date = (date.fromisoformat(latest_date) + timedelta(days=1)).isoformat()
    except ValueError:
        next_date = ""
    # This legacy endpoint is retained for compatibility, but it is NOT a
    # deployable forecast: the current frozen Dak Lak holdout does not support
    # a directional model. Always expose the persistence reference only.
    selected = "persistence"
    prediction = round(values[-1])
    return {
        "region": "Đắk Lắk",
        "target": "Robusta nhân xô, giá tham khảo theo tỉnh (đồng/kg)",
        "source": source_snapshot(source)["source_url"],
        "source_name": source_snapshot(source)["source_name"],
        "source_id": source,
        "source_updated_at": latest_date,
        "observations": raw_observation_count,
        "scored_distinct_observations_before_holdout_cutoff": n,
        "history_start": dates[0],
        "history_end": latest_date,
        "latest_raw_source_date": raw_latest_date,
        "holdout_cutoff_exclusive": freeze_before,
        "next_date": next_date,
        "latest_price": round(latest_price),
        "forecast_price": prediction,
        "change_vnd": prediction - round(latest_price),
        "method": selected,
        "method_label": "Giữ nguyên giá gần nhất (mốc đối chiếu)" if selected == "persistence" else selected,
        "directional_signal": selected != "persistence" and prediction != round(latest_price),
        "reason": "Holdout cuối chưa xác nhận ứng viên vượt baseline. Giá giữ nguyên chỉ là mốc so sánh, không phải dự báo tăng/giảm.",
        "validation": {
            "from": dates[train_end], "to": dates[validation_end - 1],
            "baseline": {k: v for k, v in baseline_validation.items() if k != "abs_errors"},
            "selected": {k: v for k, v in validation.items() if k != "abs_errors"},
            "candidate_scores": {k: {kk: vv for kk, vv in v.items() if kk != "abs_errors"}
                                 for k, v in candidate_validation.items()},
        },
        "holdout": {
            "from": dates[validation_end], "to": dates[-1],
            "selected_method": selected,
            "scores": {name: {k: v for k, v in result.items() if k != "abs_errors"}
                       for name, result in holdout_candidates.items()},
        },
        "historical_error_q90_vnd": round(q90),
        "caveat": "Thử nghiệm chỉ có dữ liệu hằng ngày từ nguồn này trong khoảng thời gian ngắn; giá tham khảo không phải giá giao dịch của đại lý cụ thể. Khoảng sai số lịch sử không bảo đảm kết quả tương lai.",
    }

if __name__ == "__main__":
    import json
    print(json.dumps(get_forecast(), ensure_ascii=False, indent=2))
    print(json.dumps(refresh(), ensure_ascii=False, indent=2))
    print(json.dumps(get_forecast(), ensure_ascii=False, indent=2))


def load_frozen_dak_lak_comparison() -> dict:
    """Return the dated comparison report; never recompute from newly refreshed rows."""
    import json
    path = DATA / "dak_lak_source_comparison.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
