ALTER TABLE "probe_results"
ADD COLUMN "queued_at" TIMESTAMPTZ;

ALTER TABLE "transcripts"
ADD COLUMN "summarize_queued_at" TIMESTAMPTZ,
ADD COLUMN "summarize_duration_ms" INTEGER;
