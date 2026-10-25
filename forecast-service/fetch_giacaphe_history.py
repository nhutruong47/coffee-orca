"""Collect date-verified provincial price snapshots from Giacaphe's public archive."""
from __future__ import annotations

import csv
import hashlib
import html
import json
import re
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
INDEX_URL = "https://giacaphe.com/gia-ca-phe-noi-dia/"
ARCHIVE_BASE = "https://giacaphe.com/gia-ca-phe-noi-dia-ngay-"
USER_AGENT = "Mozilla/5.0 (compatible; CoffeeForecast/1.0; archive-attributed-research)"
PROVINCES = {"dak-lak", "lam-dong", "gia-lai", "dak-nong"}
PROVINCE_NAMES = {
    "dak-lak": "Đắk Lắk",
    "lam-dong": "Lâm Đồng",
    "gia-lai": "Gia Lai",
    "dak-nong": "Đắk Nông",
}
MIN_EXPECTED_OBSERVATION = date(2010, 1, 1)
REQUEST_DELAY_SECONDS = 0.6


def get_text(url: str, attempts: int = 4) -> tuple[str, str]:
    last_error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=35) as response:
                return response.read().decode("utf-8", errors="replace"), response.geturl()
        except Exception as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to fetch {url}: {last_error!r}") from last_error


def clean_markup(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]*>", " ", value)).replace("\xa0", " ").strip()


def page_dates(index_html: str) -> list[str]:
    urls = set(re.findall(
        r"https?://giacaphe\.com/gia-ca-phe-noi-dia-ngay-(20\d{2}-\d{2}-\d{2})/",
        index_html,
        re.I,
    ))
    today_vn = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    dates = []
    for value in urls:
        try:
            parsed_day = date.fromisoformat(value)
            if MIN_EXPECTED_OBSERVATION <= parsed_day <= today_vn:
                dates.append(value)
        except ValueError:
            continue
    return sorted(set(dates))


def parse_archive(day: str, document: str, final_url: str, fetched_at: str) -> list[dict]:
    if not re.search(r"hai sàn cà phê thế giới", document, re.I) or not re.search(r"khảo sát liên tục", document, re.I):
        return []
    expected_url = f"{ARCHIVE_BASE}{day}/"
    canonical_match = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', document, re.I
    )
    canonical = canonical_match.group(1) if canonical_match else final_url
    parsed = urlparse(canonical)
    if parsed.netloc.lower() != "giacaphe.com" or not parsed.path.rstrip("/").endswith(day):
        return []

    heading_match = re.search(r"<h1[^>]*>(.*?)</h1>", document, re.I | re.S)
    heading = clean_markup(heading_match.group(1)) if heading_match else ""
    heading_date = re.search(r"(\d{2})/(\d{2})/(20\d{2})", heading)
    if not heading_date:
        return []
    verified_day = f"{heading_date.group(3)}-{heading_date.group(2)}-{heading_date.group(1)}"
    if verified_day != day:
        return []

    table_start = document.find('<div id="gia-noi-dia"')
    if table_start < 0:
        return []
    table_end = document.find('<div id="robusta-london"', table_start)
    table_html = document[table_start:table_end if table_end >= 0 else table_start + 20_000]
    row_matches = re.findall(
        r"<tr[^>]*>\s*<td>\s*<a href=[\"']https?://giacaphe\.com/gia-ca-phe-([^/]+)/[\"'][^>]*>(.*?)</a>\s*</td>\s*<td><span class=[\"']([^\"']+)[\"']",
        table_html,
        re.I | re.S,
    )
    css_values = {
        class_name: value.replace(",", "")
        for class_name, value in re.findall(
            r"\.([A-Za-z0-9_-]+)::after\s*\{\s*content:\s*[\"']([\d,]+)[\"']",
            document,
            re.I,
        )
    }
    article_modified = re.search(
        r'<meta[^>]+property=["\']article:modified_time["\'][^>]+content=["\']([^"\']+)',
        document,
        re.I,
    )
    page_sha256 = hashlib.sha256(document.encode("utf-8")).hexdigest()
    records = []
    for slug, _label_html, class_list in row_matches:
        if slug not in PROVINCES:
            continue
        raw_price = css_values.get(class_list.split()[0])
        if raw_price is None:
            continue
        price = float(raw_price)
        if not 0 < price <= 300_000:
            continue
        value_sha256 = hashlib.sha256(f"{day}|{slug}|{price:.0f}".encode()).hexdigest()
        quality_flag = "date_verified; reference_quote; reuse_license_unverified"
        if price < 30_000:
            quality_flag += ";below_30000_vnd_investigate_not_dropped"
        records.append({
            "date": day,
            "province_slug": slug,
            "province": PROVINCE_NAMES[slug],
            "price_vnd_kg": price,
            "unit": "VND/kg",
            "product": "Robusta nhân xô tham chiếu theo tỉnh",
            "quote_type": "published_provincial_reference",
            "source_url": expected_url,
            "canonical_url": canonical,
            "page_heading": heading,
            "source_published_at": "",
            "page_modified_at": article_modified.group(1) if article_modified else "",
            "page_modified_at_is_not_source_published_at": "true",
            "collected_at_utc": fetched_at,
            "page_sha256": page_sha256,
            "value_sha256": value_sha256,
            "quality_flag": quality_flag,
            "source_method": "Giacaphe/Y5Cafe states listed prices combine prices of two global coffee exchanges with ongoing surveys from businesses and buying agents in key growing areas; it warns listed prices may differ from local purchase prices and are for reference, not a specific dealer transaction quote.",
            "reuse_status": "Public page; automated reuse/public-display license not verified.",
        })
    return records


def refresh() -> dict:
    fetched_at = datetime.now(timezone.utc).isoformat()
    index_html, _ = get_text(INDEX_URL)
    days = page_dates(index_html)
    if not days:
        raise RuntimeError("No dated Giacaphe archive links found on the domestic-price page")

    raw_path = DATA / "giacaphe_dak_lak_daily_raw.csv"
    normalized_path = DATA / "giacaphe_dak_lak_daily.csv"
    raw_backup = raw_path.read_bytes() if raw_path.exists() else None
    normalized_backup = normalized_path.read_bytes() if normalized_path.exists() else None
    existing_raw: list[dict] = []
    if raw_path.exists():
        with raw_path.open(encoding="utf-8", newline="") as source_file:
            existing_raw = list(csv.DictReader(source_file))
    seen_values = set()
    for row in existing_raw:
        value_hash = row.get("value_sha256")
        if not value_hash and row.get("date") and row.get("province_slug") and row.get("price_vnd_kg"):
            value_hash = hashlib.sha256(
                f"{row['date']}|{row['province_slug']}|{float(row['price_vnd_kg']):.0f}".encode()
            ).hexdigest()
        seen_values.add((row.get("date"), row.get("province_slug"), value_hash))

    errors = []
    valid_dates = set()
    collection_failed = False
    for index, day in enumerate(days):
        if index:
            time.sleep(REQUEST_DELAY_SECONDS)
        try:
            document, final_url = get_text(f"{ARCHIVE_BASE}{day}/")
            records = parse_archive(day, document, final_url, fetched_at)
            if not records:
                errors.append({"date": day, "error": "date/method/table verification returned no rows"})
                continue
            valid_dates.add(day)
            for record in records:
                key = (record["date"], record["province_slug"], record["value_sha256"])
                if key not in seen_values:
                    existing_raw.append(record)
                    seen_values.add(key)
        except Exception as exc:
            collection_failed = True
            errors.append({"date": day, "error": repr(exc)[:240]})

    if not valid_dates or collection_failed:
        if raw_backup is not None:
            raw_path.write_bytes(raw_backup)
        if normalized_backup is not None:
            normalized_path.write_bytes(normalized_backup)
        reason = "One or more archive fetches failed; existing snapshots preserved" if collection_failed else "No archive rows passed date/method/value validation; existing snapshots preserved"
        raise RuntimeError(reason)

    metadata_path = DATA / "giacaphe_dak_lak_daily_meta.json"
    previous_meta = metadata_path.read_text(encoding="utf-8") if metadata_path.exists() else None
    def restore_prior_artifacts() -> None:
        if raw_backup is not None:
            raw_path.write_bytes(raw_backup)
        if normalized_backup is not None:
            normalized_path.write_bytes(normalized_backup)
        if previous_meta is not None:
            metadata_path.write_text(previous_meta, encoding="utf-8")
        elif metadata_path.exists():
            metadata_path.unlink()

    try:
        if existing_raw:
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            fieldnames = list(dict.fromkeys(key for row in existing_raw for key in row))
            with raw_path.open("w", newline="", encoding="utf-8") as target_file:
                writer = csv.DictWriter(target_file, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(existing_raw)

        latest: dict[tuple[str, str], dict] = {}
        for record in existing_raw:
            key = (record["date"], record["province_slug"])
            if key not in latest or record.get("collected_at_utc", "") >= latest[key].get("collected_at_utc", ""):
                latest[key] = record
        normalized = sorted(latest.values(), key=lambda row: (row["date"], row["province_slug"]))
        normalized_path = DATA / "giacaphe_dak_lak_daily.csv"
        if normalized:
            normalized_fields = list(dict.fromkeys(key for row in normalized for key in row))
            with normalized_path.open("w", newline="", encoding="utf-8") as target_file:
                writer = csv.DictWriter(target_file, fieldnames=normalized_fields)
                writer.writeheader()
                writer.writerows(normalized)

        summary = {
            "source": "Giacaphe.com / Y5Cafe",
            "source_page_check_date_vn": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat(),
            "latest_verified_observation_date": max((row["date"] for row in normalized), default=None),
            "index_url": INDEX_URL,
            "archive_base": ARCHIVE_BASE,
            "methodology_note": "Giacaphe/Y5Cafe states domestic references combine prices of two global coffee exchanges with ongoing surveys from businesses and buying agents in key growing areas; it warns quoted prices may not match local buying prices. Daily provincial rows are accepted only when the canonical URL and page H1 identify the same date.",
            "published_at_policy": "No per-observation publication timestamp was verified. Article modified_time is stored separately and is not treated as published_at.",
            "date_links_found": len(days),
            "verified_archive_dates_this_run": sorted(valid_dates),
            "all_date_links_require_fetch_each_run": True,
            "raw_snapshots": len(existing_raw),
            "normalized_records": len(normalized),
            "new_archive_dates_without_verified_rows": sorted(set(days) - valid_dates),
            "quality_reported_error_count": len(errors),
            "quality_reported_errors": errors,
            "latest_observation_date": max((row["date"] for row in normalized), default=None),
            "data_quality": {
                "missing_calendar_days_within_each_province": {
                    slug: max(0, (date.fromisoformat(next((row["date"] for row in reversed(normalized) if row["province_slug"] == slug), "1970-01-01")) - date.fromisoformat(next((row["date"] for row in normalized if row["province_slug"] == slug), "1970-01-01"))).days + 1 - sum(row["province_slug"] == slug for row in normalized))
                    for slug in sorted(PROVINCES)
                },
                "out_of_range_rows_retained_flagged": sum("below_30000_vnd_investigate_not_dropped" in row.get("quality_flag", "") for row in normalized),
                "source_published_at_missing_rows": sum(not row.get("source_published_at") for row in normalized),
            },
            "normalized_rows_by_province": {
                slug: sum(row["province_slug"] == slug for row in normalized)
                for slug in sorted(PROVINCES)
            },
            "normalized_date_ranges_by_province": {
                slug: {
                    "start": next((row["date"] for row in normalized if row["province_slug"] == slug), None),
                    "end": next((row["date"] for row in reversed(normalized) if row["province_slug"] == slug), None),
                }
                for slug in sorted(PROVINCES)
            },
            "latest_prices_by_province": {
                slug: next((row["price_vnd_kg"] for row in reversed(normalized) if row["province_slug"] == slug), None)
                for slug in sorted(PROVINCES)
            },
            "attribution": "Giacaphe.com / Y5Cafe",
            "reuse_status": "Public pages fetched for project research; explicit automated reuse/public-display license was not found. Confirm terms or permission before distributing copied historical prices.",
            "fetched_at_utc": fetched_at,
            "errors": errors,
        }
        (DATA / "giacaphe_dak_lak_daily_meta.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return summary
    except Exception:
        restore_prior_artifacts()
        raise


if __name__ == "__main__":
    print(json.dumps(refresh(), ensure_ascii=False, indent=2))
