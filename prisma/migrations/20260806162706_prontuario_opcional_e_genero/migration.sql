-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMININO', 'MASCULINO', 'NAO_INFORMADO');

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "protocolNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'NAO_INFORMADO';
