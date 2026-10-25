"""Tai du lieu gia VANG: the gioi (Yahoo GC=F, USD/oz) + trong nuoc (SJC, d/luong).

Gia trong nuoc lay tu bieu do Highcharts nhung trong trang giavang.org/trong-nuoc/sjc/
(moi diem: [timestamp_ms, gia_trieu_dong_tren_luong]).
"""
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from fetch_data import DATA_DIR, fetch_yahoo, load_csv, save_csv  # noqa: F401

WORLD_PATH = os.path.join(DATA_DIR, "gold.csv")
VN_PATH = os.path.join(DATA_DIR, "gold_vn.csv")
SJC_URL = "https://giavang.org/trong-nuoc/sjc/"

UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
      "Accept-Language": "vi,en;q=0.9"}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def _get(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                  timeout=timeout, context=CTX).read().decode("utf-8", "ignore")


def fetch_world_gold(rng="10y"):
    """Gia vang the gioi theo ngay (COMEX GC=F, USD/oz)."""
    return fetch_yahoo("GC=F", rng=rng)


def parse_sjc_series(html):
    """Tra ve [(date, gia_ban_ra_d/luong), ...] tu cac mang `data:[[ts,val],...]`."""
    series = []
    for m in re.finditer(r"data\s*:\s*(\[\[.*?\]\])", html, re.S):
        pts = re.findall(r"\[(\d{13}),([\d.]+)\]", m.group(1))
        if len(pts) < 20:
            continue
        merged = {}
        for ts, val in pts:
            d = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            merged[d] = float(val) * 1_000_000      # trieu d/luong -> d/luong
        series.append(sorted(merged.items()))
    if not series:
        return []
    series.sort(key=lambda s: s[-1][1])             # ban ra = chuoi gia cao hon
    return series[-1]


def fetch_vn_gold():
    """Doc chuoi gia SJC tu giavang.org. Tra ve (rows, info) hoac (None, None)."""
    html = _get(SJC_URL)
    rows = parse_sjc_series(html)
    if not rows:
        return None, None
    return rows, {"source": SJC_URL, "points": len(rows), "first": rows[0][0],
                  "last": rows[-1][0], "last_price": rows[-1][1]}


def update_gold(rng="10y"):
    """Cap nhat ca hai chuoi, tra ve tom tat."""
    out = {}
    world = fetch_world_gold(rng=rng)
    if world:
        save_csv(WORLD_PATH, world)
        out["world"] = {"points": len(world), "first": world[0][0], "last": world[-1][0],
                        "last_usd_oz": world[-1][1]}
    try:
        rows, info = fetch_vn_gold()
        if rows:
            old = load_csv(VN_PATH) if os.path.exists(VN_PATH) else []
            merged = {d: v for d, v in old}
            for d, v in rows:
                merged[d] = v
            save_csv(VN_PATH, sorted(merged.items()))
            out["vn"] = {**info, "total": len(merged)}
    except Exception as e:
        out["vn"] = {"error": repr(e)[:200]}
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(update_gold(), ensure_ascii=False, indent=2))
