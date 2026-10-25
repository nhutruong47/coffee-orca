"""Du bao gia Robusta (loai ca phe Viet Nam thuc su ban) va quy doi ra d/kg.

Nguon: World Bank Pink Sheet / ICO indicator price (thang, 1960 -> nay) + gia
Arabica ngay (KC=F) lam tin hieu dan dat + ty gia USD/VND.
"""
import os
import json
import pickle
import sys
from collections import defaultdict
from datetime import datetime

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from fetch_data import load_csv, DATA_DIR
import robusta as rb
import stats_tests as st
from sklearn.ensemble import HistGradientBoostingRegressor

MODEL_PATH = os.path.join(DATA_DIR, "model_robusta.pkl")
METRICS_PATH = os.path.join(DATA_DIR, "metrics_robusta.json")

HORIZONS = list(range(1, 13))
EVAL_HORIZONS = (1, 3, 6, 12)
DEFAULT_BASIS = 0.98          # VN d/kg = Robusta(USD/kg) x FX x basis
BASIS_MIN, BASIS_MAX = 0.80, 1.20


# ----------------------------------------------------------------- du lieu
def load_monthly():
    """Gop Robusta/Arabica thang (World Bank) + Arabica ngay + ty gia thang."""
    wb = rb.monthly_prices()
    rob = dict(wb["Coffee, Robusta"])
    ara_wb = dict(wb["Coffee, Arabica"])

    # Arabica ngay (KC=F, cents/lb) -> trung binh thang, USD/kg
    c_rows = load_csv(os.path.join(DATA_DIR, "coffee.csv"))
    bym = defaultdict(list)
    for d, p in c_rows:
        bym[d[:7]].append(p)
    ara_day = {m: float(np.mean(v)) * 2.20462 / 100 for m, v in bym.items()}

    fx_rows = load_csv(os.path.join(DATA_DIR, "usdvnd.csv"))
    fxm = defaultdict(list)
    for d, v in fx_rows:
        fxm[d[:7]].append(v)
    fx = {m: float(np.mean(v)) for m, v in fxm.items()}

    months = sorted(set(rob) & set(ara_wb))
    data = []
    for m in months:
        data.append({
            "month": m,
            "robusta": rob[m],
            "arabica_wb": ara_wb[m],
            "arabica_day": ara_day.get(m),      # co the None o thang hien tai/qua khu xa
            "fx": fx.get(m),
        })
    # dien arabica_day thieu bang gia tri gan nhat (thang truoc/sau)
    have = [d for d in data if d["arabica_day"]]
    for d in data:
        if not d["arabica_day"] and have:
            near = min(have, key=lambda x: abs(int(x["month"][:4]) * 12 + int(x["month"][5:])
                                               - int(d["month"][:4]) * 12 - int(d["month"][5:])))
            d["arabica_day"] = near["arabica_day"]
    return data, months


def vn_basis(recent_months=36, min_obs=3):
    """He so quy doi VN d/kg = Robusta(USD/kg) x FX x basis.

    Chi dung cac quan sat trong `recent_months` gan nhat (he so nay thay doi
    theo thoi gian: 2011 ~0,78 con 2026 ~0,98). Neu khong du mau thi lay
    dung quan sat moi nhat.
    """
    path = os.path.join(DATA_DIR, "vn_domestic.csv")
    if not os.path.exists(path):
        return DEFAULT_BASIS, None
    vn = sorted(load_csv(path))
    fx_rows = sorted(load_csv(os.path.join(DATA_DIR, "usdvnd.csv")))
    if not vn or not fx_rows:
        return DEFAULT_BASIS, None
    fx_dates = [d for d, _ in fx_rows]
    fx_last = fx_rows[-1][1]

    rob = dict(rb.monthly_prices()["Coffee, Robusta"])
    rob_months = sorted(rob)

    def fx_at(date):
        import bisect
        i = bisect.bisect_right(fx_dates, date) - 1
        if i < 0:
            return fx_rows[0][1]
        return fx_rows[i][1]

    pairs = []
    for date, price in vn:
        m = date[:7]
        cand = [x for x in rob_months if x <= m] or rob_months
        ref = rob[cand[-1]]
        fx = fx_at(date)
        if ref > 0 and fx > 0:
            pairs.append((date, price / (ref * fx)))

    if not pairs:
        return DEFAULT_BASIS, None

    last_date = pairs[-1][0]
    y, mo = int(last_date[:4]), int(last_date[5:7])
    mo -= recent_months
    while mo <= 0:
        mo += 12
        y -= 1
    cutoff = f"{y:04d}-{mo:02d}-01"
    window = [p for p in pairs if p[0] >= cutoff]

    if len(window) >= min_obs:
        ratio_now = float(np.median([r for _, r in window]))
        used = window
    else:
        ratio_now = pairs[-1][1]
        used = [pairs[-1]]

    k = min(max(ratio_now, BASIS_MIN), BASIS_MAX)
    return k, {"n_obs": len(pairs), "n_used": len(used), "fx": fx_last,
               "vn_days": len(vn), "median_ratio": float(np.median([r for _, r in pairs])),
               "recent_ratio": float(ratio_now),
               "span": [pairs[0][0], pairs[-1][0]],
               "window": [used[0][0], used[-1][0]]}


# ------------------------------------------------------------- dac trung
def rolling_mean(a, w):
    out = np.full(len(a), np.nan)
    c = np.cumsum(np.insert(a, 0, 0.0))
    out[w - 1:] = (c[w:] - c[:-w]) / w
    return out


def build(data):
    rob = np.array([d["robusta"] for d in data], float)
    ara = np.array([d["arabica_wb"] for d in data], float)
    n = len(rob)
    ret = np.zeros(n); ret[1:] = np.diff(rob) / rob[:-1]
    ar = np.zeros(n); ar[1:] = np.diff(ara) / ara[:-1]

    f = {}
    for lag in range(1, 7):
        v = np.full(n, np.nan); v[lag:] = ret[:-lag]; f[f"ret_lag{lag}"] = v
    for lag in range(1, 4):
        v = np.full(n, np.nan); v[lag:] = ar[:-lag]; f[f"arabica_ret_lag{lag}"] = v
    for w in (3, 6, 12, 24):
        f[f"px_over_ma{w}"] = rob / rolling_mean(rob, w) - 1
    for w in (6, 12):
        f[f"arabica_over_ma{w}"] = ara / rolling_mean(ara, w) - 1
    ratio = ara / rob
    f["arabica_robusta_ratio"] = ratio
    f["ratio_vs_mean"] = ratio / rolling_mean(ratio, 24) - 1
    for w in (6, 12):
        v = np.full(n, np.nan)
        for i in range(w, n):
            v[i] = ret[i - w:i].std()
        f[f"vol{w}"] = v
    # tin hieu dan dat tu gia Arabica futures ngay (chi co tu 2016) - dien trung tinh 1.0 khi thieu
    lead = np.ones(n)
    for i, d in enumerate(data):
        if d.get("arabica_day") and d.get("arabica_wb"):
            lead[i] = d["arabica_day"] / d["arabica_wb"]
    f["arabica_day_over_wb"] = lead
    mon = np.array([int(d["month"][5:]) for d in data], float)
    f["month_sin"] = np.sin(2 * np.pi * mon / 12)
    f["month_cos"] = np.cos(2 * np.pi * mon / 12)
    f["trend"] = np.arange(n, dtype=float)

    X = np.column_stack([f[k] for k in f])
    names = list(f.keys())
    valid = ~np.isnan(X).any(axis=1) & (rob > 0)
    return X, names, valid, rob


def targets(rob, horizons):
    n = len(rob)
    y = {}
    for h in horizons:
        v = np.full(n, np.nan)
        v[: n - h] = np.log(rob[h:] / rob[: n - h])
        y[h] = v
    return y


def _model():
    return HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_depth=3,
                                         l2_regularization=1.0, min_samples_leaf=10, random_state=42)


def metrics(actual, pred, base):
    """So sanh mo hinh voi baseline ngay tho (gia khong doi) tren % thay doi."""
    err = pred - actual
    mape = float(np.mean(np.abs(err / actual)) * 100)
    naive = float(np.mean(np.abs((base - actual) / actual)) * 100)
    ss_res = float(np.sum(err ** 2)); ss_tot = float(np.sum((actual - actual.mean()) ** 2))
    r2_level = 1 - ss_res / ss_tot if ss_tot else 0.0
    act_ret = actual / base - 1
    pred_ret = pred / base - 1
    ss_res_r = float(np.sum((pred_ret - act_ret) ** 2))
    ss_tot_r = float(np.sum((act_ret - act_ret.mean()) ** 2))
    r2_ret = 1 - ss_res_r / ss_tot_r if ss_tot_r else 0.0
    r2_ret_naive = 1 - float(np.sum(act_ret ** 2)) / ss_tot_r if ss_tot_r else 0.0
    d = np.sign(pred - base) == np.sign(actual - base)
    return {"mape": round(mape, 2), "level_acc": round(100 - mape, 2),
            "mae": round(float(np.mean(np.abs(err))), 4),
            "naive_mape": round(naive, 2),
            "skill": round((1 - mape / naive) * 100, 1) if naive else 0.0,
            "r2": round(r2_level, 4), "r2_ret": round(r2_ret, 4),
            "r2_ret_naive": round(r2_ret_naive, 4),
            "dir_acc": round(float(np.mean(d) * 100), 1),
            "band": round(mape, 2), "n": int(len(actual))}


def predict_raw(X, valid, y_h, rob, h, lo, hi, step=6):
    """Du bao THO (chua shrink) tren doan [lo, hi). Tra ve (log-return, thuc te, goc)."""
    pred_r, act, base = [], [], []
    m = None
    for i in range(lo, hi):
        if i >= len(rob) - h or not valid[i]:
            continue
        if m is None or (i - lo) % step == 0:
            mask = valid[:i] & ~np.isnan(y_h[:i])
            if mask.sum() < 120:
                continue
            m = _model(); m.fit(X[:i][mask], y_h[:i][mask])
        pred_r.append(float(m.predict(X[i:i + 1])[0]))
        act.append(rob[i + h]); base.append(rob[i])
    return np.array(pred_r), np.array(act), np.array(base)


def choose_alpha(pred_r, act, base, grid=None):
    """Chon muc shrink ve baseline ngay tho tren MOT doan rieng (khong phai doan test).

    r_dung = alpha * r_mo_hinh;  alpha=0 -> dung han baseline, alpha=1 -> tin mo hinh.
    """
    if len(act) < 10:
        return 0.0
    grid = grid if grid is not None else np.arange(0.0, 1.01, 0.1)
    best, best_mape = 0.0, None
    for a in grid:
        p = base * np.exp(a * pred_r)
        mp = float(np.mean(np.abs((p - act) / act)) * 100)
        if best_mape is None or mp < best_mape:
            best, best_mape = float(a), mp
    return best


def walk_forward(X, valid, y_h, rob, h, lo, hi, alpha, step=6):
    pr, act, base = predict_raw(X, valid, y_h, rob, h, lo, hi, step=step)
    return base * np.exp(alpha * pr), act, base


def run(verbose=True):
    data, months = load_monthly()
    X, names, valid, rob = build(data)
    y = targets(rob, HORIZONS)
    k, binfo = vn_basis()
    n = len(rob)

    # Doan TEST = 180 thang cuoi; doan VALID (chon alpha) = 240 thang truoc do.
    test_lo, test_hi = max(0, n - 180), n
    val_lo, val_hi = max(0, n - 420), test_lo

    report, alphas = {}, {}
    for h in EVAL_HORIZONS:
        # 1) chon alpha tren doan validation (khong dung doan test)
        vpr, vact, vbase = predict_raw(X, valid, y[h], rob, h, val_lo, val_hi)
        a = choose_alpha(vpr, vact, vbase)
        alphas[h] = a

        # 2) danh gia tren doan test voi alpha da chon
        p, act, base = walk_forward(X, valid, y[h], rob, h, test_lo, test_hi, a)
        if len(act) < 20:
            continue
        m = metrics(act, p, base)
        pr_raw, _, _ = predict_raw(X, valid, y[h], rob, h, test_lo, test_hi)
        m["mape_raw"] = metrics(act, base * np.exp(pr_raw), base)["mape"]
        m["alpha"] = a
        # ---- KIEM DINH Y NGHIA THONG KE ----
        # Doan test 180 thang cuoi hoan toan "sach" (alpha da chon o doan validation rieng).
        tst = st.evaluate_forecast(p, act, base, h=h, n_boot=500)
        m["dm_p"] = tst["dm"].get("p")
        m["cw_p"] = tst["cw"].get("p")
        m["pt_p"] = tst["pt"].get("p")
        m["dm_better"] = tst["dm"].get("model_better")
        m["skill_ci"] = tst["skill"].get("skill_ci")
        m["coverage"] = tst["conformal"].get("coverage")
        m["band_pct"] = tst["conformal"].get("q_pct")            # nua do rong -> lo/hi
        m["band_width_pct"] = tst["conformal"].get("width_pct")  # do rong day du
        m["significant"] = tst.get("significant")
        m["n_test"] = tst["dm"].get("T")
        report[h] = m
        if verbose:
            print(f"  h={h:>2} thang  alpha={a:.1f}  MAPE={m['mape']:.2f}%  "
                  f"(tho {m['mape_raw']:.2f}%)  naive={m['naive_mape']:.2f}%  "
                  f"skill={m['skill']:+.1f}%  R2ret={m['r2_ret']:.3f}  "
                  f"huong={m['dir_acc']:.1f}%  n={m['n']}")
            print(f"        kiem dinh: DM p={m['dm_p']}  CW p={m['cw_p']}  "
                  f"PT p={m['pt_p']}  skill CI={m['skill_ci']}  "
                  f"do phu 90% = {m['coverage']}% (rong {m['band_pct']}%)")

    models = {}
    for h in HORIZONS:
        mask = valid & ~np.isnan(y[h])
        m = _model(); m.fit(X[mask], y[h][mask]); models[h] = m

    def alpha_for(h):
        if h in alphas:
            return alphas[h]
        if not alphas:
            return 0.0
        return alphas[min(alphas, key=lambda x: abs(x - h))]

    last = len(rob) - 1
    x_last = X[last:last + 1]
    fx_last = data[last]["fx"] or load_csv(os.path.join(DATA_DIR, "usdvnd.csv"))[-1][1]
    vn_now_usd = vn_now_price = None
    vn_path = os.path.join(DATA_DIR, "vn_domestic.csv")
    if os.path.exists(vn_path):
        vn_rows = load_csv(vn_path)
        if vn_rows:
            vn_now_price = vn_rows[-1][1]
            vn_now_usd = vn_now_price / fx_last
    fc = []
    for h in HORIZONS:
        r = float(models[h].predict(x_last)[0])
        a = alpha_for(h)
        r = a * r  # shrink ve baseline ngay tho
        usd = float(rob[last] * np.exp(r))
        r_h = report.get(h, {})
        # do rong khoang: uu tien khoang CONFORMAL (do phu do duoc), fallback MAPE
        band = (r_h.get("band_pct") or r_h.get("band")
                or report.get(1, {}).get("band_pct") or report.get(1, {}).get("band", 10.0))
        fc.append({
            "h": h,
            "alpha": round(a, 2),
            "usd_kg": round(usd, 3),
            "vn_kg": round(usd * fx_last * k),
            "vn_lo": round(usd * (1 - band / 100) * fx_last * k),
            "vn_hi": round(usd * (1 + band / 100) * fx_last * k),
        })

    # ---- du bao TUNG NGAY 1..30 (noi suy tu moc +1 thang) ----
    # Khong co chuoi Robusta/gia VN theo ngay de huan luyen, nen bang ngay la
    # noi suy hinh hoc giua gia hom nay va du bao +1 thang; do rong khoang lay
    # theo MAPE do duoc cua moc +1 thang, tang dan theo can bac hai cua thoi gian.
    anchor = vn_now_price if vn_now_price else round(float(rob[last]) * fx_last * k)
    m1 = fc[0]["vn_kg"] if fc else anchor
    band1 = float(report.get(1, {}).get("band_pct") or report.get(1, {}).get("band") or 4.0)
    daily = []
    for d in range(1, 31):
        t = d / 30.0
        val = anchor * (m1 / anchor) ** t
        band = band1 * (t ** 0.5)
        daily.append({"d": d, "vn_kg": int(round(val)),
                      "lo": int(round(val * (1 - band / 100))),
                      "hi": int(round(val * (1 + band / 100))),
                      "band": round(band, 2)})

    out = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "series": {"name": "Robusta (ICO/World Bank, tháng)", "points": len(rob),
                   "first": data[0]["month"], "last": data[last]["month"],
                   "last_price_usd_kg": round(float(rob[last]), 3)},
        "horizons": {str(k2): v for k2, v in report.items()},
        "forecast": fc,
        "daily": daily,
        "daily_now": int(anchor),
        "daily_note": ("Bảng ngày là nội suy giữa giá hôm nay và dự báo +1 tháng; "
                       "chưa có chuỗi giá VN/Robusta theo ngày để đo độ chính xác ở mức ngày. "
                       f"Độ rộng khoảng theo khoảng conformal của mốc +1 tháng ({band1:.2f}%)."),
        "conversion": {"basis": round(k, 4), "fx": round(float(fx_last), 2),
                       "n_basis_obs": (binfo or {}).get("n_obs", 0),
                       "n_basis_used": (binfo or {}).get("n_used", 0),
                       "basis_span": (binfo or {}).get("span"),
                       "vn_days": (binfo or {}).get("vn_days", 0),
                       "vn_now_usd_kg": round(vn_now_usd, 3) if vn_now_usd else None,
                       "vn_now_price": vn_now_price},
        "feature_names": names,
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"models": models, "names": names, "last_x": x_last,
                     "last_usd_kg": float(rob[last]), "last_month": data[last]["month"],
                     "fx": float(fx_last), "basis": k}, f)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    if verbose:
        print(f"  he so VN/Robusta = {k:.4f} (fx {fx_last:,.0f}, {out['conversion']['n_basis_obs']} mau)")
        print(f"  Robusta moi nhat {out['series']['last_price_usd_kg']} USD/kg ({out['series']['last']})")
        print(f"  du bao +12 thang: {fc[-1]['vn_kg']:,} d/kg  (khoang {fc[-1]['vn_lo']:,} - {fc[-1]['vn_hi']:,})")
    return out


if __name__ == "__main__":
    print("=== Huan luyen mo hinh Robusta (thang) ===")
    run()
