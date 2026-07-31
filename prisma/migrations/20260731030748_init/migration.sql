-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERVISOR', 'ADMIN', 'PSICO');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('FILA_ESPERA', 'TRIAGEM', 'TRIADOS', 'EM_ATENDIMENTO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ConfigType" AS ENUM ('AFFILIATION', 'ALLOCATION', 'ROOM', 'TAG');

-- CreateEnum
CREATE TYPE "ClinicalDocumentType" AS ENUM ('ANAMNESE_RISCO', 'URGENCIA', 'ATESTADO');

-- CreateEnum
CREATE TYPE "HistoryCategory" AS ENUM ('CADASTRO', 'CLINICO', 'DOCUMENTO', 'TRANSFERENCIA', 'FLUXO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "InstrumentLogType" AS ENUM ('CONSUMPTION', 'ADJUSTMENT', 'INITIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PSICO',
    "title" TEXT,
    "institutionalLink" TEXT,
    "birthDate" TIMESTAMP(3),
    "matricula" TEXT,
    "crp" TEXT,
    "color" TEXT,
    "capacity" JSONB,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastPasswordChangeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "protocolNumber" TEXT NOT NULL,
    "signedAgreement" BOOLEAN NOT NULL DEFAULT false,
    "fullNameEnc" TEXT NOT NULL,
    "whatsappEnc" TEXT NOT NULL,
    "birthDateEnc" TEXT NOT NULL,
    "emergencyContactNameEnc" TEXT NOT NULL,
    "emergencyContactPhoneEnc" TEXT NOT NULL,
    "emergencyContactRelationshipEnc" TEXT NOT NULL DEFAULT '',
    "residenceCityNeighborhoodEnc" TEXT NOT NULL DEFAULT '',
    "helpRequestEnc" TEXT NOT NULL DEFAULT '',
    "medicationsEnc" TEXT NOT NULL DEFAULT '',
    "contactObservationsEnc" TEXT NOT NULL DEFAULT '',
    "registrationCode" TEXT NOT NULL,
    "affiliation" TEXT NOT NULL,
    "allocation" TEXT NOT NULL,
    "dependencyType" TEXT,
    "dependencySponsor" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dateIncluded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClientStatus" NOT NULL DEFAULT 'FILA_ESPERA',
    "priority" "Priority",
    "assignedPsicoId" TEXT,
    "maxSessions" INTEGER NOT NULL DEFAULT 0,
    "completedSessions" INTEGER NOT NULL DEFAULT 0,
    "defaultRoom" TEXT,
    "defaultTime" TEXT,
    "sector" TEXT,
    "workShift" TEXT,
    "whatsappAuthorized" BOOLEAN,
    "previouslyAttended" BOOLEAN,
    "contactMadeByName" TEXT,
    "contactDate" TIMESTAMP(3),
    "contactStatus" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "disposedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" "HistoryCategory" NOT NULL DEFAULT 'CADASTRO',
    "detailsEnc" TEXT,

    CONSTRAINT "HistoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "clientId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "ipHash" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "psicoId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notesEnc" TEXT NOT NULL DEFAULT '',
    "privateNotesEnc" TEXT NOT NULL DEFAULT '',
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT,
    "groupId" TEXT,
    "appointmentId" TEXT,
    "attendance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordVersion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "oldContentEnc" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "methodology" TEXT,
    "frequency" TEXT,
    "criteria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "psychologistId" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","clientId")
);

-- CreateTable
CREATE TABLE "GroupRecord" (
    "id" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GroupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAttendance" (
    "id" TEXT NOT NULL,
    "groupRecordId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "GroupAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigItem" (
    "id" TEXT NOT NULL,
    "type" "ConfigType" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfigItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "groupId" TEXT,
    "psicoId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "endTime" TEXT,
    "seriesId" TEXT,
    "recurrence" TEXT,
    "sessionNumber" INTEGER,
    "attendance" TEXT DEFAULT 'PENDENTE',

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentLog" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "InstrumentLogType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "protocolNumber" TEXT,
    "reason" TEXT,

    CONSTRAINT "InstrumentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentApplication" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "psychoId" TEXT NOT NULL,
    "purposeEnc" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentApplicationEntry" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "descriptionEnc" TEXT NOT NULL,

    CONSTRAINT "InstrumentApplicationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ClinicalDocumentType" NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupClientNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_assignedPsicoId_idx" ON "Client"("assignedPsicoId");

-- CreateIndex
CREATE INDEX "HistoryLog_clientId_idx" ON "HistoryLog"("clientId");

-- CreateIndex
CREATE INDEX "HistoryLog_category_idx" ON "HistoryLog"("category");

-- CreateIndex
CREATE INDEX "AccessLog_clientId_idx" ON "AccessLog"("clientId");

-- CreateIndex
CREATE INDEX "AccessLog_actorId_idx" ON "AccessLog"("actorId");

-- CreateIndex
CREATE INDEX "AccessLog_at_idx" ON "AccessLog"("at");

-- CreateIndex
CREATE INDEX "SessionRecord_clientId_idx" ON "SessionRecord"("clientId");

-- CreateIndex
CREATE INDEX "SessionRecord_psicoId_idx" ON "SessionRecord"("psicoId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAttendance_groupRecordId_clientId_key" ON "GroupAttendance"("groupRecordId", "clientId");

-- CreateIndex
CREATE INDEX "ConfigItem_type_idx" ON "ConfigItem"("type");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_psicoId_idx" ON "Appointment"("psicoId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_clientId_idx" ON "ClinicalDocument"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupClientNote_groupId_clientId_authorId_key" ON "GroupClientNote"("groupId", "clientId", "authorId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedPsicoId_fkey" FOREIGN KEY ("assignedPsicoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryLog" ADD CONSTRAINT "HistoryLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryLog" ADD CONSTRAINT "HistoryLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_psicoId_fkey" FOREIGN KEY ("psicoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordVersion" ADD CONSTRAINT "RecordVersion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_psychologistId_fkey" FOREIGN KEY ("psychologistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRecord" ADD CONSTRAINT "GroupRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRecord" ADD CONSTRAINT "GroupRecord_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAttendance" ADD CONSTRAINT "GroupAttendance_groupRecordId_fkey" FOREIGN KEY ("groupRecordId") REFERENCES "GroupRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAttendance" ADD CONSTRAINT "GroupAttendance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_psicoId_fkey" FOREIGN KEY ("psicoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentLog" ADD CONSTRAINT "InstrumentLog_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentLog" ADD CONSTRAINT "InstrumentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentApplication" ADD CONSTRAINT "InstrumentApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentApplication" ADD CONSTRAINT "InstrumentApplication_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentApplication" ADD CONSTRAINT "InstrumentApplication_psychoId_fkey" FOREIGN KEY ("psychoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentApplicationEntry" ADD CONSTRAINT "InstrumentApplicationEntry_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InstrumentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupClientNote" ADD CONSTRAINT "GroupClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupClientNote" ADD CONSTRAINT "GroupClientNote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupClientNote" ADD CONSTRAINT "GroupClientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
