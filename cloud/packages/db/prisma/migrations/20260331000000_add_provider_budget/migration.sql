-- CreateEnum
CREATE TYPE "ProviderBudgetEventType" AS ENUM ('MANUAL_SET', 'DEDUCTION', 'SYNC');

-- AlterTable: add budget fields to llm_providers
ALTER TABLE "llm_providers"
  ADD COLUMN "balance" DECIMAL(12,2),
  ADD COLUMN "last_synced_at" TIMESTAMP(3),
  ADD COLUMN "last_synced_balance" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "provider_budget_events" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "type" "ProviderBudgetEventType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "drift" DECIMAL(12,2),
    "run_id" TEXT,
    "provider_balance_before" DECIMAL(12,2),
    "provider_balance_after" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_budget_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_budget_events_provider_id_idx" ON "provider_budget_events"("provider_id");

-- CreateIndex
CREATE INDEX "provider_budget_events_run_id_idx" ON "provider_budget_events"("run_id");

-- AddForeignKey
ALTER TABLE "provider_budget_events" ADD CONSTRAINT "provider_budget_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_budget_events" ADD CONSTRAINT "provider_budget_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
