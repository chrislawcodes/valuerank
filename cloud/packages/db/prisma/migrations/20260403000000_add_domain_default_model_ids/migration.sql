-- AlterTable
ALTER TABLE "domains" ADD COLUMN "default_model_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
