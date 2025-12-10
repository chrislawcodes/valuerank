-- CreateTable
CREATE TABLE "model_token_statistics" (
    "id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "definition_id" TEXT,
    "avg_input_tokens" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "avg_output_tokens" DECIMAL(10,2) NOT NULL DEFAULT 900,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_token_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_token_statistics_model_id_idx" ON "model_token_statistics"("model_id");

-- CreateIndex
CREATE INDEX "model_token_statistics_definition_id_idx" ON "model_token_statistics"("definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_token_statistics_model_id_definition_id_key" ON "model_token_statistics"("model_id", "definition_id");

-- AddForeignKey
ALTER TABLE "model_token_statistics" ADD CONSTRAINT "model_token_statistics_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "llm_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_token_statistics" ADD CONSTRAINT "model_token_statistics_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
