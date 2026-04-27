-- CreateEnum
CREATE TYPE "RunAnomalySource" AS ENUM ('default', 'audit');

-- AlterTable
ALTER TABLE "run_anomalies"
ADD COLUMN "source" "RunAnomalySource" NOT NULL DEFAULT 'default';

-- DropIndex
DROP INDEX "run_anomalies_run_id_type_subject_key";

-- CreateIndex
CREATE UNIQUE INDEX "run_anomalies_run_id_type_subject_source_key" ON "run_anomalies"("run_id", "type", "subject", "source");
