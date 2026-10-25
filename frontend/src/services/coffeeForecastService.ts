import axios from 'axios';

export const FORECAST_API_URL = import.meta.env.VITE_FORECAST_API_URL || 'http://localhost:8002';

export interface ForecastMetrics {
  dates?: string[];
  prices?: number[];
  forecast_dates?: string[];
  forecast_prices?: number[];
  r2?: number;
  mae?: number;
  mape?: number;
  direction_accuracy?: number;
}

export interface RegionPrice {
  name: string;
  slug: string;
  price: number;
  change: number;
  updated_at: string;
}

export interface ForecastState {
  metrics?: {
    latest_price?: number;
    latest_date?: string;
    forecast?: {
      dates?: string[];
      prices?: number[];
      lower_bounds?: number[];
      upper_bounds?: number[];
    };
    backtest_metrics?: {
      r2?: number;
      mae?: number;
      mape?: number;
      direction_accuracy?: number;
    };
  };
  robusta?: any;
  gold?: any;
  sources?: any;
  meta?: any;
  history?: {
    dates: string[];
    prices: number[];
  };
  vn?: {
    price_vnd_kg?: number;
    date?: string;
    change_vnd?: number;
  };
  regions?: Record<string, RegionPrice>;
  local_forecast?: any;
  dak_lak_source_comparison?: any;
  realtime?: {
    last_refresh_vn?: string;
    last_refresh_utc?: string;
    status?: string;
    interval_minutes?: number;
  };
  daklak_leadlag?: any;
  busy?: boolean;
  last_error?: string | null;
}

export const coffeeForecastService = {
  getState: async (): Promise<ForecastState> => {
    const res = await axios.get(`${FORECAST_API_URL}/api/state`, { timeout: 10000 });
    return res.data;
  },

  getDakLakForecast: async (): Promise<any> => {
    const res = await axios.get(`${FORECAST_API_URL}/api/dak-lak/forecast`, { timeout: 10000 });
    return res.data;
  },

  refreshData: async (): Promise<any> => {
    const res = await axios.post(`${FORECAST_API_URL}/api/refresh`, {}, { timeout: 30000 });
    return res.data;
  }
};
