-- CreateTable: value_statement_versions
CREATE TABLE "value_statement_versions" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "value_statement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: domain_config_snapshots
CREATE TABLE "domain_config_snapshots" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "preamble_version_id" TEXT,
    "level_preset_version_id" TEXT,
    "context_id" TEXT,
    "value_statement_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_config_snapshots_pkey" PRIMARY KEY ("id")
);

-- AddColumn: runs.domain_config_snapshot_id
ALTER TABLE "runs" ADD COLUMN "domain_config_snapshot_id" TEXT;

-- CreateIndex: value_statement_versions unique (statement_id, version_number)
CREATE UNIQUE INDEX "value_statement_versions_statement_id_version_number_key" ON "value_statement_versions"("statement_id", "version_number");

-- CreateIndex: value_statement_versions statement_id
CREATE INDEX "value_statement_versions_statement_id_idx" ON "value_statement_versions"("statement_id");

-- CreateIndex: domain_config_snapshots fingerprint unique
CREATE UNIQUE INDEX "domain_config_snapshots_fingerprint_key" ON "domain_config_snapshots"("fingerprint");

-- CreateIndex: domain_config_snapshots (domain_id, created_at DESC)
CREATE INDEX "domain_config_snapshots_domain_id_created_at_idx" ON "domain_config_snapshots"("domain_id", "created_at" DESC);

-- CreateIndex: runs domain_config_snapshot_id
CREATE INDEX "runs_domain_config_snapshot_id_idx" ON "runs"("domain_config_snapshot_id");

-- AddForeignKey: value_statement_versions -> value_statements
ALTER TABLE "value_statement_versions" ADD CONSTRAINT "value_statement_versions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "value_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: domain_config_snapshots -> domains
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: domain_config_snapshots -> preamble_versions (nullable)
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_preamble_version_id_fkey" FOREIGN KEY ("preamble_version_id") REFERENCES "preamble_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: domain_config_snapshots -> level_preset_versions (nullable)
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_level_preset_version_id_fkey" FOREIGN KEY ("level_preset_version_id") REFERENCES "level_preset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: domain_config_snapshots -> domain_contexts (nullable)
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "domain_contexts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: runs -> domain_config_snapshots (nullable)
ALTER TABLE "runs" ADD CONSTRAINT "runs_domain_config_snapshot_id_fkey" FOREIGN KEY ("domain_config_snapshot_id") REFERENCES "domain_config_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: create version 1 for all existing value statements
-- Uses gen_random_uuid() for unique IDs (consistent with cuid's uniqueness guarantee)
INSERT INTO "value_statement_versions" ("id", "statement_id", "body", "version_number", "created_at")
SELECT
    gen_random_uuid()::TEXT,
    "id",
    "body",
    1,
    "created_at"
FROM "value_statements";
