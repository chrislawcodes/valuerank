-- Backfill run_category for aggregate rollup runs that were created with the
-- schema default (UNKNOWN_LEGACY). The aggregate-run workflow at
-- apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts now sets
-- runCategory = PRODUCTION at create time; this fixes existing rows.
--
-- These rows are first-class production rollups: each has isAggregate = true
-- and a sourceRunIds list pointing at the runs it summarizes. They never had
-- transcripts of their own (by design) so progress stays NULL.
UPDATE "runs"
SET "run_category" = 'PRODUCTION'
WHERE "deleted_at" IS NULL
  AND "run_category" = 'UNKNOWN_LEGACY'
  AND ("config"->>'isAggregate')::boolean = TRUE;
