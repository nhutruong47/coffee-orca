"""Download, verify, audit, and import VNCoffeePrice without merging sources."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATASET_ID = "p8fhcw59b7"
VERSION = 3
EXPECTED_SHA256 = "04c2be944c8b31b78beb180f78412be9967232e9c1ddb3083962c04274b4b7d2"
EXPECTED_FILENAME = "VNCoffeePrice_mendeley_package_ENv2.zip"
MAPPING = {
    "Dak Lak": "dak-lak",
    "Dak Nong": "dak-nong",
    "Gia Lai": "gia-lai",
    "Kon Tum": "kon-tum",
    "Lam Dong": "lam-dong",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CoffeeForecast/1.0; dataset-attribution)",
    "Accept": "application/vnd.mendeley-public-dataset.1+json",
    "Referer": f"https://data.mendeley.com/datasets/{DATASET_ID}/{VERSION}",
}


def request_json(url: str) -> object:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def fetch_package() -> tuple[dict, bytes, dict]:
    metadata = request_json(f"https://data.mendeley.com/public-api/datasets/{DATASET_ID}")
    if metadata.get("version") != VERSION:
        raise RuntimeError(f"Expected published version {VERSION}; metadata says {metadata.get('version')}")
    license_info = metadata.get("data_licence") or {}
    if license_info.get("short_name") != "CC BY 4.0":
        raise RuntimeError(f"Expected CC BY 4.0; received {license_info!r}")
    list_url = (
        f"https://data.mendeley.com/public-api/datasets/{DATASET_ID}/files"
        f"?folder_id=root&version={VERSION}&$start=0&$limit=1000"
    )
    files = request_json(list_url)
    file_info = next((item for item in files if item.get("filename") == EXPECTED_FILENAME), None)
    if file_info is None:
        raise RuntimeError(f"Expected source archive not present in published v{VERSION}")
    request = urllib.request.Request(file_info["content_details"]["download_url"], headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        package = response.read()
    actual_sha = hashlib.sha256(package).hexdigest()
    expected_sha = file_info["content_details"].get("sha256_hash")
    if actual_sha != expected_sha or actual_sha != EXPECTED_SHA256:
        raise RuntimeError(f"Source archive SHA256 mismatch: actual={actual_sha}, metadata={expected_sha}")
    return metadata, package, file_info


def decode_csv(package: zipfile.ZipFile, member: str) -> list[dict[str, str]]:
    with package.open(member) as stream:
        text = stream.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def get_coffee_rows(package: zipfile.ZipFile) -> list[dict]:
    prefix = "VNCoffeePrice_mendeley_package_EN_v5/raw_data/"
    rows = []
    collected_at = datetime.now(timezone.utc).isoformat()
    for split_name, filename in (
        ("train", "coffee_price_train.csv"),
        ("validation", "coffee_price_val.csv"),
        ("test", "coffee_price_test.csv"),
    ):
        for row in decode_csv(package, prefix + filename):
            raw_date = datetime.strptime(row["date"], "%d/%m/%Y").date().isoformat()
            province = row["province"].strip()
            if province not in MAPPING:
                raise ValueError(f"Unexpected province label: {province!r}")
            raw_price = float(row["price_vnd"])
            if not 0 < raw_price <= 300_000:
                raise ValueError(f"Out-of-range value {raw_price} on {raw_date} for {province}")
            price = raw_price
            quality = []
            if raw_price < 30_000:
                quality.append("below_30000_vnd_investigate_not_dropped")
            if not raw_price.is_integer():
                quality.append("fractional_source_value_preserved")
            rows.append({
                "date": raw_date,
                "province_slug": MAPPING[province],
                "province": province,
                "price_vnd_kg": price,
                "unit": "VND/kg",
                "product": row.get("commodity", ""),
                "source_id": "VNCoffeePrice Mendeley Data v3",
                "source_split": split_name,
                "source_url": f"https://data.mendeley.com/datasets/{DATASET_ID}/{VERSION}",
                "dataset_published_at": "2026-07-23T22:18:46.605Z",
                "source_published_at": "",
                "collected_at_utc": collected_at,
                "quality_flag": ";".join(quality),
                "coord_source": row.get("coord_source", ""),
                "latitude": row.get("lat", ""),
                "longitude": row.get("lon", ""),
            })
    return rows


def validate_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    issues = []
    ordered = sorted(rows, key=lambda row: (row["province_slug"], row["date"]))
    duplicates = Counter((row["province_slug"], row["date"]) for row in ordered)
    for (province, day), count in duplicates.items():
        if count > 1:
            issues.append({"type": "duplicate_province_date", "province": province, "date": day, "rows": count})
    for province in MAPPING.values():
        subset = [row for row in ordered if row["province_slug"] == province]
        if not subset:
            issues.append({"type": "missing_province", "province": province})
            continue
        dates = [date.fromisoformat(row["date"]) for row in subset]
        steps = [(b - a).days for a, b in zip(dates, dates[1:])]
        issues.append({
            "type": "province_quality_summary",
            "province": province,
            "rows": len(subset),
            "date_start": min(dates).isoformat(),
            "date_end": max(dates).isoformat(),
            "duplicate_dates": sum(count - 1 for (p, _), count in duplicates.items() if p == province),
            "observed_interval_days": dict(sorted(Counter(steps).items())),
            "missing_calendar_dates_not_filled": sum(max(0, step - 1) for step in steps),
            "price_min_vnd_kg": min(row["price_vnd_kg"] for row in subset),
            "price_max_vnd_kg": max(row["price_vnd_kg"] for row in subset),
            "fractional_source_values_preserved": sum("fractional_source_value_preserved" in row["quality_flag"] for row in subset),
            "below_30000_values_flagged_not_removed": sum("below_30000_vnd_investigate_not_dropped" in row["quality_flag"] for row in subset),
            "source_split_counts": dict(Counter(row["source_split"] for row in subset)),
        })
    return ordered, issues


def main() -> dict:
    DATA.mkdir(parents=True, exist_ok=True)
    metadata, archive, file_info = fetch_package()
    archive_path = DATA / EXPECTED_FILENAME
    archive_path.write_bytes(archive)
    zip_sha = hashlib.sha256(archive).hexdigest()
    if not archive_path.exists() or hashlib.sha256(archive_path.read_bytes()).hexdigest() != zip_sha:
        raise RuntimeError("Preserved archive copy failed checksum re-read")
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        bad_member = package.testzip()
        if bad_member is not None:
            raise RuntimeError(f"ZIP integrity check failed for member {bad_member}")
        members = package.namelist()
        rows, issues = validate_rows(get_coffee_rows(package))
        raw_csv = package.read("VNCoffeePrice_mendeley_package_EN_v5/vietnam_coffee_price_dataset.csv")
        processed_sha = hashlib.sha256(raw_csv).hexdigest()
        readme = package.read("VNCoffeePrice_mendeley_package_EN_v5/README.md").decode("utf-8", "replace")
        source_caveat_match = re.search(
            r"Provenance of the original domestic coffee price.*?(?=\n\s*\n|$)", readme, re.I | re.S
        )
        limitations_match = re.search(r"## Known limitations(.*?)(?=## )", readme, re.I | re.S)
        source_caveat = re.sub(r"\s+", " ", source_caveat_match.group(0)).strip() if source_caveat_match else None
        limitations = re.sub(r"\s+", " ", limitations_match.group(1)).strip() if limitations_match else None

    normalized_path = DATA / "vnc_official_dak_lak_daily.csv"
    fields = list(rows[0])
    with normalized_path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(row for row in rows if row["province_slug"] == "dak-lak")

    dak_rows = [row for row in rows if row["province_slug"] == "dak-lak"]
    report = {
        "dataset": "VNCoffeePrice: A Multi-Source Dataset for Robusta Coffee Price Forecasting in Vietnam",
        "dataset_url": f"https://data.mendeley.com/datasets/{DATASET_ID}/{VERSION}",
        "doi": f"10.17632/{DATASET_ID}.{VERSION}",
        "version": VERSION,
        "dataset_published_at": "2026-07-23T22:18:46.605Z",
        "target_observation_published_at": "Not supplied per historical quote; dataset-level publication time is not the original quote publication time.",
        "license": metadata.get("data_licence"),
        "attribution": "Nguyen Duc, Tan; Nguyen Chi, Hai. VNCoffeePrice, Mendeley Data, v3 (2026), DOI 10.17632/p8fhcw59b7.3, CC BY 4.0.",
        "archive_filename": file_info["filename"],
        "archive_bytes": len(archive),
        "archive_sha256": zip_sha,
        "archive_expected_sha256": EXPECTED_SHA256,
        "archive_sha256_verified": zip_sha == EXPECTED_SHA256,
        "archive_integrity_test": "passed",
        "processed_csv_member_sha256": processed_sha,
        "archive_members": members,
        "normalized_all_provinces_rows": len(rows),
        "normalized_dak_lak_rows": len(dak_rows),
        "dak_lak_date_start": min(row["date"] for row in dak_rows),
        "dak_lak_date_end": max(row["date"] for row in dak_rows),
        "dak_lak_split_counts": dict(Counter(row["source_split"] for row in dak_rows)),
        "dataset_reported_full_coverage": "2020-01-01 through 2026-05-22",
        "source_provenance_caveat_from_dataset_readme": source_caveat,
        "known_limitations_from_dataset_readme": limitations,
        "source_rows_provenance": "The packaged README identifies Investing.com for London/FX data; the provider/source trail for original domestic coffee prices and VN retail fuel before dataset deposit is not specified in the raw rows.",
        "assessment": "Downloaded and checksum verified. Original domestic price-provider/source provenance is explicitly stated as needing independent verification; data are retained as a separate research series and not merged with other local quotes.",
        "validation": issues,
        "collected_at_utc": datetime.now(timezone.utc).isoformat(),
        "output_csv": str(normalized_path.relative_to(ROOT)),
        "reuse_note": "Dataset license CC BY 4.0; raw source components may be third-party content and could require additional permissions. Check provenance before redistribution or production display.",
    }
    (DATA / "vnc_official_dak_lak_quality.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == "__main__":
    main()
