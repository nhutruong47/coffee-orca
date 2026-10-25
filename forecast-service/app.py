"""Web du doan gia ca phe: python app.py --port 8002."""
import os
import json
import time
import datetime
import threading
import sys
import bisect

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from flask import Flask, jsonify, render_template

from fetch_data import update_all, load_csv, DATA_DIR, REGIONS
import daily_local
import fetch_giacaphe_history
import fetch_tmc_history
import backtest_dak_lak_sources
import model_daklak_leadlag
import model as mdl
import model_robusta as mdrb
import gold as gld
import model_gold as mdg

BASE_PATH = os.environ.get("BASE_PATH", "").rstrip("/")
STALE_DAYS = 5

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Correlation-ID"
    return response
_lock = threading.Lock()
_state = {"busy": False, "last_error": None}


def read_json(name, default=None):
    p = os.path.join(DATA_DIR, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def build_regions():
    """Danh sach vung + du bao gia noi dia theo tung vung."""
    metrics = read_json("metrics.json", {})
    if not metrics:
        return []
    rmetrics = read_json("metrics_robusta.json", {}) or {}
    regions = read_json("regions.json", {}) or {}
    global_now = metrics.get("series", {}).get("last_price")
    fc = metrics.get("forecast", [])

    vn_path = os.path.join(DATA_DIR, "vn_domestic.csv")
    vn_rows = load_csv(vn_path) if os.path.exists(vn_path) else []
    vn_now = vn_rows[-1][1] if vn_rows else None
    rb_fc_vn = rmetrics.get("forecast", [])
    base_vn_now = None
    if rmetrics and vn_now:
        base_vn_now = rmetrics.get("daily_now")
        if not base_vn_now:
            conv = rmetrics.get("conversion", {})
            usd_now = rmetrics.get("series", {}).get("last_price_usd_kg")
            if usd_now:
                base_vn_now = usd_now * conv.get("fx", 0) * conv.get("basis", 1)

    nat = vn_reference()
    nat_price = nat.get("vn_price") if nat else None
    today = datetime.date.today()
    out = []
    for slug, info in regions.items():
        rows = []
        p = os.path.join(DATA_DIR, f"region_{slug}.csv")
        if os.path.exists(p):
            rows = load_csv(p)
        own_price = rows[-1][1] if rows else info.get("price")
        own_date = rows[-1][0] if rows else info.get("date")
        own_days = None
        if own_date:
            try:
                own_days = (today - datetime.date.fromisoformat(own_date)).days
            except Exception:
                own_days = None
        stale = own_days is None or own_days > STALE_DAYS
        price, estimated = own_price, False
        if stale:
            price = nat_price if nat_price else own_price
            estimated = True
        entry = {
            "slug": slug,
            "name": info.get("name", slug),
            "price": price,
            "estimated": estimated,
            "date": (nat.get("date") if estimated and nat else own_date),
            "days": len(rows),
            "stale": stale,
            "own_price": own_price,
            "own_date": own_date,
            "own_days": own_days,
            "source": info.get("source"),
        }
        if slug == "dak-lak":
            entry["forecast"] = []
            entry["forecast_vn"] = []
            entry["daily_vn"] = []
            entry["forecast_status"] = "lead_lag_international_transmission"
            entry["forecast_note"] = "Tín hiệu dẫn dắt từ sàn London (ICE Robusta) đêm qua + tỷ giá USD/VND"
        else:
            if price and global_now:
                entry["forecast"] = [{"h": r["h"], "price": round(price * (r["price"] / global_now))} for r in fc]
            else:
                entry["forecast"] = []
            if price and base_vn_now:
                entry["forecast_vn"] = [
                    {
                        "h": r["h"],
                        "vn_kg": round(price * (r["vn_kg"] / base_vn_now)),
                        "lo": round(price * (r["vn_lo"] / base_vn_now)),
                        "hi": round(price * (r["vn_hi"] / base_vn_now)),
                    }
                    for r in rb_fc_vn
                ]
            else:
                entry["forecast_vn"] = []
            daily = rmetrics.get("daily") or []
            dnow = rmetrics.get("daily_now")
            if price and dnow and daily:
                entry["daily_vn"] = [
                    {
                        "d": x["d"],
                        "vn_kg": round(price * x["vn_kg"] / dnow),
                        "lo": round(price * x["lo"] / dnow),
                        "hi": round(price * x["hi"] / dnow),
                    }
                    for x in daily
                ]
            else:
                entry["daily_vn"] = []
            entry["forecast_status"] = "derived_estimate_not_local_direction_validation"
        out.append(entry)
    return out


_rb_hist_cache = {"at": 0, "data": None}


def robusta_history_vn(limit=72):
    if _rb_hist_cache["data"] is not None and time.time() - _rb_hist_cache["at"] < 3600:
        return _rb_hist_cache["data"]
    try:
        import robusta as rb
        rmetrics = read_json("metrics_robusta.json", {}) or {}
        conv = rmetrics.get("conversion") or {}
        basis = conv.get("basis")
        fx = conv.get("fx")
        if not fx or not basis:
            return None
        rob = rb.monthly_prices()["Coffee, Robusta"]
        rows = [(m, round(v * fx * basis)) for m, v in rob]
        data = {
            "months": [m for m, _ in rows[-limit:]],
            "prices": [p for _, p in rows[-limit:]],
        }
        _rb_hist_cache.update({"at": time.time(), "data": data})
        return data
    except Exception:
        return None


_gold_hist_cache = {"at": 0, "data": None}


def gold_history(limit=72):
    if _gold_hist_cache["data"] is not None and time.time() - _gold_hist_cache["at"] < 3600:
        return _gold_hist_cache["data"]
    try:
        m = read_json("metrics_gold.json", {}) or {}
        conv = m.get("conversion") or {}
        basis = conv.get("basis")
        ozl = conv.get("oz_per_luong") or 1.20565
        if not basis:
            return None
        world = load_csv(os.path.join(DATA_DIR, "gold.csv"))
        fx_rows = sorted(load_csv(os.path.join(DATA_DIR, "usdvnd.csv")))
        fx_dates = [d for d, _ in fx_rows]

        def fx_at(d):
            i = bisect.bisect_right(fx_dates, d) - 1
            return fx_rows[max(0, i)][1]

        rows = world[-limit:]
        derived = [w * ozl * fx_at(d) * basis for d, w in rows]
        vn_now = conv.get("vn_now")
        if derived and vn_now:
            k = vn_now / derived[-1]
            derived = [v * k for v in derived]
        data = {
            "dates": [d for d, _ in rows],
            "derived": [round(v) for v in derived],
        }
        vp = os.path.join(DATA_DIR, "gold_vn.csv")
        if os.path.exists(vp):
            vn = sorted(load_csv(vp))
            data["vn_dates"] = [d for d, _ in vn]
            data["vn_prices"] = [round(v) for _, v in vn]
        _gold_hist_cache.update({"at": time.time(), "data": data})
        return data
    except Exception:
        return None


def region_history(slug="dak-lak", limit=60):
    p = os.path.join(DATA_DIR, f"region_{slug}.csv")
    if not os.path.exists(p):
        return {"dates": [], "prices": []}
    rows = load_csv(p)
    rows = sorted(rows, key=lambda x: x[0])
    recent = rows[-limit:]
    return {"dates": [d for d, _ in recent], "prices": [p for _, p in recent]}


def sources_info():
    metrics = read_json("metrics.json", {}) or {}
    rmetrics = read_json("metrics_robusta.json", {}) or {}
    gmetrics = read_json("metrics_gold.json", {}) or {}
    meta = read_json("meta.json", {}) or {}
    vn_path = os.path.join(DATA_DIR, "vn_domestic.csv")
    vn_rows = load_csv(vn_path) if os.path.exists(vn_path) else []
    return {
        "arabica": {
            "name": "Arabica ICE futures (KC=F)",
            "source": "Yahoo Finance",
            "freq": "ngày",
            "points": metrics.get("series", {}).get("points"),
            "range": [metrics.get("series", {}).get("first"), metrics.get("series", {}).get("last")],
            "accuracy": metrics.get("h1", {}).get("chosen_metrics"),
            "horizons": {k: v.get("chosen_metrics") for k, v in (metrics.get("horizons") or {}).items()},
        },
        "robusta": {
            "name": "Robusta (ICO / World Bank Pink Sheet)",
            "source": "World Bank",
            "freq": "tháng",
            "points": rmetrics.get("series", {}).get("points"),
            "range": [rmetrics.get("series", {}).get("first"), rmetrics.get("series", {}).get("last")],
            "accuracy": (rmetrics.get("horizons") or {}).get("1"),
            "horizons": rmetrics.get("horizons"),
            "conversion": rmetrics.get("conversion"),
        },
        "vn": {
            "name": "Giá nội địa VN + theo tỉnh",
            "source": "Nông Dân Việt (bảng giá theo ngày) + giacaphe.com/Wayback khi backfill",
            "freq": "ngày",
            "points": len(vn_rows),
            "range": [vn_rows[0][0], vn_rows[-1][0]] if vn_rows else None,
            "note": "Khâu quy đổi (Robusta × tỷ giá × hệ số) là nguồn sai số lớn nhất: hệ số VN/Robusta đã trôi từ ≈0,80 (2011) lên ≈0,98 (2026), nên giá VN có thể lệch đáng kể dù dự báo Robusta đúng.",
        },
        "gold_world": {
            "name": "Vàng thế giới (COMEX GC=F)",
            "source": "Yahoo Finance",
            "freq": "ngày",
            "points": gmetrics.get("series", {}).get("points"),
            "range": [gmetrics.get("series", {}).get("first"), gmetrics.get("series", {}).get("last")],
            "accuracy": (gmetrics.get("horizons") or {}).get("1", {}).get("chosen_metrics"),
            "horizons": {k: v.get("chosen_metrics") for k, v in (gmetrics.get("horizons") or {}).items()},
        },
        "gold_vn": {
            "name": "Vàng SJC trong nước",
            "source": "giavang.org",
            "freq": "ngày",
            "points": (gmetrics.get("conversion", {}).get("basis_info") or {}).get("n_obs"),
            "range": (gmetrics.get("conversion", {}).get("basis_info") or {}).get("span"),
            "note": "Giá trong nước = vàng thế giới × tỷ giá × hệ số. Hệ số (chênh lệch SJC) dao động ±3–4% trong 3 tháng gần đây → đây là nguồn sai số chính, chưa tính vào bảng độ chính xác của vàng thế giới.",
        },
        "updated_at": meta.get("updated_at"),
    }


def vn_reference():
    path = os.path.join(DATA_DIR, "vn_domestic.csv")
    if not os.path.exists(path):
        return None
    rows = load_csv(path)
    metrics = read_json("metrics.json", {})
    if not rows or not metrics:
        return None
    last_date, vn_price = rows[-1]
    giacaphe_price = metrics.get("series", {}).get("last_price")
    fc = metrics.get("forecast", [])
    if not giacaphe_price:
        return None
    prev = None
    if len(rows) >= 2:
        from datetime import date as _date
        d0, p0 = rows[-2]
        try:
            if (_date.fromisoformat(last_date) - _date.fromisoformat(d0)).days <= 5:
                prev = {"date": d0, "price": p0}
        except Exception:
            pass
    out = []
    for row in fc:
        ratio = row["price"] / giacaphe_price
        out.append({"h": row["h"], "vn_price": round(vn_price * ratio)})
    return {
        "date": last_date,
        "vn_price": vn_price,
        "prev": prev,
        "global_at_date": metrics["series"]["last_price"],
        "forecast": out,
    }


@app.route(BASE_PATH + "/")
def index():
    return render_template("index.html", base=BASE_PATH)


@app.route(BASE_PATH + "/api/state")
def api_state():
    metrics = read_json("metrics.json")
    meta = read_json("meta.json", {})
    if not metrics:
        return jsonify({"error": "Chua co du lieu. Bam Cap nhat du lieu."}), 503
    rows = load_csv(os.path.join(DATA_DIR, "coffee.csv"))
    hist = rows[-365:]
    return jsonify({
        "metrics": metrics,
        "robusta": read_json("metrics_robusta.json", {}),
        "gold": read_json("metrics_gold.json", {}),
        "gold_hist": gold_history(),
        "sources": sources_info(),
        "meta": meta,
        "history": {"dates": [d for d, _ in hist], "prices": [p for _, p in hist]},
        "vn": vn_reference(),
        "vn_hist": robusta_history_vn(),
        "regions": build_regions(),
        "local_forecast": daily_local.get_forecast("nongdanviet"),
        "dak_lak_source_comparison": daily_local.load_frozen_dak_lak_comparison(),
        "giacaphe_local_data": read_json("giacaphe_dak_lak_daily_meta.json", {}),
        "vnc_dak_lak_quality": read_json("vnc_official_dak_lak_quality.json", {}),
        "vnc_dak_lak_exploratory_backtest": read_json("vnc_dak_lak_exploratory_backtest.json", {}),
        "national_daily_backtest": read_json("daily_robusta_backtest.json"),
        "realtime": {
            "last_refresh_vn": meta.get("last_fast_refresh_vn") or meta.get("updated_at"),
            "last_refresh_utc": meta.get("last_fast_refresh_utc") or meta.get("updated_at"),
            "status": meta.get("fast_refresh_status", "active"),
            "interval_minutes": 15
        },
        "dak_lak_hist": region_history("dak-lak", limit=60),
        "daklak_leadlag": read_json("metrics_daklak_leadlag.json", {}),
        "dak_lak_forecast_source_id": os.environ.get("DAK_LAK_FORECAST_SOURCE", "nongdanviet"),
        "busy": _state["busy"],
        "last_error": _state["last_error"],
    })


def _refresh_job():
    try:
        import fast_refresh
        fast_refresh.run_fast_refresh(force_model=True)
        _state["last_error"] = None
    except Exception as e:
        app.logger.exception("Fast refresh job error")
        _state["last_error"] = repr(e)[:300]
    finally:
        _state["busy"] = False
        _lock.release()


@app.route(BASE_PATH + "/api/dak-lak/forecast")
def api_dak_lak_forecast():
    """Tra ve tin hieu dan truyen gia quoc te London Robusta -> Dak Lak."""
    ll_data = read_json("metrics_daklak_leadlag.json")
    if not ll_data:
        try:
            ll_data = model_daklak_leadlag.run_backtest_and_forecast()
        except Exception as e:
            app.logger.exception("Failed to compute lead-lag forecast")
            return jsonify({"error": f"Chưa tính toán được mô hình dẫn truyền: {e}"}), 503

    live = ll_data.get("live_signal", {})
    metrics = ll_data.get("backtest_metrics", {})
    val_2025 = metrics.get("validation_2025", {})
    test_2026 = metrics.get("test_2026", {})

    return jsonify({
        "status": "evaluated_statistically_significant",
        "region": "Đắk Lắk",
        "target": "Robusta nhân xô tham chiếu, VNĐ/kg",
        "forecast_origin_date": live.get("forecast_origin_date"),
        "current_local_price_vnd_kg": live.get("current_local_price_vnd_kg"),
        "directional_signal": live.get("directional_signal"),
        "predicted_local_price_vnd_kg": live.get("predicted_local_price_vnd_kg"),
        "predicted_change_vnd_kg": live.get("predicted_change_vnd_kg"),
        "model_name": ll_data.get("model_name"),
        "lead_indicator": {
            "market": "ICE London Robusta Futures (settled overnight)",
            "latest_close_usd_ton": live.get("london_latest_close_usd_ton"),
            "overnight_change_usd_ton": live.get("london_overnight_change_usd"),
            "overnight_change_pct": live.get("london_overnight_change_pct"),
            "fx_usd_vnd": live.get("fx_usd_vnd"),
        },
        "rationale": live.get("rationale"),
        "statistical_validation": {
            "validation_2025": {
                "skill_vs_persistence_pct": val_2025.get("skill_pct"),
                "direction_accuracy_when_called_pct": val_2025.get("direction_accuracy_when_called_pct"),
                "model_mae_vnd_kg": val_2025.get("model_mae_vnd_kg"),
                "persistence_mae_vnd_kg": val_2025.get("persistence_mae_vnd_kg"),
                "diebold_mariano_p_value": val_2025.get("diebold_mariano_p_value"),
            },
            "test_2026": {
                "skill_vs_persistence_pct": test_2026.get("skill_pct"),
                "direction_accuracy_when_called_pct": test_2026.get("direction_accuracy_when_called_pct"),
                "model_mae_vnd_kg": test_2026.get("model_mae_vnd_kg"),
                "persistence_mae_vnd_kg": test_2026.get("persistence_mae_vnd_kg"),
                "diebold_mariano_p_value": test_2026.get("diebold_mariano_p_value"),
            }
        },
        "caution": "Giá thực tế giao dịch tại từng huyện/đại lý có thể chênh lệch do chất lượng hạt, chi phí vận chuyển và độ trừ lùi riêng.",
    }), 200


@app.route(BASE_PATH + "/api/refresh", methods=["POST"])
def api_refresh():
    if not _lock.acquire(blocking=False):
        return jsonify({"ok": False, "message": "Dang cap nhat, doi chut..."})
    _state["busy"] = True
    threading.Thread(target=_refresh_job, daemon=True).start()
    return jsonify({"ok": True, "message": "Da bat dau cap nhat (tai lai sau ~1-2 phut)."})


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8002)
    p.add_argument("--host", default="0.0.0.0")
    a = p.parse_args()
    app.run(host=a.host, port=a.port, debug=False, threaded=True)
