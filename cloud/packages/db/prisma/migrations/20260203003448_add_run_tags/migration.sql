-- CreateTable
CREATE TABLE "run_tags" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_tags_run_id_idx" ON "run_tags"("run_id");

-- CreateIndex
CREATE INDEX "run_tags_tag_id_idx" ON "run_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_tags_run_id_tag_id_key" ON "run_tags"("run_id", "tag_id");

-- AddForeignKey
ALTER TABLE "run_tags" ADD CONSTRAINT "run_tags_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_tags" ADD CONSTRAINT "run_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
