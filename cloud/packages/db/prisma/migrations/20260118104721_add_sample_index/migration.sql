-- AlterTable: Add sample_index to transcripts
ALTER TABLE "transcripts" ADD COLUMN "sample_index" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Index on sample_index for transcripts
CREATE INDEX "transcripts_sample_index_idx" ON "transcripts"("sample_index");

-- AlterTable: Add sample_index to probe_results
ALTER TABLE "probe_results" ADD COLUMN "sample_index" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Index on sample_index for probe_results
CREATE INDEX "probe_results_sample_index_idx" ON "probe_results"("sample_index");

-- DropIndex: Drop old unique constraint
DROP INDEX "probe_results_run_id_scenario_id_model_id_key";

-- CreateIndex: New unique constraint including sample_index
CREATE UNIQUE INDEX "probe_results_run_id_scenario_id_model_id_sample_index_key" ON "probe_results"("run_id", "scenario_id", "model_id", "sample_index");
