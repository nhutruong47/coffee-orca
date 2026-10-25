"""Scheduled data refresh and model training for the coffee dashboard."""
import logging

import daily_local
import fetch_giacaphe_history
import fetch_tmc_history
import backtest_dak_lak_sources
import model_daklak_leadlag
import official_robusta_daily
import backtest_official_daily
import fetch_data
import gold
import import_backfill
import model
import model_gold
import model_robusta

logging.basicConfig(level=logging.INFO)
try:
    logging.info("Refreshing public provincial source snapshots")
    print(daily_local.refresh())
    print(fetch_tmc_history.refresh())
    try:
        print(fetch_giacaphe_history.refresh())
    except Exception:
        logging.exception("Giacaphe history refresh failed; preserving existing snapshots")
except Exception:
    logging.exception("Provincial data collection failed; continuing with other sources")

try:
    print(backtest_dak_lak_sources.run())
    print(model_daklak_leadlag.run_backtest_and_forecast())
except Exception:
    logging.exception("Dak Lak source comparison failed; continuing with other sources")

try:
    logging.info("Refreshing national daily Robusta reference and walk-forward report")
    print(official_robusta_daily.fetch())
    print(backtest_official_daily.run(refresh=False))
except Exception:
    logging.exception("National daily Robusta refresh/backtest failed; continuing with other sources")

fetch_data.update_all()
model.run(verbose=False)
import_backfill.main()
model_robusta.run(verbose=False)
gold.update_gold()
model_gold.run(verbose=False)
