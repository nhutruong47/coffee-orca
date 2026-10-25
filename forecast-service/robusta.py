"""Doc gia ca phe Robusta/Arabica thang tu World Bank Pink Sheet (xlsx).

Khong can thu vien ngoai: doc truc tiep XML trong file xlsx.
Nguon: https://www.worldbank.org/en/research/commodity-markets  (CMO-Historical-Data-Monthly.xlsx)
"""
import io
import os
import re
import sys
import json
import zipfile
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

PINK_SHEET_PAGE = "https://www.worldbank.org/en/research/commodity-markets"
PINK_SHEET_URL = ("https://thedocs.worldbank.org/en/doc/"
                  "74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/"
                  "CMO-Historical-Data-Monthly.xlsx")
XLSX_CACHE = os.path.join(DATA_DIR, "CMO-Historical-Data-Monthly.xlsx")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def resolve_url():
    """Tim link Pink Sheet moi nhat tren trang World Bank (doi theo thang)."""
    try:
        req = urllib.request.Request(PINK_SHEET_PAGE, headers=HEADERS)
        html = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "ignore")
        links = re.findall(r"https?://[^\"'<> ]*CMO-Historical-Data-Monthly\.xlsx", html)
        if links:
            return links[0]
    except Exception:
        pass
    return PINK_SHEET_URL


def download(force=False):
    if os.path.exists(XLSX_CACHE) and not force:
        return XLSX_CACHE
    url = resolve_url()
    req = urllib.request.Request(url, headers=HEADERS)
    raw = urllib.request.urlopen(req, timeout=120).read()
    with open(XLSX_CACHE, "wb") as f:
        f.write(raw)
    return XLSX_CACHE


def _shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    xml = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
    out = []
    for si in re.findall(r"<si>(.*?)</si>", xml, re.S):
        out.append("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
    return out


def _sheet_path(z, want_name):
    wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore")
    rid2target = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    for m in re.finditer(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if m.group(1) == want_name:
            t = rid2target.get(m.group(2), "")
            return ("xl/" + t.lstrip("/")) if not t.startswith("xl/") else t
    return None


def _rows(z, shared, path):
    xml = z.read(path).decode("utf-8", "ignore")
    for row in re.findall(r"<row[^>]*>(.*?)</row>", xml, re.S):
        cells = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(.*?)</c>', row, re.S):
            col, attrs, body = cm.group(1), cm.group(2), cm.group(3)
            v = re.search(r"<v>(.*?)</v>", body, re.S)
            if not v:
                continue
            val = v.group(1)
            if 't="s"' in attrs:
                try:
                    val = shared[int(val)]
                except Exception:
                    pass
            cells[col] = val
        if cells:
            yield cells


def _col_letter(idx):
    s = ""
    idx += 1
    while idx:
        idx, r = divmod(idx - 1, 26)
        s = chr(65 + r) + s
    return s


def monthly_prices(series_names=("Coffee, Robusta", "Coffee, Arabica")):
    """Tra ve {ten_series: [( 'YYYY-MM', gia_USD_kg ), ...]}."""
    path = download()
    z = zipfile.ZipFile(path)
    shared = _shared_strings(z)
    sp = _sheet_path(z, "Monthly Prices")
    if not sp:
        raise RuntimeError("khong tim thay sheet 'Monthly Prices'")
    rows = list(_rows(z, shared, sp))

    header_row = None
    for i, r in enumerate(rows[:20]):
        vals = [v.lower() for v in r.values()]
        if any("robusta" in v for v in vals) or any("arabica" in v for v in vals):
            header_row = i
            break
    if header_row is None:
        raise RuntimeError("khong tim thay dong tieu de")

    header = rows[header_row]
    cols = {}
    for col, val in header.items():
        low = val.strip().lower()
        for name in series_names:
            if name.lower() in low:
                cols[name] = col
    if not cols:
        raise RuntimeError("khong tim thay cot Robusta/Arabica")

    out = {k: [] for k in cols}
    for r in rows[header_row + 1:]:
        date = r.get("A", "").strip()
        m = re.match(r"^(\d{4})M(\d{2})$", date)
        if not m:
            continue
        for name, col in cols.items():
            raw = r.get(col, "").strip()
            try:
                val = float(raw)
            except Exception:
                continue  # o trong / ky hieu '…'
            out[name].append((f"{m.group(1)}-{m.group(2)}", val))
    return out


if __name__ == "__main__":
    d = monthly_prices()
    for k, v in d.items():
        print(f"{k}: {len(v)} diem, {v[0][0]} -> {v[-1][0]}, moi nhat {v[-1][1]} USD/kg")
