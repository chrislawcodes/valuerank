-- CreateEnum
CREATE TYPE "DomainEvaluationScopeCategory" AS ENUM ('PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION');

-- CreateEnum
CREATE TYPE "DomainEvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "domain_evaluations" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "domain_name_at_launch" TEXT NOT NULL,
    "scope_category" "DomainEvaluationScopeCategory" NOT NULL,
    "status" "DomainEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "config_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,

    CONSTRAINT "domain_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_evaluation_runs" (
    "id" TEXT NOT NULL,
    "domain_evaluation_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "definition_id_at_launch" TEXT NOT NULL,
    "definition_name_at_launch" TEXT NOT NULL,
    "domain_id_at_launch" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_evaluations_domain_id_idx" ON "domain_evaluations"("domain_id");

-- CreateIndex
CREATE INDEX "domain_evaluations_scope_category_idx" ON "domain_evaluations"("scope_category");

-- CreateIndex
CREATE INDEX "domain_evaluations_status_idx" ON "domain_evaluations"("status");

-- CreateIndex
CREATE INDEX "domain_evaluations_created_by_user_id_idx" ON "domain_evaluations"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_evaluation_runs_run_id_key" ON "domain_evaluation_runs"("run_id");

-- CreateIndex
CREATE INDEX "domain_evaluation_runs_domain_evaluation_id_idx" ON "domain_evaluation_runs"("domain_evaluation_id");

-- CreateIndex
CREATE INDEX "domain_evaluation_runs_definition_id_at_launch_idx" ON "domain_evaluation_runs"("definition_id_at_launch");

-- CreateIndex
CREATE INDEX "domain_evaluation_runs_domain_id_at_launch_idx" ON "domain_evaluation_runs"("domain_id_at_launch");

-- AddForeignKey
ALTER TABLE "domain_evaluations"
ADD CONSTRAINT "domain_evaluations_domain_id_fkey"
FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_evaluations"
ADD CONSTRAINT "domain_evaluations_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_evaluation_runs"
ADD CONSTRAINT "domain_evaluation_runs_domain_evaluation_id_fkey"
FOREIGN KEY ("domain_evaluation_id") REFERENCES "domain_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_evaluation_runs"
ADD CONSTRAINT "domain_evaluation_runs_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
