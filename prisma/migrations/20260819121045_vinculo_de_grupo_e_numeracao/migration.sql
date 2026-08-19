-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "exitOutcome" TEXT,
ADD COLUMN     "exitReason" TEXT,
ADD COLUMN     "exitedAt" TIMESTAMP(3),
ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SessionRecord" ADD COLUMN     "groupSessionNumber" INTEGER;

-- CreateIndex
CREATE INDEX "GroupMember_groupId_exitedAt_idx" ON "GroupMember"("groupId", "exitedAt");
