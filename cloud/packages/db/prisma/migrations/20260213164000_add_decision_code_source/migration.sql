-- Add source tracking for transcript decision codes.
ALTER TABLE "transcripts"
ADD COLUMN "decision_code_source" TEXT;

-- Backfill historical rows as deterministic where a decision already exists.
UPDATE "transcripts"
SET "decision_code_source" = 'deterministic'
WHERE "decision_code" IS NOT NULL
  AND "decision_code_source" IS NULL;
