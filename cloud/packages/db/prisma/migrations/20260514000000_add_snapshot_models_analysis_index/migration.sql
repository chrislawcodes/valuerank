-- CreateIndex
CREATE INDEX "assumption_snapshots_models_analysis_idx" ON "assumption_analysis_snapshots"("assumption_key", "analysis_type", "status", "deleted_at", "config_signature");
