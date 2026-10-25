"""Tai du lieu gia ca phe (Arabica ICE KC=F) + ty gia USD/VND tu Yahoo Finance."""
import os
import csv
import json
import re
import urllib.request
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

SOURCES = {
    "coffee": {"symbol": "KC=F", "name": "Arabica ICE futures (US cents/lb)"},
    "usdvnd": {"symbol": "VND=X", "name": "USD/VND"},
}

REGIONS = {"dak-lak": "Đắk Lắk", "lam-dong": "Lâm Đồng", "gia-lai": "Gia Lai",
           "dak-nong": "Đắk Nông"}


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", errors="ignore")


def fetch_yahoo(symbol: str, rng: str = "10y", interval: str = "1d"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={rng}&interval={interval}"
    j = json.loads(_get(url))
    res = j["chart"]["result"][0]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    rows = []
    for i, t in enumerate(ts):
        c = q["close"][i]
        if c is None:
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
        rows.append((d, float(c)))
    # dedupe theo ngay
    seen = {}
    for d, c in rows:
        seen[d] = c
    return sorted(seen.items())


def save_csv(path: str, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "value"])
        w.writerows(rows)


def load_csv(path: str):
    out = []
    with open(path, encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            out.append((row["date"], float(row["value"])))
    return out


def update_all(rng: str = "10y"):
    summary = {}
    for key, meta in SOURCES.items():
        rows = fetch_yahoo(meta["symbol"], rng=rng)
        save_csv(os.path.join(DATA_DIR, f"{key}.csv"), rows)
        summary[key] = {"symbol": meta["symbol"], "points": len(rows),
                        "first": rows[0][0], "last": rows[-1][0], "last_value": rows[-1][1]}
    # snapshot gia noi dia VN tu tieu de giacaphe (neu lay duoc)
    try:
        dom = fetch_vn_domestic()
        if dom:
            p = os.path.join(DATA_DIR, "vn_domestic.csv")
            old = load_csv(p) if os.path.exists(p) else []
            merged = {d: v for d, v in old}
            merged[dom["date"]] = dom["price"]
            save_csv(p, sorted(merged.items()))
            summary["vn_domestic"] = dom
    except Exception as e:
        summary["vn_domestic"] = {"error": repr(e)[:200]}
    # Import the published dated daily province table; keep the source explicit.
    region_out = {}
    for slug, name in REGIONS.items():
        try:
            history = fetch_region_history(slug)
            if history:
                p = os.path.join(DATA_DIR, f"region_{slug}.csv")
                old = load_csv(p) if os.path.exists(p) else []
                merged = {d: v for d, v in old}
                merged.update(history)
                save_csv(p, sorted(merged.items()))
                region_out[slug] = {
                    "name": name,
                    "price": history[max(history)],
                    "date": max(history),
                    "source": f"nongdanviet.vn/gia-ca-phe/{slug}",
                    "days": len(merged),
                    "latest_points_imported": len(history),
                }
            else:
                region_out[slug] = {
                    "name": name,
                    "price": None,
                    "date": None,
                    "source": f"nongdanviet.vn/gia-ca-phe/{slug}",
                    "note": "no parseable published daily prices",
                }
        except Exception as e:
            region_out[slug] = {"name": name, "price": None, "error": repr(e)[:150]}
    summary["regions"] = region_out
    with open(os.path.join(DATA_DIR, "regions.json"), "w", encoding="utf-8") as f:
        json.dump(region_out, f, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"updated_at": datetime.now(timezone.utc).isoformat(), "sources": summary}, f,
                  ensure_ascii=False, indent=2)
    return summary


def parse_price(text: str):
    """Lay gia dang '92,300đ/kg' hoac '93.200 vnd/kg'."""
    import re
    cands = []
    for m in re.finditer(r"(\d{2}[.,]\d{3})\s*(?:vn\u0111|vnd|\u0111|đ)\s*/\s*kg", text, re.I):
        v = float(m.group(1).replace(".", "").replace(",", ""))
        cands.append(v)
    for m in re.finditer(r"(\d{2}[.,]\d{3})\s*(?:vn\u0111|vnd|\u0111|đ)", text, re.I):
        v = float(m.group(1).replace(".", "").replace(",", ""))
        cands.append(v)
    cands = [c for c in cands if 30000 <= c <= 300000]
    if not cands:
        return None
    # gia ca phe VN thuc te > 60k; loai nhieu (vd 40,000 cua san pham khac)
    coffee = [c for c in cands if c >= 60000]
    pool = coffee or cands
    # chon gia tri xuat hien nhieu nhat
    best = max(set(pool), key=pool.count)
    return best


def parse_date(text: str):
    import re
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_region_price(slug: str):
    """Gia ca phe 1 tinh: lay tu <title> giacaphe (dang '... : 92,300đ/kg').

    Trang tinh khong render gia trong HTML, nen chi lay khi title co gia.
    Tra ve None neu khong co -> tranh nham voi so khac trong trang.
    """
    import re
    d = _get(f"https://giacaphe.com/gia-ca-phe-{slug}/")
    m = re.search(r"<title>(.*?)</title>", d, re.S)
    title = (m.group(1) if m else "").strip()
    mt = re.search(r":\s*(\d{2}[.,]\d{3})\s*(?:vn\u0111|vnd|\u0111|đ)", title, re.I)
    if not mt:
        return None
    price = float(mt.group(1).replace(".", "").replace(",", ""))
    if not (30000 <= price <= 300000):
        return None
    return {"date": parse_date(title or d), "price": price, "title": title[:120],
            "source": f"giacaphe.com/gia-ca-phe-{slug}/"}


def fetch_region_history(slug: str):
    """Read visible dated Robusta farmgate prices from the province history table."""
    if slug not in REGIONS:
        raise ValueError(f"Unknown region: {slug}")
    document = _get(f"https://nongdanviet.vn/gia-ca-phe/{slug}")
    rows = re.findall(
        r"<tr[^>]*>\s*<td[^>]*>(20\d{2}-\d{2}-\d{2})</td>\s*<td[^>]*>([\d.,]+)</td>",
        document,
        re.I,
    )
    prices = {}
    for date, raw in rows:
        value = float(raw.replace(".", "").replace(",", ""))
        if 30000 <= value <= 300000:
            prices[date] = value
    return prices


def fetch_vn_domestic():
    """Lay gia cao nhat trong tieu de trang gia ca phe noi dia cua giacaphe.com."""
    import re
    d = _get("https://giacaphe.com/gia-ca-phe-noi-dia/")
    m = re.search(r"cao nh\u1ea5t\s*([\d.,]+)\s*vn\u0111/kg", d, re.I)
    if not m:
        m = re.search(r"([\d]{2}[.,][\d]{3})\s*vn\u0111/kg", d, re.I)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", "")
    price = float(raw)
    dm = re.search(r"(\d{2}/\d{2}/\d{4})", d)
    date = dm.group(1) if dm else ""
    if date:
        dd, mm, yy = date.split("/")
        date = f"{yy}-{mm}-{dd}"
    return {"date": date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "price": price, "source": "giacaphe.com"}


if __name__ == "__main__":
    s = update_all()
    print(json.dumps(s, ensure_ascii=False, indent=2))
