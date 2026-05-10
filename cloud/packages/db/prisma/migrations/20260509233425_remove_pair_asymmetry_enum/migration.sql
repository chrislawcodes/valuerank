-- Wave 5 of paired-batch removal: drop the PAIR_ASYMMETRY anomaly enum value.
--
-- Step 1: delete historical PAIR_ASYMMETRY anomaly rows. The detector was
-- removed in Wave 3; no new rows are created. The remaining rows are noisy
-- historical artifacts from when the detector fired on >0% delta.
-- Pre-flight production count: 2 rows (captured 2026-05-09).
DELETE FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY';

-- Step 2: remove the enum value.
-- Postgres doesn't support DROP VALUE directly; use the standard
-- "create new enum, swap, drop old" pattern.
ALTER TYPE "RunAnomalyType" RENAME TO "RunAnomalyType_old";

CREATE TYPE "RunAnomalyType" AS ENUM (
  'STRANDED_TRANSCRIPT',
  'ORPHAN_TRANSCRIPT',
  'SUMMARIZING_STALL',
  'MODEL_TRANSCRIPT_SHORTFALL',
  'SCHEDULED_COUNT_MISMATCH',
  'INVALID_RESPONSE_FAILURE'
);

ALTER TABLE run_anomalies
  ALTER COLUMN type TYPE "RunAnomalyType" USING type::text::"RunAnomalyType";

DROP TYPE "RunAnomalyType_old";
