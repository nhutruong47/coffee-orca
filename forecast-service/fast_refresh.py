"""Fast Real-Time Background Refresher for Coffee Forecast Dashboard.
Executes in 5-10 seconds.
1. Synchronizes farmgate prices for 4 Central Highland provinces (Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông)
2. Fetches national domestic quote and London Robusta overnight closing futures
3. Re-computes the Huber Lead-Lag directional forecast signal
4. Updates meta.json with real-time timestamps
"""
from __future__ import annotations

import csv
import json
import logging
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

REGIONS = {
    "dak-lak": "Đắk Lắk",
    "lam-dong": "Lâm Đồng",
    "gia-lai": "Gia Lai",
    "dak-nong": "Đắk Nông",
}

def _get(url: str, timeout: int = 12) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")

def sync_provinces() -> dict[str, dict]:
    """Fetch live province farmgate prices from Nong Dan Viet."""
    results = {}
    for slug, name in REGIONS.items():
        try:
            html_text = _get(f"https://nongdanviet.vn/gia-ca-phe/{slug}")
            matches = re.findall(
                r"<tr[^>]*>\s*<td[^>]*>(20\d{2}-\d{2}-\d{2})</td>\s*<td[^>]*>([\d.,]+)</td>",
                html_text,
                re.I,
            )
            prices = {}
            for dt, raw in matches:
                val = float(raw.replace(".", "").replace(",", ""))
                if 30_000 <= val <= 300_000:
                    prices[dt] = val
            
            if prices:
                csv_path = DATA / f"region_{slug}.csv"
                existing = {}
                if csv_path.exists():
                    with open(csv_path, encoding="utf-8") as f:
                        for r in csv.reader(f):
                            if len(r) >= 2 and r[0] != "date":
                                try:
                                    existing[r[0]] = float(r[1])
                                except ValueError:
                                    pass
                existing.update(prices)
                sorted_rows = sorted(existing.items())
                
                temp_csv = csv_path.with_suffix(".csv.tmp")
                with open(temp_csv, "w", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerow(["date", "value"])
                    for d, v in sorted_rows:
                        w.writerow([d, f"{v:.1f}"])
                temp_csv.replace(csv_path)
                
                latest_d = sorted_rows[-1][0]
                latest_p = sorted_rows[-1][1]
                results[slug] = {
                    "name": name,
                    "price": latest_p,
                    "date": latest_d,
                    "days": len(sorted_rows),
                    "source": f"nongdanviet.vn/gia-ca-phe/{slug}"
                }
        except Exception as e:
            logging.warning(f"Failed to sync province {slug}: {e}")
            
    # Also update regions.json if we got results
    if results:
        regions_json_path = DATA / "regions.json"
        try:
            old_regions = {}
            if regions_json_path.exists():
                with open(regions_json_path, encoding="utf-8") as f:
                    old_regions = json.load(f)
            old_regions.update(results)
            temp_r = regions_json_path.with_suffix(".json.tmp")
            with open(temp_r, "w", encoding="utf-8") as f:
                json.dump(old_regions, f, ensure_ascii=False, indent=2)
            temp_r.replace(regions_json_path)
        except Exception as e:
            logging.warning(f"Failed to update regions.json: {e}")
            
    return results

def sync_giacaphe_domestic_and_london() -> dict:
    """Extract today national price and ICE London Robusta contract from Giacaphe domestic page."""
    try:
        page = _get("https://giacaphe.com/gia-ca-phe-noi-dia/")
    except Exception as e:
        logging.warning(f"Failed to fetch Giacaphe page: {e}")
        return {}

    out = {}
    
    # 1. National price from title
    m_nat = re.search(r"cao nh\u1ea5t\s*([\d.,]+)\s*vn\u0111/kg", page, re.I)
    if not m_nat:
        m_nat = re.search(r"([\d.,]+)\s*(?:vn\u0111|\u0111)/kg", page, re.I)
    m_nat_date = re.search(r"ng\u00e0y\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", page, re.I)
    
    if m_nat and m_nat_date:
        d, m, y = m_nat_date.groups()
        nat_date = f"{y}-{int(m):02d}-{int(d):02d}"
        nat_price = float(m_nat.group(1).replace(".", "").replace(",", ""))
        if 30_000 <= nat_price <= 300_000:
            vn_dom_path = DATA / "vn_domestic.csv"
            existing_vn = {}
            if vn_dom_path.exists():
                with open(vn_dom_path, encoding="utf-8") as f:
                    for r in csv.reader(f):
                        if len(r) >= 2 and r[0] != "date":
                            try:
                                existing_vn[r[0]] = float(r[1])
                            except ValueError:
                                pass
            existing_vn[nat_date] = nat_price
            temp_vn = vn_dom_path.with_suffix(".csv.tmp")
            with open(temp_vn, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["date", "value"])
                for dt, pr in sorted(existing_vn.items()):
                    w.writerow([dt, f"{pr:.1f}"])
            temp_vn.replace(vn_dom_path)
            out["vn_national"] = {"date": nat_date, "price": nat_price}

    # 2. London Robusta contract
    idx = page.find("id=\"robusta-london\"")
    if idx >= 0:
        end_idx = page.find("</section>", idx)
        sec = page[idx:end_idx]
        
        m_date = re.search(r"Cập nhật:\s*(\d{1,2})/(\d{1,2})/(\d{4})", sec)
        m_price = re.search(r"class=[\'\"]gnd--price[\'\"][^>]*>([\d,.]+)<", sec)
        if not m_price:
            m_price = re.search(r"data-price=[\'\"]([\d,.]+)['\"]", sec)
            
        m_chg = re.search(r"class=[\'\"][^\'\"]*price_change[^\'\"]*[\'\"][^>]*>([+-]?[\d,.]+)<", sec)
        m_pct = re.search(r"class=[\'\"]pctchange[\'\"][^>]*>([+-]?[\d,.]+)%?<", sec)
        
        if m_date and m_price:
            day, mon, yr = m_date.groups()
            date_iso = f"{yr}-{int(mon):02d}-{int(day):02d}"
            price_val = float(m_price.group(1).replace(",", "").replace(".", ""))
            chg_val = float(m_chg.group(1).replace(",", "")) if m_chg else 0.0
            pct_val = float(m_pct.group(1)) if m_pct else 0.0
            
            # Save to london_robusta_daily.csv
            csv_path = DATA / "london_robusta_daily.csv"
            existing_lon = {}
            if csv_path.exists():
                with open(csv_path, encoding="utf-8") as f:
                    for r in csv.DictReader(f):
                        try:
                            existing_lon[r["date"]] = float(r["price_usd_ton"])
                        except (ValueError, KeyError):
                            pass
            existing_lon[date_iso] = price_val
            temp_lon = csv_path.with_suffix(".csv.tmp")
            with open(temp_lon, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["date", "price_usd_ton"])
                for d, val in sorted(existing_lon.items()):
                    w.writerow([d, f"{val:.1f}"])
            temp_lon.replace(csv_path)
            
            out["london"] = {
                "date": date_iso,
                "price_usd_ton": price_val,
                "change_usd": chg_val,
                "change_pct": pct_val
            }
            
    return out

def run_fast_refresh(force_model: bool = True) -> dict:
    """Perform real-time data sync and model execution in seconds."""
    start_time = time.time()
    
    # 1. Sync 4 provinces
    prov_res = sync_provinces()
    
    # 2. Sync domestic national and London futures
    gcp_res = sync_giacaphe_domestic_and_london()
    
    # 3. Sync daily_local
    import daily_local
    try:
        daily_local.refresh()
    except Exception as e:
        logging.warning(f"daily_local error: {e}")
        
    # 4. Run Lead-Lag forecast model
    import model_daklak_leadlag
    try:
        model_res = model_daklak_leadlag.run_backtest_and_forecast()
        live_sig = model_res.get("live_signal", {})
    except Exception as e:
        logging.exception(f"Lead-lag model error: {e}")
        live_sig = {}

    # 5. Update meta.json timestamp
    meta_path = DATA / "meta.json"
    meta = {}
    if meta_path.exists():
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    now_iso = datetime.now(timezone.utc).isoformat()
    now_vn = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%Y-%m-%d %H:%M:%S")
    meta["updated_at"] = now_iso
    meta["last_fast_refresh_utc"] = now_iso
    meta["last_fast_refresh_vn"] = now_vn
    meta["fast_refresh_status"] = "success"

    temp_meta = meta_path.with_suffix(".json.tmp")
    with open(temp_meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    temp_meta.replace(meta_path)

    elapsed = round(time.time() - start_time, 2)
    return {
        "ok": True,
        "elapsed_seconds": elapsed,
        "vn_time": now_vn,
        "provinces": prov_res,
        "national_and_london": gcp_res,
        "live_signal": live_sig
    }

if __name__ == "__main__":
    result = run_fast_refresh(force_model=True)
    print(json.dumps(result, indent=2, ensure_ascii=False))
