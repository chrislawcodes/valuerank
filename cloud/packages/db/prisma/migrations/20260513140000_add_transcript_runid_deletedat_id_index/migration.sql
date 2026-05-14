-- CreateIndex
CREATE INDEX "transcripts_run_id_deleted_at_id_idx" ON "transcripts"("run_id", "deleted_at", "id");
