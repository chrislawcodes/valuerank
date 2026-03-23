-- Add stalled models tracking to runs
ALTER TABLE "runs"
ADD COLUMN "stalled_models" TEXT[] NOT NULL DEFAULT '{}';
