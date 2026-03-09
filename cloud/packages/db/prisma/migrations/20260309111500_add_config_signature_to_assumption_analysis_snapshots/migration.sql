ALTER TABLE "assumption_analysis_snapshots"
ADD COLUMN "config_signature" TEXT NOT NULL DEFAULT '';

UPDATE "assumption_analysis_snapshots"
SET "config_signature" = md5("config"::text)
WHERE "config_signature" = '';

CREATE INDEX "assumption_analysis_snapshots_config_signature_idx"
ON "assumption_analysis_snapshots"("config_signature");

CREATE UNIQUE INDEX "assumption_analysis_snapshots_current_config_signature_key"
ON "assumption_analysis_snapshots"("assumption_key", "analysis_type", "config_signature")
WHERE "status" = 'CURRENT' AND "deleted_at" IS NULL;
