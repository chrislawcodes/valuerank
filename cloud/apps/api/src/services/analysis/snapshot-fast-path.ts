// Shared fast-path gate for assumption-analysis snapshot reads.
//
// The snapshot caches skip the expensive aggregation compute, but every read
// still re-derives the input hash to confirm the snapshot is still valid — and
// that re-derivation (`prepare*`) is itself several DB round-trips (~2-5s).
//
// The warming crons re-validate every snapshot hourly and stamp
// `lastValidatedAt`. When a snapshot was confirmed valid recently AND was built
// by the current code version, a read can trust it and skip re-validation
// entirely. The tradeoff: a data change is served stale (as FRESH) until the
// next warm rebuilds the snapshot — bounded by the TTL below.

// 6 hours: the warming crons run hourly and the slow-path FRESH branch also
// stamps lastValidatedAt, so any visit (or hourly warm) re-stamps the snapshot.
// A wide TTL lets infrequent visitors (e.g. once per workday) still fast-path
// across long idle periods. Worst-case staleness is still bounded by the
// hourly warm — the TTL only matters if the cron stops running entirely.
//
// Disabled (0) under NODE_ENV=test so integration tests keep exercising the
// full validation path — otherwise a test that mutates data and re-queries
// would be served the stale cached snapshot.
export const SNAPSHOT_FAST_PATH_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 6 * 60 * 60 * 1000;

export function canFastPathSnapshot(
  snapshot: { lastValidatedAt: Date | null; codeVersion: string },
  expectedCodeVersion: string,
  ttlMs: number = SNAPSHOT_FAST_PATH_TTL_MS,
): boolean {
  if (ttlMs <= 0) return false;
  // A code-version bump changes the input hash for every scope; the old
  // snapshot is stale by definition until the warm cron rebuilds it.
  if (snapshot.codeVersion !== expectedCodeVersion) return false;
  if (snapshot.lastValidatedAt == null) return false;
  return Date.now() - snapshot.lastValidatedAt.getTime() < ttlMs;
}
