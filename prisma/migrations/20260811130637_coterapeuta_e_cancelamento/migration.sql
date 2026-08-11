-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "coPsychologistId" TEXT;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_coPsychologistId_fkey" FOREIGN KEY ("coPsychologistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
