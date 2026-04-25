-- Backstop the application-level advisory lock added in PR #585
-- (commit 465eccc4, 2026-04-10) that prevents concurrent probe-scenario jobs
-- from inserting duplicate transcripts for the same logical slot
-- (run_id, scenario_id, model_id, sample_index).
--
-- Predicate breakdown:
--   deleted_at IS NULL       -- soft-deleted rows can re-occupy a slot (intended)
--   scenario_id IS NOT NULL  -- Postgres treats NULL as distinct, so a plain
--                               unique index would not catch NULL-scenario dupes
--   created_at >= '2026-04-10' -- the day the upstream race fix landed; rows
--                                 before that timestamp may be legitimate
--                                 historical duplicates retained as bonus
--                                 samples for analysis.
--
-- This index was applied manually to production via CREATE INDEX CONCURRENTLY
-- before this migration was merged, to avoid the brief write lock that an
-- inline CREATE INDEX would impose. Prisma 5.7 wraps every migration in an
-- implicit transaction, and CONCURRENTLY cannot run inside a transaction --
-- so this migration uses IF NOT EXISTS as a tracking-only no-op on the
-- production deploy. On test / dev databases that have not been pre-built,
-- it falls through to a regular CREATE UNIQUE INDEX (acceptable: small data,
-- not a hot table in those environments).

CREATE UNIQUE INDEX IF NOT EXISTS "transcripts_live_slot_unique"
ON "transcripts" ("run_id", "scenario_id", "model_id", "sample_index")
WHERE "deleted_at" IS NULL
  AND "scenario_id" IS NOT NULL
  AND "created_at" >= '2026-04-10 00:00:00+00';

COMMENT ON INDEX "transcripts_live_slot_unique" IS
  'Prevents future duplicate transcripts per logical probe slot. Backstops the advisory lock added in PR #585 (commit 465eccc4, 2026-04-10). Date floor matches the day the upstream race was closed; rows before that timestamp may have legitimate historical duplicates that we keep as bonus samples for analysis. NULL scenario_id is excluded because Postgres treats NULLs as distinct under unique indexes.';
