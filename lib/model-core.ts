// lib/model-core.ts — the radar's scoring model, v2 "liquidity-first with growth and maturity tilt".
//
// Five signals, all read from the snapshot's own figures, combined with stated weights:
//
//   participation  = tvl_usd / median(pre-token TVL field)  ^ PART_EXP   -> liquidity depth
//   growth         = clamp(change_7d, -60, 120)                            -> 7-day momentum
//   longevity      = 1 + min(age_days, 1095)/1095                          -> survivorship
//   focus          = 1.15 when the protocol runs on one chain, else 1.0     -> sharper community
//   category       = CATEGORY_WEIGHTS[sector]                              -> token-readiness
//
//   implied_value_usd = round(BASE x participation^PART_EXP x growthMult x longevity x focus x category)
//
// Deterministic and total: every protocol scores from its own record, and no name is special-cased.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_usd: number;
  part_exp: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_days: number;
  single_chain_bonus: number;
  unknown_age_mult: number;
}

export const MODEL: ModelConstants = {
  base_usd: 2_500_000,
  part_exp: 0.55,
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  maturity_days: 1095,
  single_chain_bonus: 0.15,
  unknown_age_mult: 1.0,
};

export const MODEL_VERSION = 'radar-v2-liquidity';

/** How token-ready a sector behaves, from how its peers have launched historically. */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  'dexes': 1.30,
  'liquid staking': 1.10,
  'lending': 1.25,
  'cdp': 1.20,
  'yield aggregator': 1.15,
  'derivatives': 1.20,
  'perpetuals': 1.20,
  'bridge': 1.05,
  'cross chain': 1.05,
  'options': 1.10,
  'insurance': 1.00,
  'prediction': 1.05,
  'rwa': 1.15,
  'restaking': 1.10,
  'launchpad': 1.10,
  'nft marketplace': 0.95,
  'gaming': 0.90,
  'memes': 0.85,
  'wallets': 0.95,
  'privacy': 1.05,
  'oracle': 1.20,
  'infrastructure': 1.05,
  'analytics': 0.95,
  'explorer': 0.90,
};

/** Sector weight with a stated default: unknown sectors score 1.0, never a penalty. */
export function categoryWeight(category: string | null): number {
  if (!category) return 1.0;
  const c = category.toLowerCase().trim();
  for (const key of Object.keys(CATEGORY_WEIGHTS)) {
    if (c.includes(key)) return CATEGORY_WEIGHTS[key]!;
  }
  return 1.0;
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export interface ScoreParts {
  implied: number;
  participation: number;
  growthPct: number;
  growthMult: number;
  longevity: number;
  focus: number;
  categoryMult: number;
  age: number | null;
}

/** The five signals and the implied value one protocol gets under `model` and `medianTvl`. */
export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants, medianTvl: number): ScoreParts {
  const age = ageDays(asOf, p.listed_at);
  const participation = medianTvl > 0 ? p.tvl_usd / medianTvl : p.tvl_usd / 1_000_000;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const longevity = age === null ? model.unknown_age_mult : 1 + Math.min(age, model.maturity_days) / model.maturity_days;
  const focus = p.chains.length <= 1 ? 1 + model.single_chain_bonus : 1.0;
  const categoryMult = categoryWeight(p.category);
  const implied = Math.max(1, Math.round(model.base_usd * Math.pow(participation, model.part_exp) * growthMult * longevity * focus * categoryMult));
  return { implied, participation, growthPct, growthMult, longevity, focus, categoryMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Median TVL of a field of protocols (the participation denominator). */
export function medianTvl(protocols: SnapshotProtocol[]): number {
  const tvls = protocols.map((p) => p.tvl_usd).sort((a, b) => a - b);
  if (tvls.length === 0) return 1_000_000;
  const mid = Math.floor(tvls.length / 2);
  return tvls.length % 2 === 1 ? tvls[mid]! : Math.round((tvls[mid - 1]! + tvls[mid]!) / 2);
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parse(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i): SnapshotProtocol => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}
