-- CreateEnum
CREATE TYPE "RunCategory" AS ENUM ('PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION', 'UNKNOWN_LEGACY');

-- AlterTable
ALTER TABLE "runs"
ADD COLUMN "run_category" "RunCategory" NOT NULL DEFAULT 'UNKNOWN_LEGACY';

-- CreateIndex
CREATE INDEX "runs_run_category_idx" ON "runs"("run_category");
