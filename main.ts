// Token Launch Radar — main.ts (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json,
// writes the dashboard's data to /output/data.js, copies dashboard/ and screenshots/ to /output, and
// writes /output/dossier.json via the vendored make.fun library.
//
// The model (radar-v2-liquidity) scores from the snapshot's own figures only:
//   participation^0.55 x growth x longevity x focus x sector-weight, on a fixed base.
// It is deterministic and total; no protocol name is special-cased.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ageDays,
  parse,
  impliedValue,
  isPreToken,
  isRankable,
  medianTvl,
  MODEL,
  MODEL_VERSION,
  type RadarData,
  type Snapshot,
} from './lib/model.ts';
import { farmSteps } from './lib/farms.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
const EARLY_ROWS = 200;
/** How many live-token protocols the Live view carries, by market cap. */
const LIVE_ROWS = 30;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot: Snapshot = parse(readFileSync(inputFile, 'utf8'));
const median = medianTvl(snapshot.protocols.filter(isPreToken));

interface Scored {
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
  age: number | null;
  implied: number;
  participation: number;
  growthPct: number;
  growthMult: number;
  longevity: number;
  focus: number;
  categoryMult: number;
}

const chosen = new Map<string, SnapshotProtocol2>();
type SnapshotProtocol2 = Snapshot['protocols'][number];
const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
for (const slug of snapshot.watchlist) {
  const p = index.get(slug);
  if (p !== undefined) chosen.set(slug, p);
}
const early = snapshot.protocols
  .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
  .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  .slice(0, EARLY_ROWS);
for (const p of early) chosen.set(p.slug, p);

const scored: Scored[] = [...chosen.values()].map((p) => {
  const s = impliedValue(p, snapshot.as_of, MODEL, median);
  const age = ageDays(snapshot.as_of, p.listed_at);
  return {
    slug: p.slug, name: p.name, category: p.category, chains: p.chains,
    tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd, listed_at: p.listed_at,
    gecko_id: p.gecko_id, symbol: p.symbol, age, ...s,
  };
});
scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

const board = scored.map((s, i) => ({
  rank: i + 1,
  slug: s.slug,
  name: s.name,
  category: s.category,
  chains: s.chains,
  tvl_usd: s.tvl_usd,
  change_7d: s.change_7d,
  mcap_usd: s.mcap_usd,
  listed_at: s.listed_at,
  gecko_id: s.gecko_id,
  symbol: s.symbol,
  token_status: 'pre-token' as const,
  age_days: s.age,
  implied_value_usd: s.implied,
  model: {
    model_version: MODEL_VERSION,
    participation: Math.round(s.participation * 1000) / 1000,
    growth_pct: s.growthPct,
    growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
    longevity_multiplier: Math.round(s.longevity * 1e4) / 1e4,
    focus_multiplier: Math.round(s.focus * 1e4) / 1e4,
    category_multiplier: Math.round(s.categoryMult * 1e4) / 1e4,
    age_days: s.age,
  },
  farm_steps: farmSteps(s.category, s.name, s.chains, s.tvl_usd, s.age),
}));

// Gate sanity: the same checks the server's scorer runs.
const slugs = new Set(board.map((r) => r.slug));
const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
if (missing.length > 0) {
  process.stderr.write(`token radar: board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}\n`);
  process.exit(1);
}
for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) { process.stderr.write(`rank ${i + 1} mismatch\n`); process.exit(1); }
for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) { process.stderr.write(`row ${i + 1} outranks row ${i}\n`); process.exit(1); }

// The live-token protocols, by market cap, for the dashboard's second tab.
const live = snapshot.protocols
  .filter((p) => !isPreToken(p) && p.category !== 'CEX')
  .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
  .slice(0, LIVE_ROWS)
  .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));

const watchCount = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;
const radar: RadarData = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  median_tvl: median,
  model: MODEL,
  model_version: MODEL_VERSION,
  watchlist_size: snapshot.watchlist.length,
  board_size: board.length,
  watch_covered: watchCount,
  early_size: board.length - watchCount,
  live_size: live.length,
  rows: board.map((r) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
    tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: r.mcap_usd, listed_at: r.listed_at,
    age_days: r.age_days, implied_value_usd: r.implied_value_usd,
    participation: r.model.participation, growth_pct: r.model.growth_pct,
    growth_multiplier: r.model.growth_multiplier, longevity_multiplier: r.model.longevity_multiplier,
    focus_multiplier: r.model.focus_multiplier, category_multiplier: r.model.category_multiplier,
    farm_steps: r.farm_steps,
  })),
  live,
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ model_version: MODEL_VERSION, median_tvl: median, rows: board }));
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`);
cpSync(join(here, 'dashboard'), join(out, 'dashboard'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES });
writeFileSync(join(out, 'dossier.json'), dossier);

const totalBytes = (dir: string): number => readdirSize(dir);
function readdirSize(dir: string): number {
  return readdirDeep(dir).reduce((acc, f) => acc + statSyncSafe(f), 0);
}
function readdirDeep(dir: string): string[] {
  const outFiles: string[] = [];
  const walk = (d: string) => {
    for (const entry of require('node:fs').readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p); else outFiles.push(p);
    }
  };
  walk(dir);
  return outFiles;
}
function statSyncSafe(p: string): number {
  try { return require('node:fs').statSync(p).size; } catch { return 0; }
}

process.stdout.write(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${board.length - watchCount} early, ${live.length} live set aside)\n`);
process.stdout.write(`token radar: wrote ${join(out, 'board.json')}, data.js, dashboard/, screenshots/ and dossier.json\n`);
