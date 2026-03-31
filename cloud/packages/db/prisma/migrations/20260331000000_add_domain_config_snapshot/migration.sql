-- CreateTable
CREATE TABLE "value_statement_versions" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "value_statement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_config_snapshots" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "preamble_version_id" TEXT,
    "level_preset_version_id" TEXT,
    "context_id" TEXT,
    "value_statement_version_ids" TEXT[] NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_config_snapshots_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "runs" ADD COLUMN "domain_config_snapshot_id" TEXT;

-- CreateIndex
CREATE INDEX "value_statement_versions_statement_id_created_at_idx" ON "value_statement_versions"("statement_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "domain_config_snapshots_domain_id_fingerprint_key" ON "domain_config_snapshots"("domain_id", "fingerprint");

-- CreateIndex
CREATE INDEX "domain_config_snapshots_domain_id_created_at_idx" ON "domain_config_snapshots"("domain_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "runs_domain_config_snapshot_id_idx" ON "runs"("domain_config_snapshot_id");

-- AddForeignKey
ALTER TABLE "value_statement_versions" ADD CONSTRAINT "value_statement_versions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "value_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_preamble_version_id_fkey" FOREIGN KEY ("preamble_version_id") REFERENCES "preamble_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_level_preset_version_id_fkey" FOREIGN KEY ("level_preset_version_id") REFERENCES "level_preset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_config_snapshots" ADD CONSTRAINT "domain_config_snapshots_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "domain_contexts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_domain_config_snapshot_id_fkey" FOREIGN KEY ("domain_config_snapshot_id") REFERENCES "domain_config_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: create initial versions from existing value statement body content
INSERT INTO value_statement_versions (id, statement_id, content, created_at)
SELECT gen_random_uuid(), id, COALESCE(body, ''), COALESCE(updated_at, created_at)
FROM value_statements;
