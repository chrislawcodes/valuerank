-- CreateEnum
CREATE TYPE "AssumptionAnalysisStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "assumption_analysis_snapshots" (
    "id" TEXT NOT NULL,
    "assumption_key" TEXT NOT NULL,
    "analysis_type" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "code_version" TEXT NOT NULL,
    "config_signature" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "status" "AssumptionAnalysisStatus" NOT NULL DEFAULT 'CURRENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assumption_analysis_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_assumption_key_idx" ON "assumption_analysis_snapshots"("assumption_key");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_analysis_type_idx" ON "assumption_analysis_snapshots"("analysis_type");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_input_hash_idx" ON "assumption_analysis_snapshots"("input_hash");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_config_signature_idx" ON "assumption_analysis_snapshots"("config_signature");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_status_idx" ON "assumption_analysis_snapshots"("status");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_deleted_at_idx" ON "assumption_analysis_snapshots"("deleted_at");

-- CreateIndex
CREATE INDEX "assumption_analysis_snapshots_assumption_key_analysis_type_inp_idx" ON "assumption_analysis_snapshots"("assumption_key", "analysis_type", "input_hash", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assumption_analysis_snapshots_current_config_signature_key" ON "assumption_analysis_snapshots"("assumption_key", "analysis_type", "config_signature") WHERE "status" = 'CURRENT' AND "deleted_at" IS NULL;
