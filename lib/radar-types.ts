// lib/radar-types.ts — the dashboard's view types.

import type { ModelConstants } from './model-core.ts';

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  participation: number;
  growth_pct: number;
  growth_multiplier: number;
  longevity_multiplier: number;
  focus_multiplier: number;
  category_multiplier: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  median_tvl: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  watch_covered: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}
