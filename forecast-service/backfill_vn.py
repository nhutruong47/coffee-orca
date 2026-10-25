"""Backfill lich su gia ca phe VN tu Wayback Machine.

Lay cac ban chup cua giacaphe.com (trang toan quoc + tung tinh), doc gia trong
<title>, luu dan vao data/backfill_vn.csv (co the chay lai de tiep tuc).

Chay:  python backfill_vn.py            # toan bo
       python backfill_vn.py --pages 50  # gioi han so trang moi nguon (thu nghiem)
"""
import os
import re
import csv
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)
OUT = os.path.join(DATA_DIR, "backfill_vn.csv")

UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")}

SOURCES = {
    "national": {"src": "giacaphe.com/gia-ca-phe-noi-dia/", "collapse": 8,
                 "label": "Toàn quốc"},
    "dak-lak":  {"src": "giacaphe.com/gia-ca-phe-dak-lak/", "collapse": 8,
                 "label": "Đắk Lắk"},
    "lam-dong": {"src": "giacaphe.com/gia-ca-phe-lam-dong/", "collapse": 8,
                 "label": "Lâm Đồng"},
    "gia-lai":  {"src": "giacaphe.com/gia-ca-phe-gia-lai/", "collapse": 8,
                 "label": "Gia Lai"},
    "dak-nong": {"src": "giacaphe.com/gia-ca-phe-dak-nong/", "collapse": 8,
                 "label": "Đắk Nông"},
}

PACE = float(os.environ.get("BACKFILL_PACE", "2.0"))


def fetch(url, timeout=120, tries=6):
    """GET co backoff khi bi 429 / loi tam thoi."""
    delay = 20
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504):
                print(f"   [{e.code}] doi {delay}s ...", flush=True)
                time.sleep(delay)
                delay = min(delay * 2, 180)
                continue
            raise
        except Exception:
            time.sleep(10)
            delay = min(delay * 2, 120)
    raise RuntimeError("het luot thu: " + url)


def cdx_timestamps(src, collapse):
    url = (f"http://web.archive.org/cdx/search/cdx?url={src}"
           f"&output=json&fl=timestamp,statuscode&filter=statuscode:200"
           f"&collapse=timestamp:{collapse}&limit=5000")
    rows = json.loads(fetch(url))
    return [r[0] for r in rows[1:]]


PROVINCES = ("\u0110\u1eafk L\u1eafk", "\u0110\u0103k L\u0103k", "L\u00e2m \u0110\u1ed3ng",
             "Gia Lai", "\u0110\u1eafk N\u00f4ng", "\u0110\u0103k N\u00f4ng", "\u0110ak N\u00f4ng")


def _clean_text(html):
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", txt)


def price_from_body(html):
    """Trang cu khong de gia trong <title>: tim gia trong phan noi dung.

    Uu tien so nam ngay sau ten tinh (bang gia theo tinh), hoac so dung
    truoc 'd/kg'. Tra ve trung vi (median) cua cac ung vien de bot nhieu.
    """
    txt = _clean_text(html)
    cands = []
    for p in PROVINCES:
        for m in re.finditer(re.escape(p) + r"[^0-9]{0,40}?(\d{2}[.,]\d{3})", txt):
            try:
                v = float(m.group(1).replace(".", "").replace(",", ""))
            except Exception:
                continue
            if 5000 <= v <= 300000:
                cands.append(v)
    if len(cands) < 2:
        for m in re.finditer(r"(\d{2}[.,]\d{3})\s*(?:vn\u0111|vnd|\u0111)\s*/?\s*kg", txt, re.I):
            try:
                v = float(m.group(1).replace(".", "").replace(",", ""))
            except Exception:
                continue
            if 5000 <= v <= 300000:
                cands.append(v)
    if len(cands) < 2:
        return None
    cands.sort()
    return cands[len(cands) // 2]


def parse_vn(html):
    """Tra ve (ngay YYYY-MM-DD, gia d/kg)."""
    t = re.search(r"<title>(.*?)</title>", html, re.S)
    title = t.group(1).strip() if t else ""

    price = None
    for pat in (r"cao nh\u1ea5t\s*([\d.,]+)\s*(?:vn\u0111|vnd|\u0111)",
                r":\s*([\d.,]{5,9})\s*(?:vn\u0111|vnd|\u0111)\s*/?\s*kg?",
                r"([\d]{2}[.,][\d]{3})\s*(?:vn\u0111|vnd|\u0111)"):
        m = re.search(pat, title, re.I)
        if m:
            try:
                v = float(m.group(1).replace(".", "").replace(",", ""))
            except Exception:
                continue
            if 3000 <= v <= 500000:
                price = v
                break
    if price is None:
        price = price_from_body(html)

    dm = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", title)
    if not dm:
        dm = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", _clean_text(html)[:4000])
    date = None
    if dm:
        d, mo, y = dm.groups()
        date = f"{y}-{int(mo):02d}-{int(d):02d}"
    return date, price


def load_done():
    done = set()
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                done.add((row["page"], row["date"]))
    return done


def append_rows(rows):
    new = not os.path.exists(OUT)
    with open(OUT, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["page", "label", "date", "price", "snapshot"])
        if new:
            w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=0, help="gioi han so ban chup moi nguon")
    a = ap.parse_args()

    done = load_done()
    print(f"da co {len(done)} dong trong {OUT}", flush=True)

    for key, meta in SOURCES.items():
        print(f"\n=== {meta['label']} ({meta['src']}) ===", flush=True)
        try:
            stamps = cdx_timestamps(meta["src"], meta["collapse"])
        except Exception as e:
            print("  LOI CDX:", repr(e)[:120], flush=True)
            continue
        if a.pages:
            stamps = stamps[-a.pages:]
        print(f"  {len(stamps)} ban chup", flush=True)

        buf = []
        for i, ts in enumerate(stamps, 1):
            snap_date = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            if (key, snap_date) in done:
                continue
            url = f"https://web.archive.org/web/{ts}/https://{meta['src']}"
            try:
                html = fetch(url)
                date, price = parse_vn(html)
            except Exception as e:
                print(f"  [{i}/{len(stamps)}] {snap_date} LOI {repr(e)[:60]}", flush=True)
                continue
            if date and price:
                buf.append({"page": key, "label": meta["label"], "date": date,
                            "price": price, "snapshot": ts})
                done.add((key, date))
                if len(buf) >= 10:
                    append_rows(buf); buf = []
                print(f"  [{i}/{len(stamps)}] {date}  {price:,.0f} d/kg", flush=True)
            else:
                print(f"  [{i}/{len(stamps)}] {snap_date} (khong co gia)", flush=True)
            time.sleep(PACE)
        if buf:
            append_rows(buf)
        print(f"  -> xong {meta['label']}", flush=True)

    # thong ke
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        by = {}
        for r in rows:
            by.setdefault(r["page"], []).append(r["date"])
        print("\n=== TONG KET ===", flush=True)
        for k, v in by.items():
            print(f"  {k:10s} {len(v):4d} ngay  ({min(v)} -> {max(v)})", flush=True)


if __name__ == "__main__":
    main()
