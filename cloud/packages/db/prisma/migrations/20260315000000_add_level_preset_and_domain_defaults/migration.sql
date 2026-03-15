-- CreateTable: level_presets
CREATE TABLE "level_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: level_presets unique name
CREATE UNIQUE INDEX "level_presets_name_key" ON "level_presets"("name");

-- CreateTable: level_preset_versions
CREATE TABLE "level_preset_versions" (
    "id" TEXT NOT NULL,
    "level_preset_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "l1" TEXT NOT NULL,
    "l2" TEXT NOT NULL,
    "l3" TEXT NOT NULL,
    "l4" TEXT NOT NULL,
    "l5" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_preset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: FK index on level_preset_versions.level_preset_id
CREATE INDEX "level_preset_versions_level_preset_id_idx" ON "level_preset_versions"("level_preset_id");

-- AddForeignKey: level_preset_versions -> level_presets
ALTER TABLE "level_preset_versions" ADD CONSTRAINT "level_preset_versions_level_preset_id_fkey" FOREIGN KEY ("level_preset_id") REFERENCES "level_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add default_level_preset_version_id to domains
ALTER TABLE "domains" ADD COLUMN "default_level_preset_version_id" TEXT;

-- CreateIndex: FK index on domains.default_level_preset_version_id
CREATE INDEX "domains_default_level_preset_version_id_idx" ON "domains"("default_level_preset_version_id");

-- AddForeignKey: domains -> level_preset_versions
ALTER TABLE "domains" ADD CONSTRAINT "domains_default_level_preset_version_id_fkey" FOREIGN KEY ("default_level_preset_version_id") REFERENCES "level_preset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add level_preset_version_id to definitions
ALTER TABLE "definitions" ADD COLUMN "level_preset_version_id" TEXT;

-- CreateIndex: FK index on definitions.level_preset_version_id
CREATE INDEX "definitions_level_preset_version_id_idx" ON "definitions"("level_preset_version_id");

-- AddForeignKey: definitions -> level_preset_versions
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_level_preset_version_id_fkey" FOREIGN KEY ("level_preset_version_id") REFERENCES "level_preset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
