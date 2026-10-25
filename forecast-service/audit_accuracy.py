"""Kiem tra nghiem tuc: cac con so 'do chinh xac' co thuc su dang tin khong.

Tra loi 3 cau hoi:
  A. Mo hinh co hon baseline ngay tho ("gia thang truoc") khong? Hon bao nhieu?
  B. Ket qua co on dinh qua cac giai doan khac nhau khong?
  C. Sai so nam o dau: o mo hinh, hay o khau quy doi Ra d/kg VN?
"""
import os
import sys
import json
from collections import defaultdict

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from fetch_data import load_csv, DATA_DIR
import robusta as rb
import model_robusta as MR


def mape(a, p):
    return float(np.mean(np.abs((p - a) / a)) * 100)


def r2(a, p):
    ss_res = float(np.sum((p - a) ** 2))
    ss_tot = float(np.sum((a - a.mean()) ** 2))
    return 1 - ss_res / ss_tot if ss_tot else 0.0


print("=" * 74)
print("A. MO HINH vs BASELINE NGAY THO  (baseline = gia thang truoc, khong doi)")
print("=" * 74)

data, months = MR.load_monthly()
X, names, valid, rob = MR.build(data)
y = MR.targets(rob, MR.HORIZONS)

hdr = f"{'han':>8} {'MAPE mo hinh':>13} {'MAPE naive':>11} {'skill':>7} {'R2(muc)':>8} {'R2(thaydoi)':>12} {'huong':>7} {'n':>5}"
print(hdr)
print("-" * len(hdr))

audit = {}
for h in (1, 3, 6, 12):
    p, a, b = MR.walk_forward(X, valid, y[h], rob, h, step=6)
    if len(a) < 20:
        continue
    m_mape, n_mape = mape(a, p), mape(a, b)
    # R2 tren % thay doi (trung thuc hon R2 tren muc gia)
    act_ret = a / b - 1
    pred_ret = p / b - 1
    r2_ret = r2(act_ret, pred_ret)
    r2_naive = r2(act_ret, np.zeros_like(act_ret))
    d = np.sign(p - b) == np.sign(a - b)
    audit[h] = dict(mape=round(m_mape, 2), naive=round(n_mape, 2),
                    skill=round((1 - m_mape / n_mape) * 100, 1),
                    r2_level=round(r2(a, p), 3), r2_ret=round(r2_ret, 3),
                    r2_ret_naive=round(r2_naive, 3),
                    dir=round(float(d.mean()) * 100, 1), n=len(a))
    print(f"{'+'+str(h)+' thang':>8} {m_mape:12.2f}% {n_mape:10.2f}% "
          f"{(1-m_mape/n_mape)*100:6.1f}% {r2(a,p):7.3f} {r2_ret:11.3f} "
          f"{d.mean()*100:6.1f}% {len(a):5d}")

print()
print("  -> R2 tren MUC GIA luon rat cao ke ca voi naive, vi gia rat 'tram'.")
print("     R2 tren % THAY DOI moi noi len mo hinh that su giai thich duoc gi.")

print()
print("=" * 74)
print("B. ON DINH QUA CAC GIAI DOAN (han +1 thang)")
print("=" * 74)

h = 1
p, a, b = MR.walk_forward(X, valid, y[h], rob, h, step=6)
# lay thang tuong ung voi tung diem test
n = len(rob)
start = max(0, n - 180)
idx = [i for i in range(start, n - h) if valid[i]]
block = defaultdict(lambda: ([], []))
for i, pa, aa in zip(idx, p, a):
    yr = int(data[i + h]["month"][:4])
    key = f"{(yr//5)*5}-{(yr//5)*5+4}"
    block[key][0].append(aa)
    block[key][1].append(pa)
print(f"{'giai doan':>12} {'MAPE':>8} {'R2(muc)':>9} {'len':>5}")
for k in sorted(block):
    aa = np.array(block[k][0]); pp = np.array(block[k][1])
    print(f"{k:>12} {mape(aa,pp):7.2f}% {r2(aa,pp):8.3f} {len(aa):5d}")

print()
print("=" * 74)
print("C. SAI SO O KHAU QUY DOI Ra d/kg VN")
print("=" * 74)

vn = load_csv(os.path.join(DATA_DIR, "vn_domestic.csv"))
fx_rows = sorted(load_csv(os.path.join(DATA_DIR, "usdvnd.csv")))
fx_dates = [d for d, _ in fx_rows]


def fx_at(date):
    import bisect
    i = bisect.bisect_right(fx_dates, date) - 1
    return fx_rows[max(i, 0)][1]


rob = dict(rb.monthly_prices()["Coffee, Robusta"])
rob_months = sorted(rob)

rows = []
for date, price in sorted(vn):
    m = date[:7]
    cand = [x for x in rob_months if x <= m] or rob_months
    rp = rob[cand[-1]]
    fx = fx_at(date)
    if rp > 0 and fx > 0:
        rows.append((date, price, rp, fx, price / (rp * fx)))

print(f"  so quan sat gia VN khop duoc: {len(rows)}  ({rows[0][0]} -> {rows[-1][0]})")
print()
print(f"  {'nam':>10} {'so mau':>7} {'ti le VN/(Robusta x FX) trung vi':>34}")
byyear = defaultdict(list)
for d, _, _, _, r in rows:
    byyear[d[:4]].append(r)
for y in sorted(byyear):
    v = np.array(byyear[y])
    print(f"  {y:>10} {len(v):7d} {np.median(v):34.3f}")

allr = np.array([r for *_, r in rows])
print()
print(f"  TAT CA: trung vi {np.median(allr):.3f}, do lech chuan {allr.std():.3f}, "
      f"khoang {allr.min():.3f}-{allr.max():.3f}")
print(f"  => bien dong cua ti le: ~{allr.std()/np.median(allr)*100:.0f}% "
      "-> day la nguon sai so LON NHAT khi quy ra d/kg")

# do dan hoi: gia VN tang bao nhieu % khi gia the gioi tang 1%
lr = np.log(np.array([pr / (rp * fx) for _, pr, rp, fx, _ in rows]))
lx = np.log(np.array([rp * fx for _, pr, rp, fx, _ in rows]))
if len(rows) > 5:
    b1, a1 = np.polyfit(lx, np.log(np.array([pr for _, pr, *_ in rows])), 1)
    resid = np.log(np.array([pr for _, pr, *_ in rows])) - (a1 + b1 * lx)
    print()
    print(f"  Hoi quy log(gia VN) ~ log(Robusta x FX):  do dan hoi = {b1:.3f}")
    print(f"    (1.0 = chuyen het bien dong the gioi sang gia VN; "
          f"0 = gia VN khong lien quan)")
    print(f"    R2 = {r2(np.log(np.array([pr for _, pr, *_ in rows])), a1 + b1*lx):.3f}, "
          f"lech chuan phan du = {resid.std()*100:.1f}%")
    print(f"    => du doan dung Robusta, gia VN van co the lech ~{resid.std()*200:.0f}% (2 do lech chuan)")

print()
print("=" * 74)
print("KET LUAN SO BO")
print("=" * 74)
print(f"  Model +1 thang: MAPE {audit.get(1,{}).get('mape')}%, naive {audit.get(1,{}).get('naive')}% "
      f"-> skill {audit.get(1,{}).get('skill')}%")
print(f"  R2 tren % thay doi: mo hinh {audit.get(1,{}).get('r2_ret')} vs naive {audit.get(1,{}).get('r2_ret_naive')}")
print(f"  Do chinh xac huong: {audit.get(1,{}).get('dir')}% (tung dong xu = 50%)")
