-- AlterTable
ALTER TABLE "llm_providers" ADD COLUMN "balance" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "provider_balance_sync_logs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "system_balance_at_sync" DECIMAL(10,4) NOT NULL,
    "entered_balance" DECIMAL(10,4) NOT NULL,
    "delta" DECIMAL(10,4) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,

    CONSTRAINT "provider_balance_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_balance_sync_logs_provider_id_idx" ON "provider_balance_sync_logs"("provider_id");

-- AddForeignKey
ALTER TABLE "provider_balance_sync_logs" ADD CONSTRAINT "provider_balance_sync_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_balance_sync_logs" ADD CONSTRAINT "provider_balance_sync_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
