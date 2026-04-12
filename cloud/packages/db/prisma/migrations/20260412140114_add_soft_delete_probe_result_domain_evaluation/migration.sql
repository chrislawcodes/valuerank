-- AlterTable: Add soft delete to ProbeResult
ALTER TABLE "probe_results" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable: Add soft delete to DomainEvaluation
ALTER TABLE "domain_evaluations" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable: Add soft delete to DomainEvaluationRun
ALTER TABLE "domain_evaluation_runs" ADD COLUMN "deleted_at" TIMESTAMP(3);
