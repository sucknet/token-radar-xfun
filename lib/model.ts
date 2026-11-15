// lib/model.ts — the entry's typing surface. The scoring model itself lives in model-core.ts.

export {
  ageDays,
  parse,
  categoryWeight,
  CATEGORY_WEIGHTS,
  impliedValue,
  isPreToken,
  isRankable,
  medianTvl,
  MODEL,
  MODEL_VERSION,
  SnapshotError,
  type ModelConstants,
  type ScoreParts,
  type Snapshot,
  type SnapshotProtocol,
} from './model-core.ts';

export type { RadarData, RadarRow, LiveRow } from './radar-types.ts';
