-- AlterTable
ALTER TABLE "scenarios"
ADD COLUMN "orientation_flipped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "assumption_vignette_selections" (
    "id" TEXT NOT NULL,
    "assumption_key" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assumption_vignette_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assumption_scenario_pairs" (
    "id" TEXT NOT NULL,
    "assumption_key" TEXT NOT NULL,
    "source_scenario_id" TEXT NOT NULL,
    "variant_scenario_id" TEXT NOT NULL,
    "variant_type" TEXT NOT NULL,
    "equivalence_reviewed_by" TEXT,
    "equivalence_reviewed_at" TIMESTAMP(3),
    "equivalence_review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assumption_scenario_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assumption_vignette_selections_definition_id_idx" ON "assumption_vignette_selections"("definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "assumption_vignette_selections_assumption_key_definition_id_key"
ON "assumption_vignette_selections"("assumption_key", "definition_id");

-- CreateIndex
CREATE INDEX "assumption_scenario_pairs_assumption_key_idx" ON "assumption_scenario_pairs"("assumption_key");

-- CreateIndex
CREATE INDEX "assumption_scenario_pairs_source_scenario_id_idx" ON "assumption_scenario_pairs"("source_scenario_id");

-- CreateIndex
CREATE INDEX "assumption_scenario_pairs_variant_scenario_id_idx" ON "assumption_scenario_pairs"("variant_scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "assumption_scenario_pairs_key_pair_unique"
ON "assumption_scenario_pairs"("assumption_key", "source_scenario_id", "variant_scenario_id");

-- AddForeignKey
ALTER TABLE "assumption_vignette_selections"
ADD CONSTRAINT "assumption_vignette_selections_definition_id_fkey"
FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assumption_scenario_pairs"
ADD CONSTRAINT "assumption_scenario_pairs_source_scenario_id_fkey"
FOREIGN KEY ("source_scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assumption_scenario_pairs"
ADD CONSTRAINT "assumption_scenario_pairs_variant_scenario_id_fkey"
FOREIGN KEY ("variant_scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
