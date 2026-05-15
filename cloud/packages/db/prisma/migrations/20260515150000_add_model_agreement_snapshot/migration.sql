CREATE TABLE "model_agreement_snapshots" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "domain_ids_hash" CHAR(32) NOT NULL,
    "model_ids_hash" CHAR(32) NOT NULL,
    "domain_ids" TEXT[] NOT NULL,
    "model_ids" TEXT[] NOT NULL,
    "agreement_result_json" JSONB NOT NULL,
    "source_run_count" INTEGER NOT NULL,
    "source_run_updated_at_sum" BIGINT NOT NULL,
    "algorithm_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_agreement_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_agreement_snapshots_scope_signature_domain_ids_hash_model_ids_hash_key" ON "model_agreement_snapshots"("scope", "signature", "domain_ids_hash", "model_ids_hash");
CREATE INDEX "model_agreement_snapshots_scope_signature_idx" ON "model_agreement_snapshots"("scope", "signature");
