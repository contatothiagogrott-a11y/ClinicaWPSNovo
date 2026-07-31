-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "alescEntryDate" TIMESTAMP(3),
ADD COLUMN     "diagnosisEnc" TEXT,
ADD COLUMN     "extension" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewNotes" TEXT;

-- CreateIndex
CREATE INDEX "Client_needsReview_idx" ON "Client"("needsReview");

-- CreateIndex
CREATE INDEX "Client_importBatchId_idx" ON "Client"("importBatchId");
