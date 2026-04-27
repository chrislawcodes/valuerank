-- CreateEnum
CREATE TYPE "RunAnomalyType" AS ENUM (
    'STRANDED_TRANSCRIPT',
    'ORPHAN_TRANSCRIPT',
    'PAIR_ASYMMETRY',
    'SUMMARIZING_STALL',
    'MODEL_TRANSCRIPT_SHORTFALL',
    'SCHEDULED_COUNT_MISMATCH'
);

-- AlterTable
ALTER TABLE "transcripts" ADD COLUMN "summarize_failed_at" TIMESTAMP(3);
ALTER TABLE "transcripts" ADD COLUMN "cost_debited_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "run_anomalies" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "type" "RunAnomalyType" NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "details" JSONB NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "acknowledged_by_user_id" TEXT,

    CONSTRAINT "run_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_anomalies_run_id_type_subject_key" ON "run_anomalies"("run_id", "type", "subject");
CREATE INDEX "run_anomalies_run_id_idx" ON "run_anomalies"("run_id");
CREATE INDEX "run_anomalies_type_resolved_at_idx" ON "run_anomalies"("type", "resolved_at");
CREATE INDEX "probe_results_run_id_status_idx" ON "probe_results"("run_id", "status");
CREATE INDEX "transcripts_run_id_summarized_at_idx" ON "transcripts"("run_id", "summarized_at");
CREATE INDEX "transcripts_unsummarized_idx" ON "transcripts"("run_id")
WHERE
    "deleted_at" IS NULL
    AND "summarized_at" IS NULL
    AND "summarize_failed_at" IS NULL;

-- AddForeignKey
ALTER TABLE "run_anomalies"
ADD CONSTRAINT "run_anomalies_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill historical summarize failures.
-- Predicate widened per adversarial review (2026-04-23): the old pattern
-- `decision_text LIKE 'Summary failed%'` depended on a text convention that
-- may have drifted historically. `decision_metadata IS NULL AND summarized_at
-- IS NOT NULL` is the structural signature of a terminal failure (every
-- success path writes a non-null decisionMetadata). Anything matching that
-- signature is a failure that was written before the summarize_failed_at
-- column existed. `summarize_failed_at IS NULL` ensures idempotency.
UPDATE "transcripts"
SET "summarize_failed_at" = "summarized_at",
    "summarized_at" = NULL
WHERE "decision_metadata" IS NULL
  AND "summarized_at" IS NOT NULL
  AND "summarize_failed_at" IS NULL
  AND "deleted_at" IS NULL;
