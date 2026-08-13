/*
  Warnings:

  - A unique constraint covering the columns `[protocolNumber]` on the table `Group` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "protocolNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Group_protocolNumber_key" ON "Group"("protocolNumber");
