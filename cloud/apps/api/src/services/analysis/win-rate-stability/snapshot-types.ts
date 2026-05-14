import type { ModelsStabilityResultShape } from '../../../graphql/types/models-stability.js';

export const WIN_RATE_STABILITY_SNAPSHOT_TYPE = 'win_rate_stability';
export const WIN_RATE_STABILITY_SNAPSHOT_CODE_VERSION = '1.0.0';
export const WIN_RATE_STABILITY_ASSUMPTION_PREFIX = 'win-rate-stability';
// Sentinel used in the snapshot config_signature column when the request did
// not pin a signature. Mirrors DOMAIN_ANALYSIS_NONE_SIGNATURE.
export const WIN_RATE_STABILITY_NONE_SIGNATURE = '__none__';

export type WinRateStabilityCacheStatus = 'FRESH' | 'UPDATING' | 'OUT_OF_DATE';

// The shape persisted in assumption_analysis_snapshots.output. cacheStatus and
// generatedAt are set at read time, not stored, so they are excluded here.
export type WinRateStabilitySnapshotOutput = Pick<
  ModelsStabilityResultShape,
  'models' | 'skippedVignettes'
>;
