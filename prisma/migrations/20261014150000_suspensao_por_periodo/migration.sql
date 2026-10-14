-- Suspensão de atendimentos por período (férias/licença/afastamento)
--
-- Esta migration é ADITIVA: apenas cria uma tabela nova e acrescenta uma
-- coluna opcional. Nenhum dado existente é alterado ou removido.

-- 1) Coluna que liga um registro de prontuário ao período que o gerou.
--    É NULA para todos os registros já existentes.
ALTER TABLE "SessionRecord" ADD COLUMN "suspensionId" TEXT;

-- 2) Tabela do período de suspensão.
CREATE TABLE "SuspensionPeriod" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "clientId" TEXT,
    "psicoId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reasonEnc" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "SuspensionPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SuspensionPeriod_clientId_idx" ON "SuspensionPeriod"("clientId");
CREATE INDEX "SuspensionPeriod_psicoId_idx" ON "SuspensionPeriod"("psicoId");
CREATE INDEX "SuspensionPeriod_startDate_endDate_idx" ON "SuspensionPeriod"("startDate", "endDate");

ALTER TABLE "SuspensionPeriod" ADD CONSTRAINT "SuspensionPeriod_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SuspensionPeriod" ADD CONSTRAINT "SuspensionPeriod_psicoId_fkey"
    FOREIGN KEY ("psicoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SuspensionPeriod" ADD CONSTRAINT "SuspensionPeriod_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SuspensionPeriod" ADD CONSTRAINT "SuspensionPeriod_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_suspensionId_fkey"
    FOREIGN KEY ("suspensionId") REFERENCES "SuspensionPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
