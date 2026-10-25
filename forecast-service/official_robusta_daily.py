"""Fetch the public MARD-attributed daily Vietnam Robusta benchmark."""
from __future__ import annotations

import csv
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SERIES_ID = 31267
API_URL = f"https://dulieukinhte.com/api/internal/data/series?ids={SERIES_ID}"
SOURCE_URL = f"https://dulieukinhte.com/du-lieu-dong/gia-ca-phe-robusta-{SERIES_ID}"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
REFERER = SOURCE_URL


def fetch() -> dict:
    req = urllib.request.Request(
        API_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CoffeeForecast/1.0)",
            "Accept": "application/json",
            "Referer": REFERER,
        },
    )
    with urllib.request.urlopen(req, timeout=40) as response:
        payload = json.load(response)
    if not isinstance(payload, list) or len(payload) != 1:
        raise ValueError("Unexpected public series response shape")
    series = payload[0]
    if series.get("id") != SERIES_ID or "đồng/kg" not in series.get("unit", ""):
        raise ValueError("Series ID/unit mismatch; refusing to store this data")
    values: dict[str, float] = {}
    for timestamp_ms, raw_price in series.get("data", []):
        local = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc) + timedelta(hours=7)
        observation_date = local.date().isoformat()
        price = float(raw_price)
        if 30_000 <= price <= 300_000:
            values[observation_date] = price
    if len(values) < 500:
        raise ValueError(f"Unexpectedly short series ({len(values)} observations)")
    rows = sorted(values.items())
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "vn_robusta_daily_official.csv"
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "price_vnd_kg", "source_url", "license_url"])
        writer.writerows((day, price, SOURCE_URL, LICENSE_URL) for day, price in rows)
    tmp.replace(path)
    info = {
        "series_id": SERIES_ID,
        "series_name": series.get("name"),
        "unit": series.get("unit"),
        "count": len(rows),
        "first_date": rows[0][0],
        "last_date": rows[-1][0],
        "latest_price_vnd_kg": rows[-1][1],
        "source_url": SOURCE_URL,
        "source_credit": "Trung tâm Thông tin (Bộ NN&MT); accessed via Dữ Liệu Kinh Tế series API",
        "license_url": LICENSE_URL,
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (DATA / "vn_robusta_daily_official_meta.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return info


if __name__ == "__main__":
    print(json.dumps(fetch(), ensure_ascii=False, indent=2))
