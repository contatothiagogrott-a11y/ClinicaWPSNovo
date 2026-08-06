-- AlterEnum
ALTER TYPE "ClientStatus" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "cancellationReasonEnc" TEXT;
