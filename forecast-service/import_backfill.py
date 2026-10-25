"""Nhap lich su gia VN tu data/backfill_vn.csv vao cac chuoi gia dang dung.

- page 'national'  -> data/vn_domestic.csv
- page <slug>      -> data/region_<slug>.csv

Nguyen tac: gia da co san (cao truc tiep hom nay) luon duoc giu, backfill chi
bo sung nhung ngay con thieu. Chay lai nhieu lan khong sao (idempotent).

Chay:  python import_backfill.py
"""
import os
import sys
import csv

sys.stdout.reconfigure(encoding="utf-8", errors="ignore")

from fetch_data import DATA_DIR, load_csv, save_csv

BACKFILL = os.path.join(DATA_DIR, "backfill_vn.csv")
SLUGS = ("dak-lak", "lam-dong", "gia-lai", "dak-nong")


def read_backfill():
    by_page = {}
    if not os.path.exists(BACKFILL):
        return by_page
    with open(BACKFILL, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                d = row["date"]
                v = float(row["price"])
            except Exception:
                continue
            if not d or not (3000 <= v <= 500000):
                continue
            by_page.setdefault(row["page"], {})[d] = v
    return by_page


def merge(path, additions):
    existing = {}
    if os.path.exists(path):
        for d, v in load_csv(path):
            existing[d] = v
    added = 0
    for d, v in additions.items():
        if d not in existing:
            existing[d] = v
            added += 1
    rows = sorted(existing.items())
    save_csv(path, rows)
    return added, len(rows)


def main():
    pages = read_backfill()
    if not pages:
        print("chua co data/backfill_vn.csv")
        return
    total = 0
    for page, additions in pages.items():
        name = "vn_domestic" if page == "national" else f"region_{page}"
        if page not in ("national",) and page not in SLUGS:
            continue
        path = os.path.join(DATA_DIR, f"{name}.csv")
        added, size = merge(path, additions)
        total += added
        print(f"  {name:22s} +{added:4d} ngay moi -> tong {size} ngay")
    print(f"Tong cong them {total} ngay lich su.")


if __name__ == "__main__":
    main()
