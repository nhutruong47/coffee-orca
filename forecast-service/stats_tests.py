"""Kiem dinh thong ke + khoang du bao chuan cho du bao gia ca phe.

Viet bang numpy thuan (khong can scipy) de chay duoc tren VPS va local.

Noi dung:
  1. Diebold-Mariano (Newey-West HAC) + hieu chinh mau nho Harvey-Leybourne-Newbold.
  2. Clark-West (MSPE-adjusted) - dung khi baseline "gia khong doi" long nhau trong mo hinh.
  3. Pesaran-Timmermann - kiem dinh do chinh xac HUONG.
  4. Bootstrap khoi (moving block) cho khoang tin cay cua "skill".
  5. Adaptive Conformal Prediction (Gibbs & Candes 2021) - khoang du bao co do phu do duoc.

Tien can: pip install numpy
"""
import math
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")


# ----------------------------------------------------------------- phan phoi
def _norm_sf_two_sided(t):
    """P(|Z| > |t|) cho Z chuan."""
    t = abs(float(t))
    return math.erfc(t / math.sqrt(2.0))


def _betacf(a, b, x):
    """Continued fraction cho ham beta (Numerical Recipes)."""
    MAXIT, EPS, FPMIN = 300, 3.0e-16, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < EPS:
            break
    return h


def _betai(a, b, x):
    """Ham beta chuan hoa I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                  + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def t_sf_two_sided(t, df):
    """P(|T_df| > |t|)."""
    df = int(df)
    if df <= 0:
        return 1.0
    t = abs(float(t))
    if t == 0.0:
        return 1.0
    return min(1.0, max(0.0, _betai(df / 2.0, 0.5, df / (df + t * t))))


# ------------------------------------------------------------- ham phu tru
def hac_var(d, lag):
    """Uoc luong phuong sai dai hau (Newey-West) cua chuoi sai lech loss."""
    d = np.asarray(d, float)
    T = len(d)
    if T < 3:
        return float("nan")
    e = d - d.mean()
    var = float(np.sum(e * e) / T)
    for l in range(1, int(lag) + 1):
        w = 1.0 - l / (lag + 1.0)
        var += 2.0 * w * float(np.sum(e[l:] * e[:-l]) / T)
    return var


def _loss_diff(pred, actual, base, power=2):
    e1 = np.asarray(pred, float) - np.asarray(actual, float)
    e0 = np.asarray(base, float) - np.asarray(actual, float)
    return (np.abs(e1) ** power) - (np.abs(e0) ** power), e1, e0


# ------------------------------------------------------------- Diebold-Mariano
def dm_test(pred, actual, base, h=1, power=2):
    """Diebold-Mariano: model (pred) co sai so nho hon baseline (base) khong?

    - Sai so: Newey-West HAC, lag = h-1 (cho du bao nhieu buoc co chong).
    - Hieu chinh mau nho Harvey-Leybourne-Newbold (1997):
        DM* = DM * sqrt((T + 1 - 2h + h(h-1)/T) / T)
    - p-value: phan phoi Student-t voi df = T-1.
    """
    d, e1, e0 = _loss_diff(pred, actual, base, power)
    T = len(d)
    if T < 5:
        return {"dm": None, "p": None, "T": int(T), "note": "qua ngan"}
    lag = max(0, min(int(h) - 1, T - 2))
    lrv = hac_var(d, lag)
    if not np.isfinite(lrv) or lrv <= 0:
        return {"dm": None, "p": None, "T": int(T),
                "note": "sai lech loss co phuong sai bang 0"}
    dm = float(np.mean(d) / math.sqrt(lrv / T))
    corr = math.sqrt((T + 1 - 2.0 * h + h * (h - 1.0) / T) / T)
    dm_hln = dm * corr
    p = t_sf_two_sided(dm_hln, T - 1)
    return {
        "dm": round(dm, 4), "dm_hln": round(dm_hln, 4), "p": round(p, 4),
        "T": int(T), "h": int(h), "mean_loss_diff": round(float(np.mean(d)), 6),
        "model_better": bool(np.mean(d) < 0),
        "sig_5pct": bool(p < 0.05), "sig_1pct": bool(p < 0.01),
        "note": "Diebold-Mariano (Newey-West HAC) + hieu chinh Harvey-Leybourne-Newbold, t(T-1)",
    }


# ---------------------------------------------------------------- Clark-West
def cw_test(pred, actual, base, h=1):
    """Clark-West (MSPE-adjusted) - truong hop baseline long nhau trong mo hinh.

    Cong thuc (Clark & West 2006/2007, NBER WP 326):
        f_t = e1_t^2 - e2_t^2 + (y1_t - y2_t)^2
    voi e1 = sai so baseline, e2 = sai so mo hinh, (y1 - y2) = chenh lech giua
    hai du bao. Kiem dinh MOT PHIA: gia thuyet "mo hinh khong tot hon baseline".
    """
    d, e_model, e_base = _loss_diff(pred, actual, base, 2)
    T = len(d)
    if T < 5:
        return {"cw": None, "p": None, "T": int(T), "note": "qua ngan"}
    # Clark-West: f = (e_base^2 - e_model^2) + (y_base - y_model)^2
    # Dung chieu nay: duoi gia thuyet goc (mo hinh khong tot hon baseline) f ~ 0;
    # neu mo hinh tot hon, f > 0 -> p-value mot phia ben phai.
    f = -d + (np.asarray(pred, float) - np.asarray(base, float)) ** 2
    lag = max(0, min(int(h) - 1, T - 2))
    lrv = hac_var(f, lag)
    if not np.isfinite(lrv) or lrv <= 0:
        return {"cw": None, "p": None, "T": int(T),
                "note": "sai lech da dieu chinh co phuong sai bang 0"}
    stat = float(np.mean(f) / math.sqrt(lrv / T))
    # mot phia: gia thuyet mo hinh co MSPE nho hon baseline
    p = 1.0 - 0.5 * (1.0 + math.erf(stat / math.sqrt(2.0)))
    return {
        "cw": round(stat, 4), "p": round(min(1.0, max(0.0, p)), 4),
        "T": int(T), "h": int(h),
        "model_better": bool(np.mean(f) < 0),
        "sig_5pct": bool(p < 0.05), "sig_10pct": bool(p < 0.10),
        "note": "Clark-West MSPE-adjusted, kiem dinh mot phia, Newey-West HAC",
    }


# --------------------------------------------------------- Pesaran-Timmermann
def pt_test(pred, actual, base):
    """Pesaran-Timmermann: du bao huong co tot hon ngau nhien khong?

    p_hat  = ty le doan huong dung
    p_star = p_y * p_z + (1-p_y)(1-p_z)   (xac suat dung neu doc lap)
    S_n    = (p_hat - p_star) / sqrt(p_star (1-p_star) / n)
    """
    pred = np.asarray(pred, float)
    actual = np.asarray(actual, float)
    base = np.asarray(base, float)
    d_act = np.sign(actual - base)
    d_pred = np.sign(pred - base)
    nz = d_act != 0
    d_act, d_pred = d_act[nz], d_pred[nz]
    n = len(d_act)
    if n < 10:
        return {"pt": None, "p": None, "n": int(n), "note": "qua ngan"}
    p_hat = float(np.mean(d_act == d_pred))
    p_y = float(np.mean(d_act > 0))
    p_z = float(np.mean(d_pred > 0))
    if p_z <= 0.001 or p_z >= 0.999:
        # du bao khong bao gio co huong (vd baseline "gia khong doi") -> khong co y nghia
        return {"pt": None, "p": None, "n": int(n), "hit_rate": round(p_hat * 100, 1),
                "note": "du bao khong co huong -> khong ap dung duoc kiem dinh huong"}
    p_star = p_y * p_z + (1 - p_y) * (1 - p_z)
    if p_star <= 0 or p_star >= 1:
        return {"pt": None, "p": None, "n": int(n), "hit_rate": round(p_hat * 100, 1),
                "note": "khong co bien phan huong"}
    stat = (p_hat - p_star) / math.sqrt(p_star * (1 - p_star) / n)
    p = _norm_sf_two_sided(stat)
    return {
        "pt": round(stat, 4), "p": round(p, 4), "n": int(n),
        "hit_rate": round(p_hat * 100, 1),
        "sig_5pct": bool(p < 0.05),
        "note": "Pesaran-Timmermann (don bien phan huong, phan phoi chuan)",
    }


# ------------------------------------------------------------ bootstrap skill
def skill_ci(pred, actual, base, h=1, n_boot=1000, seed=42, block=None):
    """Khoang tin cay 95% cho 'skill' = 1 - MAPE_model/MAPE_baseline (moving block bootstrap)."""
    pred = np.asarray(pred, float)
    actual = np.asarray(actual, float)
    base = np.asarray(base, float)
    T = len(pred)
    if T < 20:
        return {"skill_ci": None, "note": "qua ngan"}
    if block is None:
        block = max(1, int(h))

    def skill_of(idx):
        a, p, b = actual[idx], pred[idx], base[idx]
        m = float(np.mean(np.abs((p - a) / a)))
        nv = float(np.mean(np.abs((b - a) / a)))
        return (1 - m / nv) * 100 if nv else 0.0

    point = skill_of(np.arange(T))
    rng = np.random.default_rng(seed)
    vals = np.empty(n_boot)
    nblocks = int(np.ceil(T / block))
    starts_max = T - block + 1
    for i in range(n_boot):
        starts = rng.integers(0, starts_max, size=nblocks)
        idx = np.concatenate([np.arange(s, s + block) for s in starts])[:T]
        vals[i] = skill_of(idx)
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return {
        "skill": round(point, 1),
        "skill_ci": [round(float(lo), 1), round(float(hi), 1)],
        "skill_p_above_0": round(float(np.mean(vals > 0)), 4),
        "n_boot": int(n_boot), "block": int(block), "T": int(T),
        "note": "moving-block bootstrap, CI 95%",
    }


# ----------------------------------------------------------- conformal (ACI)
def conformal(pred, actual, h=1, alpha=0.1, gamma=0.01, min_train=30):
    """Adaptive Conformal Prediction (Gibbs & Candes 2021) - khoang du bao co do phu.

    Dung sai le RELATIVE (|pred/actual - 1|) nen khoang nhan duoc cho moi cap gia.
    Moi buoc du bao chi dung cac loi da 'chin muoi' trong qua khu (khong ro ri).
    """
    pred = np.asarray(pred, float)
    actual = np.asarray(actual, float)
    T = len(pred)
    if T < 15:
        return {"coverage": None, "width_pct": None, "note": "qua ngan"}
    rel = np.abs(pred - actual) / np.abs(actual)
    lo = np.full(T, np.nan)
    hi = np.full(T, np.nan)
    q_used = np.full(T, np.nan)
    a = float(alpha)
    for t in range(T):
        # loi cua du bao t-? da chin muoi (forecast j mat sau j+h <= t)
        n_matured = t - int(h) + 1
        matured = rel[:n_matured] if n_matured > 0 else np.array([])
        # cap nhat alpha sau khi loi vua chinh muoi (forecast t-h)
        j = t - int(h)
        if j >= 0:
            hit = 1.0 if rel[j] > q_used[j] else 0.0
            a = min(0.5, max(0.001, a + gamma * (alpha - hit)))
        if len(matured) >= min_train:
            q = float(np.quantile(matured, min(0.999, max(0.01, 1.0 - a))))
        elif len(rel[:t]) >= 5:
            q = float(np.quantile(rel[:t], 0.9))
        else:
            q = 0.05
        q_used[t] = q
        lo[t] = pred[t] * (1 - q)
        hi[t] = pred[t] * (1 + q)
    ok = ~np.isnan(q_used)
    # do phu chi o nhung buoc da co du lieu chinh muoi du de dung
    start = max(0, min_train + int(h) - 1)
    sel = np.arange(start, T)
    if len(sel) == 0:
        return {"coverage": None, "width_pct": None, "note": "khong du du lieu"}
    cover = float(np.mean((actual[sel] >= lo[sel]) & (actual[sel] <= hi[sel])))
    width = float(np.mean((hi[sel] - lo[sel]) / np.abs(actual[sel])) * 100)
    return {
        "coverage": round(cover * 100, 1),
        "width_pct": round(width, 2),
        "q_pct": round(float(q_used[-1]) * 100, 2),      # nua do rong (dung cho lo/hi)
        "q_final_pct": round(float(q_used[-1]) * 100, 2),
        "target_coverage": round((1 - alpha) * 100, 0),
        "alpha_final": round(a, 4),
        "n": int(len(sel)),
        "note": "Adaptive Conformal Prediction (Gibbs & Candes 2021), khoang tuong doi",
    }


# ------------------------------------------------------------------ tong hop
def evaluate_forecast(pred, actual, base, h=1, alpha=0.1, n_boot=1000, seed=42):
    """Chay tat ca kiem dinh cho mot horizon. Tra ve dict gon de luu vao JSON."""
    out = {"dm": dm_test(pred, actual, base, h=h),
           "cw": cw_test(pred, actual, base, h=h),
           "pt": pt_test(pred, actual, base),
           "skill": skill_ci(pred, actual, base, h=h, n_boot=n_boot, seed=seed),
           "conformal": conformal(pred, actual, h=h, alpha=alpha)}
    out["significant"] = bool((out["dm"].get("sig_5pct") or out["cw"].get("sig_5pct"))
                              and out["skill"].get("skill_ci") is not None
                              and out["skill"]["skill_ci"][0] > 0)
    return out


if __name__ == "__main__":
    rng = np.random.default_rng(0)
    n = 400

    def make_series(momentum):
        px = np.empty(n)
        px[0] = 100.0
        ret = np.zeros(n)
        for t in range(1, n):
            shock = rng.normal(0, 0.005)
            ret[t] = momentum * ret[t - 1] + shock
            px[t] = px[t - 1] * (1 + ret[t])
        return px, ret

    for label, momentum in (("[A] random walk (mo hinh vo skill)", 0.0),
                            ("[B] co momentum (mo hinh co skill)", 0.4)):
        actual, ret = make_series(momentum)
        base = np.concatenate([[100.0], actual[:-1]])
        if momentum == 0.0:
            pred = base * (1 + rng.normal(0, 0.002, n))
        else:
            pred = np.empty(n)
            pred[0] = actual[0]
            pred[1:] = actual[:-1] * (1 + momentum * ret[:-1])
        r = evaluate_forecast(pred, actual, base, h=1, n_boot=300)
        print(label)
        print("    DM p =", r["dm"]["p"], "| CW p =", r["cw"]["p"], "| PT p =", r["pt"]["p"])
        print("    skill =", r["skill"]["skill"], r["skill"]["skill_ci"],
              "| conformal:", r["conformal"]["coverage"], "% / rong", r["conformal"]["width_pct"], "%")
