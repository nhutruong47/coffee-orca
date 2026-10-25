"""Feature engineering + huan luyen + backtest walk-forward cho gia ca phe."""
import os
import json
import pickle
from datetime import datetime

import numpy as np

from fetch_data import load_csv, DATA_DIR
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
import stats_tests as st

MODEL_PATH = os.path.join(DATA_DIR, "models.pkl")
METRICS_PATH = os.path.join(DATA_DIR, "metrics.json")

HORIZONS = list(range(1, 31))
EVAL_HORIZONS = (1, 7, 14, 30)
N_LAGS = 10


def align_series():
    """Gop coffee + usdvnd theo ngay, forward-fill ty gia."""
    coffee = load_csv(os.path.join(DATA_DIR, "coffee.csv"))
    usdvnd = load_csv(os.path.join(DATA_DIR, "usdvnd.csv"))
    fx = {d: v for d, v in usdvnd}
    dates, prices, rates = [], [], []
    last_fx = None
    for d, p in coffee:
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


def rolling_mean(a, w):
    out = np.full(len(a), np.nan)
    c = np.cumsum(np.insert(a, 0, 0.0))
    out[w - 1:] = (c[w:] - c[:-w]) / w
    return out


def rsi(series, period=14):
    delta = np.diff(series, prepend=series[0])
    up = np.where(delta > 0, delta, 0.0)
    dn = np.where(delta < 0, -delta, 0.0)
    out = np.full(len(series), 50.0)
    if len(series) <= period:
        return out
    avg_up = up[1:period + 1].mean()
    avg_dn = dn[1:period + 1].mean()
    for i in range(period + 1, len(series)):
        avg_up = (avg_up * (period - 1) + up[i]) / period
        avg_dn = (avg_dn * (period - 1) + dn[i]) / period
        rs = avg_up / (avg_dn + 1e-9)
        out[i] = 100 - 100 / (1 + rs)
    return out


def build_features(dates, prices, rates):
    n = len(prices)
    ret = np.zeros(n)
    ret[1:] = np.diff(prices) / prices[:-1]
    fx_ret = np.zeros(n)
    fx_ret[1:] = np.diff(rates) / rates[:-1]

    feats = {}
    for lag in range(1, N_LAGS + 1):
        v = np.full(n, np.nan)
        v[lag:] = ret[:-lag]
        feats[f"ret_lag{lag}"] = v

    for w in (5, 10, 20, 60, 120, 250):
        feats[f"px_over_ma{w}"] = prices / rolling_mean(prices, w) - 1

    for w in (7, 30, 90):
        v = np.full(n, np.nan)
        for i in range(w, n):
            v[i] = ret[i - w:i].std()
        feats[f"vol{w}"] = v

    for w in (5, 20, 60, 120):
        v = np.full(n, np.nan)
        v[w:] = prices[w:] / prices[:-w] - 1
        feats[f"mom{w}"] = v

    feats["rsi14"] = rsi(prices, 14) / 100.0
    feats["fx_ret_lag1"] = np.concatenate([[0], fx_ret[:-1]])
    feats["fx_over_ma30"] = rates / rolling_mean(rates, 30) - 1

    dts = [datetime.strptime(d, "%Y-%m-%d") for d in dates]
    dow = np.array([d.weekday() for d in dts], float)
    month = np.array([d.month for d in dts], float)
    feats["dow_sin"] = np.sin(2 * np.pi * dow / 5)
    feats["dow_cos"] = np.cos(2 * np.pi * dow / 5)
    feats["month_sin"] = np.sin(2 * np.pi * month / 12)
    feats["month_cos"] = np.cos(2 * np.pi * month / 12)
    feats["trend"] = np.arange(n, dtype=float)

    X = np.column_stack([feats[k] for k in feats])
    names = list(feats.keys())
    valid = ~np.isnan(X).any(axis=1) & ~np.isnan(prices) & (prices > 0)
    return X, names, valid


def make_targets(prices, horizons):
    n = len(prices)
    y = {}
    for h in horizons:
        v = np.full(n, np.nan)
        v[: n - h] = np.log(prices[h:] / prices[: n - h])
        y[h] = v
    return y


def _split(X, valid, y_h):
    mask = valid & ~np.isnan(y_h)
    return X[mask], y_h[mask]


def _new_model(seed=42):
    return HistGradientBoostingRegressor(
        max_iter=300, learning_rate=0.05, max_depth=4,
        l2_regularization=1.0, min_samples_leaf=20, random_state=seed,
    )


def metrics(actual, pred, base=None):
    err = pred - actual
    mape = float(np.mean(np.abs(err / actual)) * 100)
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((actual - actual.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    level_acc = 100 - mape
    dir_acc = 0.0
    r2_ret = None
    if base is not None and len(base) > 2:
        # huong du doan (so voi gia hom nay) vs huong thuc te
        d_pred = np.sign(pred - base)
        d_act = np.sign(actual - base)
        nz = d_act != 0
        dir_acc = float(np.mean(d_pred[nz] == d_act[nz]) * 100)
        # R2 tren % THAY DOI (trung thuc hon R2 tren muc gia)
        act_ret = actual / base - 1
        pred_ret = pred / base - 1
        sst = float(np.sum((act_ret - act_ret.mean()) ** 2))
        if sst:
            r2_ret = 1 - float(np.sum((pred_ret - act_ret) ** 2)) / sst
    out = {"mape": round(mape, 3), "level_acc": round(level_acc, 2), "mae": round(mae, 4),
           "rmse": round(rmse, 4), "r2": round(r2, 4), "dir_acc": round(dir_acc, 2),
           "n": int(len(actual))}
    if r2_ret is not None:
        out["r2_ret"] = round(r2_ret, 4)
    if base is not None and len(base) > 2:
        nv = float(np.mean(np.abs((base - actual) / actual)) * 100)
        out["naive_mape"] = round(nv, 3)
        out["skill"] = round((1 - mape / nv) * 100, 1) if nv else 0.0
    return out


def walk_forward(X, names, valid, y_h, prices, h, test_size=400, step=20):
    n = len(prices)
    start = max(0, n - test_size)
    raw_ret, actual, naive, ma7 = [], [], [], []
    m = None
    for i in range(start, n - h):
        if not valid[i]:
            continue
        if m is None or (i - start) % step == 0:
            Xtr, ytr = _split(X[:i], valid[:i], y_h[:i])
            if len(Xtr) < 200:
                continue
            m = _new_model()
            m.fit(Xtr, ytr)
        r = float(m.predict(X[i:i + 1])[0])
        raw_ret.append(r)
        actual.append(prices[i + h])
        naive.append(prices[i])
        ma7.append(prices[max(0, i - 6):i + 1].mean())
    raw_ret = np.array(raw_ret)
    naive = np.array(naive)
    # LUU Y: base phai la chinh gia tai thoi diem du bao (naive), khong duoc
    # suy ra tu vi tri trong mang, vi vong lap co the bo qua vai diem (valid=False).
    pred = naive * np.exp(raw_ret)
    return raw_ret, pred, np.array(actual), naive, np.array(ma7)


def tune_alpha(base, raw_ret, actual, frac=0.5):
    """Chon he so shrink alpha cho return du doan (0=naive, 1=model)."""
    cut = max(20, int(len(actual) * frac))
    best, best_m = 0.0, 1e9
    for a in np.arange(0.0, 1.01, 0.05):
        p = base[:cut] * np.exp(a * raw_ret[:cut])
        m = float(np.mean(np.abs((p - actual[:cut]) / actual[:cut])))
        if m < best_m:
            best, best_m = float(a), m
    return best


def evaluate(horizons=EVAL_HORIZONS, verbose=True):
    dates, prices, rates = align_series()
    X, names, valid = build_features(dates, prices, rates)
    y = make_targets(prices, HORIZONS + [h for h in horizons if h not in HORIZONS])

    report = {}
    for h in horizons:
        raw_ret, pred, actual, naive, ma7 = walk_forward(
            X, names, valid, y[h], prices, h)
        if len(actual) < 20:
            continue
        alpha = tune_alpha(naive, raw_ret, actual)
        blended = naive * np.exp(alpha * raw_ret)
        # chon nguon tot hon theo MAPE tren nua dau
        cut = max(20, int(len(actual) * 0.5))
        m_model = float(np.mean(np.abs((pred[:cut] - actual[:cut]) / actual[:cut])))
        m_naive = float(np.mean(np.abs((naive[:cut] - actual[:cut]) / actual[:cut])))
        m_blend = float(np.mean(np.abs((blended[:cut] - actual[:cut]) / actual[:cut])))
        best_of = min([("model", m_model), ("naive", m_naive), ("blend", m_blend)], key=lambda t: t[1])[0]
        cm = metrics(actual, {"model": pred, "naive": naive, "blend": blended}[best_of], naive)
        cm["chosen"] = best_of
        cm["alpha"] = round(alpha, 2)
        report[h] = {
            "alpha": alpha,
            "chosen": best_of,
            "model": metrics(actual, pred, naive),
            "naive": metrics(actual, naive, naive),
            "blend": metrics(actual, blended, naive),
            "chosen_metrics": cm,
            "ma7": metrics(actual, ma7, naive),
        }
        # ---- KIEM DINH Y NGHIA THONG KE ----
        # Chi dung phan con lai cua chuoi test ("sach"): nua dau da dung de chon alpha.
        cut2 = max(20, len(actual) // 2)
        sl = slice(cut2, len(actual))
        series = {"model": pred, "naive": naive, "blend": blended}
        tst = {k: st.evaluate_forecast(v[sl], actual[sl], naive[sl], h=h, n_boot=500)
               for k, v in series.items()}
        report[h]["tests"] = tst
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
        if verbose:
            print(f"        kiem dinh: DM p={cm['dm_p']}  CW p={cm['cw_p']}  "
                  f"PT p={cm['pt_p']}  skill CI={cm['skill_ci']}  "
                  f"do phu 90% = {cm['coverage']}% (rong {cm['band_pct']}%)")
        if verbose:
            cm = report[h]["chosen_metrics"]
            print(f"h={h:>2}d  chosen={best_of:<5} alpha={alpha:.2f}  "
                  f"MAPE={cm['mape']:.2f}%  level_acc={cm['level_acc']:.2f}%  "
                  f"dir={cm['dir_acc']:.1f}%  R2={cm['r2']:.3f}  n={cm['n']}")
            print(f"        model MAPE={report[h]['model']['mape']:.2f}% | "
                  f"naive MAPE={report[h]['naive']['mape']:.2f}% | "
                  f"blend MAPE={report[h]['blend']['mape']:.2f}%")
    return dates, prices, rates, X, names, valid, y, report


def train_final(X, names, valid, y, horizons):
    models = {}
    for h in horizons:
        Xh, yh = _split(X, valid, y[h])
        m = _new_model()
        m.fit(Xh, yh)
        models[h] = m
    return models


def run(verbose=True):
    dates, prices, rates, X, names, valid, y, report = evaluate(verbose=verbose)
    models = train_final(X, names, valid, y, HORIZONS)
    last = len(prices) - 1
    x_last = X[last:last + 1]
    fc = []
    for h in HORIZONS:
        r = float(models[h].predict(x_last)[0])
        info = report.get(h, {})
        alpha = info.get("alpha", 0.0)
        # Neu backtest cho thay baseline ngay tho tot hon thi tra ve dung gia hien tai
        # (khong tu tin vao mo hinh khi no khong chung minh duoc la tot hon).
        if info.get("chosen") == "naive":
            r_eff = 0.0
        else:
            r_eff = alpha * r
        fc.append({"h": h, "return": round(r_eff, 5), "alpha": round(alpha, 2),
                   "chosen": info.get("chosen"),
                   "price": round(float(prices[last] * np.exp(r_eff)), 3)})

    out = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "series": {"points": len(prices), "first": dates[0], "last": dates[-1],
                   "last_price": round(float(prices[-1]), 3)},
        "h1": report.get(1, {}),
        "horizons": {str(k): v for k, v in report.items()},
        "forecast": fc,
        "feature_names": names,
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"models": models, "feature_names": names, "horizons": HORIZONS,
                     "last_price": float(prices[-1]), "last_date": dates[-1],
                     "last_x": x_last, "alpha": {str(k): v["alpha"] for k, v in report.items()}}, f)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    return out


if __name__ == "__main__":
    run()
