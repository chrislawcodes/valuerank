-- AlterTable
ALTER TABLE "definitions" ADD COLUMN     "domain_context_id" TEXT;

-- CreateTable
CREATE TABLE "domain_contexts" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_statements" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "value_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "value_statements_token_key" ON "value_statements"("token");

-- CreateIndex
CREATE INDEX "definitions_domain_context_id_idx" ON "definitions"("domain_context_id");

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_domain_context_id_fkey" FOREIGN KEY ("domain_context_id") REFERENCES "domain_contexts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_contexts" ADD CONSTRAINT "domain_contexts_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

