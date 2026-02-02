-- AlterTable
ALTER TABLE "definitions" ADD COLUMN     "preamble_version_id" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "preambles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preambles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preamble_versions" (
    "id" TEXT NOT NULL,
    "preamble_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preamble_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preambles_name_key" ON "preambles"("name");

-- CreateIndex
CREATE INDEX "preamble_versions_preamble_id_idx" ON "preamble_versions"("preamble_id");

-- CreateIndex
CREATE INDEX "definitions_preamble_version_id_idx" ON "definitions"("preamble_version_id");

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_preamble_version_id_fkey" FOREIGN KEY ("preamble_version_id") REFERENCES "preamble_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preamble_versions" ADD CONSTRAINT "preamble_versions_preamble_id_fkey" FOREIGN KEY ("preamble_id") REFERENCES "preambles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
