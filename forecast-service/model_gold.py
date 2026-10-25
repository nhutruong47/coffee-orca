"""Mo hinh gia VANG: the gioi (GC=F, USD/oz, theo ngay) + quy doi ra d/luong (SJC).

Tai dung feature/backtest cua model.py (da sua loi look-ahead) cho chuoi vang.
"""
import json
import os
import pickle
import sys
from datetime import datetime

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from fetch_data import load_csv, DATA_DIR
import model as M
import stats_tests as st

WORLD_PATH = os.path.join(DATA_DIR, "gold.csv")
VN_PATH = os.path.join(DATA_DIR, "gold_vn.csv")
MODEL_PATH = os.path.join(DATA_DIR, "model_gold.pkl")
METRICS_PATH = os.path.join(DATA_DIR, "metrics_gold.json")

HORIZONS = list(range(1, 31))
EVAL_HORIZONS = (1, 3, 7, 14, 30)
OZ_PER_LUONG = 37.5 / 31.1034768          # 1 luong vang = 37,5 g = 1,20565 oz
DEFAULT_BASIS = 1.10                      # d/luong = USD/oz x oz/luong x FX x basis


def align_gold():
    """Gop vang the gioi + ty gia theo ngay (forward-fill ty gia)."""
    gold = load_csv(WORLD_PATH)
    usdvnd = load_csv(os.path.join(DATA_DIR, "usdvnd.csv"))
    fx = dict(usdvnd)
    dates, prices, rates = [], [], []
    last_fx = None
    for d, p in gold:
        if d in fx:
            last_fx = fx[d]
        if last_fx is None:
            prior = [v for dd, v in usdvnd if dd <= d]
            last_fx = prior[-1] if prior else None
        if last_fx is None:
            continue
        dates.append(d)
        prices.append(p)
        rates.append(last_fx)
    return dates, np.array(prices, float), np.array(rates, float)


def fx_lookup():
    rows = sorted(load_csv(os.path.join(DATA_DIR, "usdvnd.csv")))
    dates = [d for d, _ in rows]
    import bisect

    def at(date):
        i = bisect.bisect_right(dates, date) - 1
        return rows[max(0, i)][1]

    return rows[-1][1], at


def vn_basis(recent=120):
    """He so quy doi d/luong = USD/oz x oz/luong x FX x basis.

    Do bang cach so gia SJC thuc te voi gia the gioi quy doi. Tra ve (basis, info).
    """
    if not os.path.exists(VN_PATH):
        return DEFAULT_BASIS, None
    vn = sorted(load_csv(VN_PATH))
    world = dict(load_csv(WORLD_PATH))
    world_dates = sorted(world)
    import bisect
    fx_last, fx_at = fx_lookup()

    def world_at(date):
        i = bisect.bisect_right(world_dates, date) - 1
        return world[world_dates[max(0, i)]]

    pairs = []
    for d, v in vn:
        w = world_at(d)
        if w and w > 0:
            pairs.append((d, v / (w * OZ_PER_LUONG * fx_at(d))))
    if not pairs:
        return DEFAULT_BASIS, None
    window = pairs[-recent:]
    vals = np.array([r for _, r in window])
    basis = float(np.median(vals))
    info = {
        "n_obs": len(pairs), "n_used": len(window),
        "span": [pairs[0][0], pairs[-1][0]],
        "window": [window[0][0], window[-1][0]],
        "median": round(float(np.median(vals)), 4),
        "mean": round(float(vals.mean()), 4),
        "std": round(float(vals.std()), 4),
        "min": round(float(vals.min()), 4),
        "max": round(float(vals.max()), 4),
        "first_ratio": round(float(pairs[0][1]), 4),
        "last_ratio": round(float(pairs[-1][1]), 4),
        "fx": round(float(fx_last), 2),
    }
    return basis, info


def evaluate(verbose=True):
    dates, prices, rates = align_gold()
    X, names, valid = M.build_features(dates, prices, rates)
    y = M.make_targets(prices, HORIZONS)

    report = {}
    for h in EVAL_HORIZONS:
        raw_ret, pred, actual, naive, ma7 = M.walk_forward(
            X, names, valid, y[h], prices, h, test_size=500, step=20)
        if len(actual) < 20:
            continue
        alpha = M.tune_alpha(naive, raw_ret, actual)
        blended = naive * np.exp(alpha * raw_ret)
        cut = max(20, int(len(actual) * 0.5))
        m_model = float(np.mean(np.abs((pred[:cut] - actual[:cut]) / actual[:cut])))
        m_naive = float(np.mean(np.abs((naive[:cut] - actual[:cut]) / actual[:cut])))
        m_blend = float(np.mean(np.abs((blended[:cut] - actual[:cut]) / actual[:cut])))
        best_of = min([("model", m_model), ("naive", m_naive), ("blend", m_blend)],
                      key=lambda t: t[1])[0]
        cm = M.metrics(actual, {"model": pred, "naive": naive, "blend": blended}[best_of], naive)
        cm["chosen"] = best_of
        cm["alpha"] = round(alpha, 2)
        # ---- KIEM DINH Y NGHIA THONG KE (chi tren phan con lai cua chuoi test) ----
        cut2 = max(20, len(actual) // 2)
        sl = slice(cut2, len(actual))
        series = {"model": pred, "naive": naive, "blend": blended}
        tst = {k: st.evaluate_forecast(v[sl], actual[sl], naive[sl], h=h, n_boot=500)
               for k, v in series.items()}
        ct = tst.get(best_of) or tst["blend"]
        cm["dm_p"] = ct["dm"].get("p")
        cm["cw_p"] = ct["cw"].get("p")
        cm["pt_p"] = ct["pt"].get("p")
        cm["dm_better"] = ct["dm"].get("model_better")
        cm["skill_ci"] = ct["skill"].get("skill_ci")
        cm["coverage"] = ct["conformal"].get("coverage")
        cm["band_pct"] = ct["conformal"].get("q_pct")            # nua do rong -> lo/hi
        cm["band_width_pct"] = ct["conformal"].get("width_pct")  # do rong day du
        cm["significant"] = ct.get("significant")
        cm["n_test"] = ct["dm"].get("T")
        report[h] = {"alpha": alpha, "chosen": best_of,
                     "model": M.metrics(actual, pred, naive),
                     "naive": M.metrics(actual, naive, naive),
                     "blend": M.metrics(actual, blended, naive),
                     "chosen_metrics": cm,
                     "tests": tst}
        if verbose:
            print(f"  h={h:>2} ngay  chosen={best_of:<5} alpha={alpha:.2f}  "
                  f"MAPE={cm['mape']:.2f}%  naive={cm['naive_mape']:.2f}%  "
                  f"skill={cm['skill']:+.1f}%  R2ret={cm.get('r2_ret')}  "
                  f"huong={cm['dir_acc']:.1f}%  n={cm['n']}")
            print(f"        kiem dinh: DM p={cm['dm_p']}  CW p={cm['cw_p']}  "
                  f"PT p={cm['pt_p']}  skill CI={cm['skill_ci']}  "
                  f"do phu 90% = {cm['coverage']}% (rong {cm['band_pct']}%)")
    return dates, prices, rates, X, names, valid, y, report


def run(verbose=True):
    dates, prices, rates, X, names, valid, y, report = evaluate(verbose=verbose)
    models = M.train_final(X, names, valid, y, HORIZONS)
    last = len(prices) - 1
    x_last = X[last:last + 1]
    fx_last, fx_at = fx_lookup()
    basis, binfo = vn_basis()

    vn_now = vn_now_date = None
    if os.path.exists(VN_PATH):
        rows = sorted(load_csv(VN_PATH))
        if rows:
            vn_now_date, vn_now = rows[-1]

    fc = []
    # Neo vao gia SJC THUC TE hom nay: mo hinh chi du bao % thay doi cua vang the gioi,
    # con muc chenh lech trong nuoc duoc giu nguyen nhu hien tai (khong du bao no).
    anchor = float(vn_now) if vn_now else float(prices[last]) * OZ_PER_LUONG * fx_last * basis
    for h in HORIZONS:
        r = float(models[h].predict(x_last)[0])
        info = report.get(h)
        if info is None:                       # noi suy alpha/chosen tu moc gan nhat
            info = report[min(report, key=lambda k: abs(k - h))] if report else {}
        alpha = info.get("alpha", 0.0)
        r_eff = 0.0 if info.get("chosen") == "naive" else alpha * r
        usd = float(prices[last] * np.exp(r_eff))
        cm_i = info.get("chosen_metrics", {}) or {}
        # do rong khoang lay tu khoang CONFORMAL (do phu do duoc), fallback MAPE
        band = cm_i.get("band_pct") or cm_i.get("mape") or 2.0
        vnd = anchor * (usd / float(prices[last]))
        fc.append({"h": h, "alpha": round(alpha, 2), "chosen": info.get("chosen"),
                   "usd_oz": round(usd, 2), "vn_luong": int(round(vnd)),
                   "lo": int(round(vnd * (1 - band / 100))),
                   "hi": int(round(vnd * (1 + band / 100))),
                   "band": round(float(band), 2)})

    out = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "series": {"name": "Vàng thế giới (COMEX GC=F, USD/oz)", "points": len(prices),
                   "first": dates[0], "last": dates[-1],
                   "last_price_usd_oz": round(float(prices[-1]), 2)},
        "horizons": {str(k): v for k, v in report.items()},
        "forecast": fc,
        "conversion": {
            "basis": round(basis, 4), "fx": round(float(fx_last), 2),
            "oz_per_luong": round(OZ_PER_LUONG, 5),
            "vn_now": int(vn_now) if vn_now else None, "vn_now_date": vn_now_date,
            "vn_now_usd_oz": round(float(prices[-1]), 2),
            "basis_info": binfo,
        },
        "feature_names": names,
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"models": models, "names": names, "horizons": HORIZONS,
                     "last_x": x_last, "last_usd_oz": float(prices[-1]),
                     "last_date": dates[-1], "fx": float(fx_last), "basis": basis}, f)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    if verbose:
        print(f"  vang the gioi moi nhat {out['series']['last_price_usd_oz']} USD/oz ({dates[-1]})")
        print(f"  he so trong nuoc = {basis:.4f} (tu {binfo['n_used'] if binfo else 0} ngay, "
              f"std {binfo['std'] if binfo else '-'})")
        if vn_now:
            print(f"  SJC thuc te {vn_now:,.0f} d/luong ({vn_now_date})")
        print(f"  du bao +30 ngay: {fc[-1]['vn_luong']:,} d/luong "
              f"({fc[-1]['usd_oz']:,} USD/oz)")
    return out


if __name__ == "__main__":
    print("=== Huan luyen mo hinh gia VANG (ngay) ===")
    run()
