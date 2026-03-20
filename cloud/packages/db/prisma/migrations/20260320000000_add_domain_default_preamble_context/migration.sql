-- Add default preamble version and default context to domains
ALTER TABLE "domains" ADD COLUMN "default_preamble_version_id" TEXT;
ALTER TABLE "domains" ADD COLUMN "default_context_id" TEXT;

-- Foreign key constraints
ALTER TABLE "domains" ADD CONSTRAINT "domains_default_preamble_version_id_fkey"
  FOREIGN KEY ("default_preamble_version_id") REFERENCES "preamble_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "domains" ADD CONSTRAINT "domains_default_context_id_fkey"
  FOREIGN KEY ("default_context_id") REFERENCES "domain_contexts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "domains_default_preamble_version_id_idx" ON "domains"("default_preamble_version_id");
CREATE INDEX "domains_default_context_id_idx" ON "domains"("default_context_id");
