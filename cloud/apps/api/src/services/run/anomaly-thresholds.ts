export const SUMMARIZING_STALL_MINUTES = 30;
export const MODEL_SHORTFALL_MIN_PROBES = 10;
// Kept non-zero per adversarial review: this is the ONLY branch that detects
// the "every model fails equally" (systemic) case. Without an absolute floor,
// the detector misses runs where every model is broken at the same time — the
// exact Mistral-style failure this anomaly exists to catch.
export const MODEL_SHORTFALL_ABSOLUTE_RATE = 0.30;
export const MODEL_SHORTFALL_RELATIVE_RATE = 0;
export const MODEL_SHORTFALL_PEER_RATE = 0;
export const ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS = 60;
export const ORPHAN_RECONSTRUCTION_CAP_PER_TICK = 500;
export const RECENT_COMPLETED_RUN_WINDOW_DAYS = 30;
