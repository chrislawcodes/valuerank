-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "last_used" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "definitions" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "definition_tags" (
    "id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "definition_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "experiment_id" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL,
    "progress" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "retention_days" INTEGER,
    "archive_permanently" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "model_id" TEXT NOT NULL,
    "model_version" TEXT,
    "definition_snapshot" JSONB,
    "content" JSONB NOT NULL,
    "turn_count" INTEGER NOT NULL,
    "token_count" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_accessed_at" TIMESTAMP(3),
    "content_expires_at" TIMESTAMP(3),
    "decision_code" TEXT,
    "decision_text" TEXT,
    "summarized_at" TIMESTAMP(3),

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_scenario_selections" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_scenario_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "analysis_plan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_comparisons" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT,
    "baseline_run_id" TEXT NOT NULL,
    "comparison_run_id" TEXT NOT NULL,
    "delta_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "analysis_type" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "code_version" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'CURRENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "definitions_parent_id_idx" ON "definitions"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "definition_tags_definition_id_idx" ON "definition_tags"("definition_id");

-- CreateIndex
CREATE INDEX "definition_tags_tag_id_idx" ON "definition_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "definition_tags_definition_id_tag_id_key" ON "definition_tags"("definition_id", "tag_id");

-- CreateIndex
CREATE INDEX "runs_definition_id_idx" ON "runs"("definition_id");

-- CreateIndex
CREATE INDEX "runs_experiment_id_idx" ON "runs"("experiment_id");

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "transcripts_run_id_idx" ON "transcripts"("run_id");

-- CreateIndex
CREATE INDEX "transcripts_scenario_id_idx" ON "transcripts"("scenario_id");

-- CreateIndex
CREATE INDEX "transcripts_model_id_idx" ON "transcripts"("model_id");

-- CreateIndex
CREATE INDEX "scenarios_definition_id_idx" ON "scenarios"("definition_id");

-- CreateIndex
CREATE INDEX "run_scenario_selections_run_id_idx" ON "run_scenario_selections"("run_id");

-- CreateIndex
CREATE INDEX "run_scenario_selections_scenario_id_idx" ON "run_scenario_selections"("scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_scenario_selections_run_id_scenario_id_key" ON "run_scenario_selections"("run_id", "scenario_id");

-- CreateIndex
CREATE INDEX "run_comparisons_experiment_id_idx" ON "run_comparisons"("experiment_id");

-- CreateIndex
CREATE INDEX "run_comparisons_baseline_run_id_idx" ON "run_comparisons"("baseline_run_id");

-- CreateIndex
CREATE INDEX "run_comparisons_comparison_run_id_idx" ON "run_comparisons"("comparison_run_id");

-- CreateIndex
CREATE INDEX "analysis_results_run_id_idx" ON "analysis_results"("run_id");

-- CreateIndex
CREATE INDEX "analysis_results_analysis_type_idx" ON "analysis_results"("analysis_type");

-- CreateIndex
CREATE INDEX "analysis_results_status_idx" ON "analysis_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rubrics_version_key" ON "rubrics"("version");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definition_tags" ADD CONSTRAINT "definition_tags_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definition_tags" ADD CONSTRAINT "definition_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_scenario_selections" ADD CONSTRAINT "run_scenario_selections_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_scenario_selections" ADD CONSTRAINT "run_scenario_selections_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_comparisons" ADD CONSTRAINT "run_comparisons_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_comparisons" ADD CONSTRAINT "run_comparisons_baseline_run_id_fkey" FOREIGN KEY ("baseline_run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_comparisons" ADD CONSTRAINT "run_comparisons_comparison_run_id_fkey" FOREIGN KEY ("comparison_run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

