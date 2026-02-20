-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "definitions" ADD COLUMN "domain_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "domains_normalized_name_key" ON "domains"("normalized_name");

-- CreateIndex
CREATE INDEX "definitions_domain_id_idx" ON "definitions"("domain_id");

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
