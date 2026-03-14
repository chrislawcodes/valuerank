-- AlterTable: add domain_id column (NOT NULL is safe — value_statements table is empty in production)
ALTER TABLE "value_statements" ADD COLUMN "domain_id" TEXT NOT NULL;

-- DropIndex: remove old token-only unique constraint
DROP INDEX "value_statements_token_key";

-- CreateIndex: composite unique (domainId, token)
CREATE UNIQUE INDEX "value_statements_domain_id_token_key" ON "value_statements"("domain_id", "token");

-- CreateIndex: FK index on domain_id
CREATE INDEX "value_statements_domain_id_idx" ON "value_statements"("domain_id");

-- AddForeignKey
ALTER TABLE "value_statements" ADD CONSTRAINT "value_statements_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
