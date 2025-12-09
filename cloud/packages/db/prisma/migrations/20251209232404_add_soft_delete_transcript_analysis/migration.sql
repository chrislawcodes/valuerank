-- AlterTable
ALTER TABLE "analysis_results" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transcripts" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "analysis_results_deleted_at_idx" ON "analysis_results"("deleted_at");

-- CreateIndex
CREATE INDEX "transcripts_deleted_at_idx" ON "transcripts"("deleted_at");
