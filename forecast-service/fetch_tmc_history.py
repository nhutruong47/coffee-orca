"""Fetch province-level daily Robusta prices from Thị Trường Cà Phê archive API.

Keep this source separate from other sites because its reported value is a
median across active public sources, not a quote from one specific dealer.
"""
from __future__ import annotations

import csv
import json
import re
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
ARCHIVE_URL = "https://thitruongcaphe.vn/gia-ca-phe/ngay"
API_URL = "https://thitruongcaphe.vn/api/prices/history"
PROVINCES = ("dak_lak", "lam_dong", "gia_lai", "dak_nong", "kon_tum")
METHOD_URL = "https://thitruongcaphe.vn/phuong-phap"
USER_AGENT = "Mozilla/5.0 (compatible; CoffeeForecast/1.0; price-history-import)"


def _get(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def _archived_dates() -> list[date]:
    text = _get(ARCHIVE_URL).decode("utf-8", errors="replace")
    found = set()
    for day, month, year in re.findall(
        r"/gia-ca-phe/ngay/(\d{2})-(\d{2})-(\d{4})", text
    ):
        found.add(date(int(year), int(month), int(day)))
    if not found:
        raise RuntimeError("Archive index returned no dated daily pages")
    return sorted(found)


def _fetch_range(start: date, end: date) -> list[dict]:
    query = urllib.parse.urlencode({"from": start.isoformat(), "to": end.isoformat()})
    payload = json.loads(_get(f"{API_URL}?{query}"))
    if payload.get("from") != start.isoformat() or payload.get("to") != end.isoformat():
        raise ValueError("API returned an unexpected date range")
    rows = payload.get("prices")
    if not isinstance(rows, list):
        raise ValueError("API response has no prices list")
    cleaned = []
    for row in rows:
        province = row.get("province")
        day = row.get("tradeDate")
        price = row.get("priceVndKg")
        if province not in PROVINCES or not isinstance(day, str):
            continue
        observed = date.fromisoformat(day)
        if not (start <= observed <= end):
            raise ValueError("API returned a row outside the requested range")
        value = float(price)
        if 30_000 <= value <= 300_000:
            cleaned.append({"date": day, "province": province, "price_vnd_kg": value})
    return cleaned


def refresh() -> dict:
    archived = _archived_dates()
    # The archive index can lag today's page. Re-check the last seven calendar
    # days as well, while never inventing rows for dates the API does not return.
    today = date.today()
    recent = {today - timedelta(days=offset) for offset in range(8)}
    candidates = sorted(set(archived) | recent)
    collected: dict[tuple[str, str], float] = {}
    for offset in range(0, len(candidates), 7):
        batch = candidates[offset:offset + 7]
        start, end = batch[0], batch[-1]
        try:
            rows = _fetch_range(start, end)
        except Exception:
            # Skip gaps in old archived data; a failure for the newest range
            # should still be surfaced instead of silently calling it fresh.
            if end >= today - timedelta(days=2):
                raise
            continue
        for row in rows:
            collected[(row["province"], row["date"])] = row["price_vnd_kg"]
    end = today

    if not collected:
        raise RuntimeError("The public archive API returned no usable observations")
    # Keep previously stored observations if a temporary API failure omitted
    # an old date from this refresh. Update only dates actually returned.
    old_path = DATA / "thitruongcaphe_daily.csv"
    if old_path.exists():
        with old_path.open(encoding="utf-8") as f:
            for old in csv.DictReader(f):
                key = (old["province"], old["date"])
                collected.setdefault(key, float(old["price_vnd_kg"]))
    ordered = sorted(
        ((day, province, price) for (province, day), price in collected.items()),
        key=lambda row: (row[0], row[1]),
    )
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "thitruongcaphe_daily.csv"
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "province", "price_vnd_kg", "source_url", "method_url"])
        writer.writerows(
            (day, province, price, API_URL, METHOD_URL)
            for day, province, price in ordered
        )
    tmp.replace(path)
    dates = [row[0] for row in ordered]
    summary = {
        "source": "Thị Trường Cà Phê",
        "api_url": API_URL,
        "archive_url": ARCHIVE_URL,
        "methodology_url": METHOD_URL,
        "methodology": "Daily province references from multiple public sources; site describes median of active sources, not a single dealer quote.",
        "date_range_requested": [start.isoformat(), end.isoformat()],
        "archived_date_pages": len(archived),
        "first_observation": min(dates),
        "last_observation": max(dates),
        "record_count": len(ordered),
        "province_counts": {
            province: sum(1 for _, p, _ in ordered if p == province)
            for province in PROVINCES
        },
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
        "attribution": "Thị Trường Cà Phê — https://thitruongcaphe.vn",
        "license": "No explicit reuse license found; retain source attribution and use as an internal reference unless site terms state otherwise.",
    }
    (DATA / "thitruongcaphe_daily_meta.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return summary


if __name__ == "__main__":
    print(json.dumps(refresh(), ensure_ascii=False, indent=2))
