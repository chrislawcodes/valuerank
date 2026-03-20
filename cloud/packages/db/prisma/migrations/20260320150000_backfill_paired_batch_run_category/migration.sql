-- Backfill legacy run-category values for methodology-safe paired batches.
UPDATE "runs"
SET "run_category" = 'PRODUCTION'
WHERE "deleted_at" IS NULL
  AND "run_category" = 'UNKNOWN_LEGACY'
  AND "config"->>'jobChoiceLaunchMode' = 'PAIRED_BATCH';
