import express, { type Request, type Response, type NextFunction } from "express";
import { prisma } from "./prisma.js";
import { encryptField } from "./crypto.js";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireSession,
} from "./auth.js";
import {
  mapUser,
  mapClient,
  mapSession,
  mapGroup,
  mapGroupRecord,
  mapAppointment,
  mapConfigItem,
  mapInstrument,
  mapInstrumentLog,
} from "./mappers.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Erro interno no servidor." });
    });
  };

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Informe e-mail e senha." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }
    const token = createSessionToken({ userId: user.id, role: user.role as any, name: user.name });
    setSessionCookie(res, token);
    res.json({ user: mapUser(user) });
  })
);

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get(
  "/api/auth/me",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado." });
      return;
    }
    res.json({ user: mapUser(user) });
  })
);

// ---------------------------------------------------------------------------
// BOOTSTRAP — carrega tudo que a tela precisa em uma chamada só,
// já filtrado conforme o papel de quem está logado.
// ---------------------------------------------------------------------------

app.get(
  "/api/bootstrap",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const isSupervisorOrAdmin = session.role === "SUPERVISOR" || session.role === "ADMIN";

    const [users, clientsRaw, sessionsRaw, appointmentsRaw, groupsRaw, groupRecordsRaw, configItems, instruments, instrumentLogsRaw] =
      await Promise.all([
        prisma.user.findMany({ orderBy: { name: "asc" } }),
        prisma.client.findMany({
          include: { history: { include: { actor: true }, orderBy: { date: "desc" } }, assignedPsico: true, instrumentApps: true },
          orderBy: { dateIncluded: "desc" },
        }),
        prisma.sessionRecord.findMany({ include: { versions: true }, orderBy: { date: "desc" } }),
        prisma.appointment.findMany({ orderBy: { date: "asc" } }),
        prisma.group.findMany({ include: { members: true }, orderBy: { createdAt: "desc" } }),
        prisma.groupRecord.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.configItem.findMany(),
        prisma.instrument.findMany(),
        prisma.instrumentLog.findMany({ orderBy: { date: "desc" } }),
      ]);

    // PSICO só vê os próprios pacientes/sessões/grupos/agenda — Supervisor e Admin veem tudo.
    const clients = isSupervisorOrAdmin
      ? clientsRaw
      : clientsRaw.filter((c: any) => c.assignedPsicoId === session.userId);
    const clientIds = new Set(clients.map((c: any) => c.id));

    const sessions = isSupervisorOrAdmin
      ? sessionsRaw
      : sessionsRaw.filter((s: any) => s.psicoId === session.userId || clientIds.has(s.clientId));

    const appointments = isSupervisorOrAdmin
      ? appointmentsRaw
      : appointmentsRaw.filter((a: any) => a.psicoId === session.userId);

    const groups = isSupervisorOrAdmin
      ? groupsRaw
      : groupsRaw.filter((g: any) => g.psychologistId === session.userId);
    const groupIds = new Set(groups.map((g: any) => g.id));

    const groupRecords = isSupervisorOrAdmin
      ? groupRecordsRaw
      : groupRecordsRaw.filter((r: any) => groupIds.has(r.groupId));

    const instrumentLogs = instrumentLogsRaw; // consumo de material é visível a todos (não é dado clínico)

    res.json({
      users: users.map(mapUser),
      clients: clients.map(mapClient),
      sessions: sessions.map(mapSession),
      appointments: appointments.map(mapAppointment),
      groups: groups.map(mapGroup),
      groupRecords: groupRecords.map(mapGroupRecord),
      config: {
        affiliations: configItems.filter((c: any) => c.type === "AFFILIATION").map(mapConfigItem),
        allocations: configItems.filter((c: any) => c.type === "ALLOCATION").map(mapConfigItem),
        rooms: configItems.filter((c: any) => c.type === "ROOM").map(mapConfigItem),
        tags: configItems.filter((c: any) => c.type === "TAG").map(mapConfigItem),
      },
      instruments: instruments.map(mapInstrument),
      instrumentLogs: instrumentLogs.map(mapInstrumentLog),
    });
  })
);

// ---------------------------------------------------------------------------
// Helper: garante que PSICO só mexe em cliente atribuído a ele mesmo.
// ---------------------------------------------------------------------------
async function assertClientAccess(session: { userId: string; role: string }, clientId: string) {
  if (session.role === "SUPERVISOR" || session.role === "ADMIN") return true;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  return !!client && client.assignedPsicoId === session.userId;
}

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

app.post(
  "/api/clients",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    const client = await prisma.client.create({
      data: {
        protocolNumber: b.protocolNumber,
        signedAgreement: !!b.signedAgreement,
        fullNameEnc: encryptField(b.fullName),
        whatsappEnc: encryptField(b.whatsapp),
        birthDateEnc: encryptField(b.birthDate),
        emergencyContactNameEnc: encryptField(b.emergencyContactName),
        emergencyContactPhoneEnc: encryptField(b.emergencyContactPhone),
        registrationCode: b.registrationCode,
        affiliation: b.affiliation,
        allocation: b.allocation,
        dependencyType: b.dependencyType,
        dependencySponsor: b.dependencySponsor,
        tags: b.tags ?? [],
        status: b.status ?? "FILA_ESPERA",
        priority: b.priority,
        assignedPsicoId: b.assignedPsicoId || null,
        maxSessions: b.maxSessions ?? 0,
        defaultRoom: b.defaultRoom,
        defaultTime: b.defaultTime,
        history: {
          create: [
            {
              actorId: session.userId,
              action: "Caso criado",
            },
          ],
        },
      },
      include: { history: { include: { actor: true } }, assignedPsico: true, instrumentApps: true },
    });
    res.status(201).json({ client: mapClient(client) });
  })
);

app.patch(
  "/api/clients/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await assertClientAccess(session, req.params.id))) {
      res.status(403).json({ error: "Sem permissão para este paciente." });
      return;
    }
    const b = req.body ?? {};
    const data: any = {};
    const plain: Record<string, string> = {
      protocolNumber: "protocolNumber",
      registrationCode: "registrationCode",
      affiliation: "affiliation",
      allocation: "allocation",
      dependencyType: "dependencyType",
      dependencySponsor: "dependencySponsor",
      status: "status",
      priority: "priority",
      defaultRoom: "defaultRoom",
      defaultTime: "defaultTime",
      maxSessions: "maxSessions",
      completedSessions: "completedSessions",
      signedAgreement: "signedAgreement",
      assignedPsicoId: "assignedPsicoId",
      tags: "tags",
    };
    for (const key of Object.keys(plain)) {
      if (key in b) data[key] = b[key];
    }
    if ("fullName" in b) data.fullNameEnc = encryptField(b.fullName);
    if ("whatsapp" in b) data.whatsappEnc = encryptField(b.whatsapp);
    if ("birthDate" in b) data.birthDateEnc = encryptField(b.birthDate);
    if ("emergencyContactName" in b) data.emergencyContactNameEnc = encryptField(b.emergencyContactName);
    if ("emergencyContactPhone" in b) data.emergencyContactPhoneEnc = encryptField(b.emergencyContactPhone);

    if (b.logAction) {
      data.history = { create: [{ actorId: session.userId, action: b.logAction, detailsEnc: b.logDetails ? encryptField(b.logDetails) : null }] };
    }

    if (Array.isArray(b.instruments)) {
      for (const app of b.instruments) {
        if (app?.id && typeof app.results === "string") {
          await prisma.instrumentApplication.update({
            where: { id: app.id },
            data: { resultsEnc: encryptField(app.results) },
          }).catch(() => {});
        }
      }
    }

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data,
      include: { history: { include: { actor: true }, orderBy: { date: "desc" } }, assignedPsico: true, instrumentApps: true },
    });
    res.json({ client: mapClient(client) });
  })
);

// ---------------------------------------------------------------------------
// SESSION RECORDS (prontuários)
// ---------------------------------------------------------------------------

app.post(
  "/api/sessions",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    if (!(await assertClientAccess(session, b.clientId))) {
      res.status(403).json({ error: "Sem permissão para este paciente." });
      return;
    }

    // O front-end reaproveita esta rota tanto para criar uma sessão nova
    // quanto para "concluir" um rascunho já existente (envia o id do rascunho).
    if (b.id) {
      const existing = await prisma.sessionRecord.findUnique({ where: { id: b.id } });
      if (existing) {
        const data: any = {
          notesEnc: encryptField(b.notes ?? ""),
          isDraft: b.isDraft ?? false,
        };
        if (b.attendance !== undefined) data.attendance = b.attendance;
        if (existing.notesEnc) {
          data.versions = { create: [{ oldContentEnc: existing.notesEnc }] };
        }
        const updated = await prisma.sessionRecord.update({
          where: { id: b.id },
          data,
          include: { versions: true },
        });
        res.status(200).json({ session: mapSession(updated) });
        return;
      }
    }

    const created = await prisma.sessionRecord.create({
      data: {
        clientId: b.clientId,
        psicoId: b.psicoId || session.userId,
        date: new Date(b.date),
        notesEnc: encryptField(b.notes ?? ""),
        isDraft: b.isDraft ?? false,
        status: b.status,
        groupId: b.groupId,
        appointmentId: b.appointmentId,
        attendance: b.attendance,
      },
      include: { versions: true },
    });
    res.status(201).json({ session: mapSession(created) });
  })
);

app.patch(
  "/api/sessions/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const existing = await prisma.sessionRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Prontuário não encontrado." });
      return;
    }
    if (!(await assertClientAccess(session, existing.clientId))) {
      res.status(403).json({ error: "Sem permissão para este paciente." });
      return;
    }
    const b = req.body ?? {};
    const data: any = {};

    // Guarda a versão anterior antes de sobrescrever (histórico de edições do prontuário).
    if ("notes" in b && existing.notesEnc) {
      data.versions = { create: [{ oldContentEnc: existing.notesEnc }] };
    }
    if ("notes" in b) data.notesEnc = encryptField(b.notes);
    if ("isDraft" in b) data.isDraft = b.isDraft;
    if ("status" in b) data.status = b.status;
    if ("attendance" in b) data.attendance = b.attendance;

    const updated = await prisma.sessionRecord.update({
      where: { id: req.params.id },
      data,
      include: { versions: true },
    });
    res.json({ session: mapSession(updated) });
  })
);

// ---------------------------------------------------------------------------
// APPOINTMENTS (agenda)
// ---------------------------------------------------------------------------

app.post(
  "/api/appointments",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    const appt = await prisma.appointment.create({
      data: {
        clientId: b.clientId || null,
        groupId: b.groupId || null,
        psicoId: b.psicoId || session.userId,
        roomId: b.roomId,
        date: new Date(b.date),
        time: b.time,
        endTime: b.endTime,
        seriesId: b.seriesId,
        recurrence: b.recurrence,
        sessionNumber: b.sessionNumber,
      },
    });

    // Réplica a lógica do app original: cria automaticamente um rascunho de prontuário.
    if (appt.clientId) {
      await prisma.sessionRecord.create({
        data: {
          clientId: appt.clientId,
          psicoId: appt.psicoId,
          date: new Date(`${b.date}T${b.time}:00`),
          notesEnc: "",
          isDraft: true,
          appointmentId: appt.id,
        },
      });
    } else if (appt.groupId) {
      const group = await prisma.group.findUnique({ where: { id: appt.groupId } });
      if (group) {
        await prisma.groupRecord.create({
          data: {
            groupId: group.id,
            authorId: appt.psicoId,
            sessionDate: new Date(b.date),
            contentEnc: "",
            isDraft: true,
          },
        });
      }
    }

    res.status(201).json({ appointment: mapAppointment(appt) });
  })
);

app.patch(
  "/api/appointments/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Agendamento não encontrado." });
      return;
    }
    if (session.role === "PSICO" && existing.psicoId !== session.userId) {
      res.status(403).json({ error: "Você só pode editar os seus próprios agendamentos." });
      return;
    }
    const b = req.body ?? {};
    const data: any = {};
    for (const key of ["roomId", "time", "endTime", "recurrence", "sessionNumber", "attendance", "psicoId", "seriesId"]) {
      if (key in b) data[key] = b[key];
    }
    if ("clientId" in b) data.clientId = b.clientId || null;
    if ("groupId" in b) data.groupId = b.groupId || null;
    if ("date" in b) data.date = new Date(b.date);
    const updated = await prisma.appointment.update({ where: { id: req.params.id }, data });
    res.json({ appointment: mapAppointment(updated) });
  })
);

app.delete(
  "/api/appointments/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const deleteFuture = req.query.deleteFuture === "true";
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appt) {
      res.status(404).json({ error: "Agendamento não encontrado." });
      return;
    }
    if (session.role === "PSICO" && appt.psicoId !== session.userId) {
      res.status(403).json({ error: "Você só pode remover os seus próprios agendamentos." });
      return;
    }
    if (deleteFuture && appt.seriesId) {
      await prisma.appointment.deleteMany({
        where: { seriesId: appt.seriesId, date: { gte: appt.date } },
      });
    } else {
      await prisma.appointment.delete({ where: { id: req.params.id } });
    }
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GROUPS
// ---------------------------------------------------------------------------

app.post(
  "/api/groups",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    const group = await prisma.group.create({
      data: {
        name: b.name,
        objective: b.objective,
        methodology: b.methodology,
        frequency: b.frequency,
        criteria: b.criteria,
        psychologistId: b.psychologistId || session.userId,
      },
      include: { members: true },
    });
    res.status(201).json({ group: mapGroup(group) });
  })
);

app.patch(
  "/api/groups/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    const data: any = {};
    for (const key of ["name", "objective", "methodology", "frequency", "criteria", "isActive"]) {
      if (key in b) data[key] = b[key];
    }
    if (Array.isArray(b.memberIds)) {
      await prisma.groupMember.deleteMany({ where: { groupId: req.params.id } });
      data.members = { create: b.memberIds.map((clientId: string) => ({ clientId })) };
    }
    const group = await prisma.group.update({ where: { id: req.params.id }, data, include: { members: true } });
    res.json({ group: mapGroup(group) });
  })
);

// ---------------------------------------------------------------------------
// GROUP RECORDS
// ---------------------------------------------------------------------------

app.post(
  "/api/group-records",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};

    if (b.id) {
      const existing = await prisma.groupRecord.findUnique({ where: { id: b.id } });
      if (existing) {
        const updated = await prisma.groupRecord.update({
          where: { id: b.id },
          data: { contentEnc: encryptField(b.content), isDraft: false },
        });
        res.status(200).json({ groupRecord: mapGroupRecord(updated) });
        return;
      }
    }

    // Se já existe um rascunho para esse grupo+data, atualiza em vez de duplicar
    // (mesmo comportamento do app original).
    const existingDraft = await prisma.groupRecord.findFirst({
      where: { groupId: b.groupId, sessionDate: new Date(b.sessionDate), isDraft: true },
    });

    let record;
    if (existingDraft) {
      record = await prisma.groupRecord.update({
        where: { id: existingDraft.id },
        data: { contentEnc: encryptField(b.content), isDraft: false },
      });
    } else {
      record = await prisma.groupRecord.create({
        data: {
          groupId: b.groupId,
          authorId: b.authorId || session.userId,
          sessionDate: new Date(b.sessionDate),
          contentEnc: encryptField(b.content),
          isDraft: false,
        },
      });

      // Gera prontuários individuais pendentes para os membros do grupo.
      const group = await prisma.group.findUnique({ where: { id: b.groupId }, include: { members: true } });
      if (group) {
        for (const member of group.members) {
          await prisma.sessionRecord.create({
            data: {
              clientId: member.clientId,
              psicoId: record.authorId,
              date: new Date(`${b.sessionDate}T12:00:00`),
              notesEnc: "",
              isDraft: true,
              status: "PENDENTE",
              groupId: group.id,
            },
          });
          await prisma.historyLog.create({
            data: {
              clientId: member.clientId,
              actorId: session.userId,
              action: "Prontuário de Grupo Pendente",
              detailsEnc: encryptField(`Criado automaticamente a partir da sessão do grupo ${group.name}`),
            },
          });
        }
      }
    }
    res.status(201).json({ groupRecord: mapGroupRecord(record) });
  })
);

// ---------------------------------------------------------------------------
// CONFIG (afiliações, alocações, salas, tags)
// ---------------------------------------------------------------------------

const CONFIG_TYPE_MAP: Record<string, string> = {
  affiliations: "AFFILIATION",
  allocations: "ALLOCATION",
  rooms: "ROOM",
  tags: "TAG",
};

app.post(
  "/api/config/:type",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const dbType = CONFIG_TYPE_MAP[req.params.type];
    if (!dbType) {
      res.status(400).json({ error: "Tipo de configuração inválido." });
      return;
    }
    const item = await prisma.configItem.create({
      data: { type: dbType as any, name: req.body.name, isActive: true },
    });
    res.status(201).json({ item: mapConfigItem(item) });
  })
);

app.patch(
  "/api/config/:type/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const item = await prisma.configItem.update({
      where: { id: req.params.id },
      data: { name: req.body.name, isActive: req.body.isActive },
    });
    res.json({ item: mapConfigItem(item) });
  })
);

// ---------------------------------------------------------------------------
// USERS (equipe)
// ---------------------------------------------------------------------------

app.post(
  "/api/users",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const b = req.body ?? {};
    if (!b.password || String(b.password).length < 6) {
      res.status(400).json({ error: "A senha precisa ter ao menos 6 caracteres." });
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: b.name,
        email: b.email,
        passwordHash: await hashPassword(b.password),
        role: b.role,
        crp: b.crp,
        title: b.title,
        institutionalLink: b.institutionalLink,
        birthDate: b.birthDate ? new Date(b.birthDate) : undefined,
        matricula: b.matricula,
        color: b.color,
        capacity: b.capacity,
      },
    });
    res.status(201).json({ user: mapUser(user) });
  })
);

app.patch(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const isSelf = session.userId === req.params.id;
    const isAdmin = session.role === "SUPERVISOR" || session.role === "ADMIN";
    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: "Sem permissão." });
      return;
    }
    const b = req.body ?? {};
    const data: any = {};
    for (const key of ["name", "email", "title", "institutionalLink", "matricula", "color", "capacity"]) {
      if (key in b) data[key] = b[key];
    }
    if ("birthDate" in b) data.birthDate = b.birthDate ? new Date(b.birthDate) : null;
    // Só Supervisor/Admin podem mudar papel e CRP de terceiros; qualquer um pode trocar a própria senha.
    if (isAdmin) {
      if ("role" in b) data.role = b.role;
      if ("crp" in b) data.crp = b.crp;
    }
    if (b.password) {
      if (String(b.password).length < 6) {
        res.status(400).json({ error: "A senha precisa ter ao menos 6 caracteres." });
        return;
      }
      data.passwordHash = await hashPassword(b.password);
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: mapUser(user) });
  })
);

app.delete(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// INSTRUMENTS (materiais/testes)
// ---------------------------------------------------------------------------

app.post(
  "/api/instruments",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { name, initialCount } = req.body ?? {};
    const instrument = await prisma.instrument.create({ data: { name, sheetCount: initialCount ?? 0 } });
    await prisma.instrumentLog.create({
      data: {
        instrumentId: instrument.id,
        type: "INITIAL",
        amount: initialCount ?? 0,
        newCount: initialCount ?? 0,
        userId: session.userId,
        reason: "Cadastro inicial",
      },
    });
    res.status(201).json({ instrument: mapInstrument(instrument) });
  })
);

app.patch(
  "/api/instruments/:id/stock",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { newCount, reason } = req.body ?? {};
    const current = await prisma.instrument.findUnique({ where: { id: req.params.id } });
    if (!current) {
      res.status(404).json({ error: "Material não encontrado." });
      return;
    }
    const instrument = await prisma.instrument.update({
      where: { id: req.params.id },
      data: { sheetCount: newCount },
    });
    await prisma.instrumentLog.create({
      data: {
        instrumentId: instrument.id,
        type: "ADJUSTMENT",
        amount: newCount - current.sheetCount,
        newCount,
        userId: session.userId,
        reason,
      },
    });
    res.json({ instrument: mapInstrument(instrument) });
  })
);

app.post(
  "/api/instruments/:id/apply",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { clientId, results } = req.body ?? {};
    if (!(await assertClientAccess(session, clientId))) {
      res.status(403).json({ error: "Sem permissão para este paciente." });
      return;
    }
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const instrument = await prisma.instrument.findUnique({ where: { id: req.params.id } });
    if (!client || !instrument) {
      res.status(404).json({ error: "Paciente ou material não encontrado." });
      return;
    }

    await prisma.instrumentApplication.create({
      data: {
        clientId,
        instrumentId: instrument.id,
        psychoId: session.userId,
        resultsEnc: encryptField(results),
      },
    });

    if (instrument.sheetCount > 0) {
      const newCount = instrument.sheetCount - 1;
      await prisma.instrument.update({ where: { id: instrument.id }, data: { sheetCount: newCount } });
      await prisma.instrumentLog.create({
        data: {
          instrumentId: instrument.id,
          type: "CONSUMPTION",
          amount: -1,
          newCount,
          userId: session.userId,
          protocolNumber: client.protocolNumber,
          reason: "Aplicação em paciente",
        },
      });
    }

    await prisma.historyLog.create({
      data: {
        clientId,
        actorId: session.userId,
        action: `Aplicou instrumento/teste (Protocolo: ${client.protocolNumber})`,
      },
    });

    const updatedClient = await prisma.client.findUnique({
      where: { id: clientId },
      include: { history: { include: { actor: true }, orderBy: { date: "desc" } }, assignedPsico: true, instrumentApps: true },
    });
    res.json({ client: mapClient(updatedClient) });
  })
);

// Rota de teste simples para conferir se a API subiu (sem precisar de login).
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno no servidor." });
});

export default app;
