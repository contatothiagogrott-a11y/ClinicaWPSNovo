import crypto from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { prisma } from "./prisma.js";
import { encryptField, decryptField } from "./crypto.js";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireSession,
  getSession,
  type AppRole,
} from "./auth.js";
import { securityHeaders, clientIp } from "./security.js";
import { checkRateLimit, registerFailure, registerSuccess, rateLimitKey } from "./rateLimit.js";
import { parseDateInput, parseLocalDateTime, startOfDayBRT } from "./datetime.js";
import { computeRetentionUntil, describeRetention } from "./retention.js";
import {
  type Actor,
  diffChangedFieldLabels,
  logAccess,
  logClientFieldChanges,
  logClientTransfer,
  logClinicalRecord,
  logDocumentEvent,
  writeHistory,
} from "./audit.js";
import {
  mapUser,
  mapUserPublic,
  mapClient,
  mapSession,
  mapSessionMeta,
  mapGroup,
  mapGroupRecord,
  mapAppointment,
  mapConfigItem,
  mapInstrument,
  mapInstrumentLog,
  mapClinicalDocument,
  mapGroupClientNote,
  mapHistoryLog,
  mapAccessLog,
} from "./mappers.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(securityHeaders);

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Erro interno no servidor." });
    });
  };

function actorOf(session: { userId: string; name: string; role: AppRole }): Actor {
  return { userId: session.userId, name: session.name, role: session.role };
}

// ---------------------------------------------------------------------------
// SENHA PROVISÓRIA
// Enquanto o usuário não trocar a senha criada por terceiro, nenhuma operação
// de escrita é permitida. Isso garante que o autor registrado num prontuário
// seja de fato quem o escreveu (não-repúdio) — requisito prático para o
// prontuário ter valor probatório perante o CRP.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
  const isAuthRoute = req.path.startsWith("/api/auth/");
  if (!isWrite || isAuthRoute) {
    next();
    return;
  }
  const session = getSession(req);
  if (!session) {
    next();
    return;
  }
  prisma.user
    .findUnique({ where: { id: session.userId }, select: { mustChangePassword: true } })
    .then((user: { mustChangePassword: boolean } | null) => {
      if (user?.mustChangePassword) {
        res.status(423).json({
          error: "Troque a sua senha provisória antes de continuar.",
          code: "MUST_CHANGE_PASSWORD",
        });
        return;
      }
      next();
    })
    .catch(next);
});

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

    // Anti força-bruta (LGPD Art. 46).
    const key = rateLimitKey(clientIp(req), email);
    const limit = checkRateLimit(key);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Muitas tentativas de acesso. Tente novamente em ${Math.ceil(limit.retryAfterSeconds / 60)} minuto(s).`,
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    // Mensagem idêntica para e-mail inexistente e senha errada: não confirmamos
    // a existência da conta para quem está sondando (enumeração de usuários).
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      registerFailure(key);
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    registerSuccess(key);
    const token = createSessionToken({
      userId: user.id,
      role: user.role as AppRole,
      name: user.name,
      loginAt: Math.floor(Date.now() / 1000),
    });
    setSessionCookie(res, token);
    await logAccess({
      actor: actorOf({ userId: user.id, name: user.name, role: user.role as AppRole }),
      action: "LOGIN",
      resource: "sessao",
      ip: clientIp(req),
    });
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

/**
 * Troca da própria senha. Exige a senha atual — nem mesmo o Supervisor
 * consegue trocar a senha de alguém sem passar por aqui, e o próprio usuário
 * precisa provar que é ele. Encerra o estado `mustChangePassword`.
 */
app.post(
  "/api/auth/change-password",
  asyncHandler(async (req, res) => {
    const session = getSession(req);
    if (!session) {
      res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
      return;
    }
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Informe a senha atual e a nova senha." });
      return;
    }
    const problem = validatePasswordStrength(String(newPassword));
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      res.status(401).json({ error: "Senha atual incorreta." });
      return;
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      res.status(400).json({ error: "A nova senha precisa ser diferente da atual." });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(String(newPassword)),
        mustChangePassword: false,
        lastPasswordChangeAt: new Date(),
      },
    });
    await logAccess({
      actor: actorOf(session),
      action: "TROCA_DE_SENHA",
      resource: "credencial",
      ip: clientIp(req),
    });
    res.json({ user: mapUser(updated) });
  })
);

/** Política mínima de senha. */
function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "A senha precisa ter ao menos 10 caracteres.";
  if (!/[A-Za-z]/.test(password)) return "A senha precisa conter ao menos uma letra.";
  if (!/[0-9]/.test(password)) return "A senha precisa conter ao menos um número.";
  const trivial = ["12345678", "senha", "password", "alesc", "psicologia"];
  if (trivial.some((t) => password.toLowerCase().includes(t))) {
    return "Escolha uma senha menos previsível.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// CONTROLE DE ACESSO
// ---------------------------------------------------------------------------
//
// Dois níveis distintos — a confusão entre eles era a maior falha do sistema
// anterior, em que o perfil Administrativo conseguia ler e escrever prontuário
// pela API (a tela apenas escondia o botão).
//
//  * ACESSO DE CADASTRO  → dados administrativos do caso (fluxo, agenda,
//    contato). Supervisor, Administrativo e o profissional responsável.
//
//  * ACESSO CLÍNICO      → prontuário, evolução, instrumentos aplicados e
//    documentos psicológicos. Somente o profissional responsável, o psicólogo
//    de um grupo do qual o paciente participa, e o Supervisor (supervisão
//    clínica). O Administrativo NUNCA entra aqui.
//    Fundamento: Art. 9º do Código de Ética Profissional do Psicólogo e
//    Resolução CFP nº 001/2009 (acesso restrito a quem presta o atendimento).
// ---------------------------------------------------------------------------

async function hasRegistrationAccess(
  session: { userId: string; role: AppRole },
  clientId: string
): Promise<boolean> {
  if (session.role === "SUPERVISOR" || session.role === "ADMIN") return true;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { assignedPsicoId: true },
  });
  return !!client && client.assignedPsicoId === session.userId;
}

async function hasClinicalAccess(
  session: { userId: string; role: AppRole },
  clientId: string
): Promise<boolean> {
  if (session.role === "ADMIN") return false; // sigilo profissional
  if (session.role === "SUPERVISOR") return true; // supervisão clínica
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { assignedPsicoId: true },
  });
  if (client?.assignedPsicoId === session.userId) return true;
  // Psicólogo que conduz um grupo do qual este paciente participa.
  const membership = await prisma.groupMember.findFirst({
    where: { clientId, group: { psychologistId: session.userId } },
    select: { clientId: true },
  });
  return !!membership;
}

/** Prontuário de grupo: psicólogo responsável pelo grupo + Supervisor. */
async function hasGroupAccess(
  session: { userId: string; role: AppRole },
  groupId: string
): Promise<boolean> {
  if (session.role === "SUPERVISOR") return true;
  if (session.role === "ADMIN") return false;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { psychologistId: true } });
  return !!group && group.psychologistId === session.userId;
}

function denyRegistration(res: Response) {
  res.status(403).json({ error: "Sem permissão para este paciente." });
}
function denyClinical(res: Response) {
  res.status(403).json({
    error:
      "Conteúdo clínico restrito ao profissional responsável e à supervisão (sigilo profissional).",
  });
}

// Contadores de sessões concluídas (regra preservada do sistema original).
async function maybeIncrementCompletedSessions(clientId: string, wasDraft: boolean, isNowDraft: boolean) {
  if (wasDraft && !isNowDraft) {
    await prisma.client.update({ where: { id: clientId }, data: { completedSessions: { increment: 1 } } });
  }
}

async function maybeIncrementCompletedSessionsOnAttendance(
  clientId: string,
  wasAttendance: string | null,
  isNowAttendance: string | null
) {
  if (isNowAttendance === "COMPARECEU" && wasAttendance !== "COMPARECEU") {
    await prisma.client.update({ where: { id: clientId }, data: { completedSessions: { increment: 1 } } });
  }
}

// ---------------------------------------------------------------------------
// BOOTSTRAP — carga inicial da interface, já filtrada por papel.
// ---------------------------------------------------------------------------

app.get(
  "/api/bootstrap",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const me = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { mustChangePassword: true },
    });
    if (me?.mustChangePassword) {
      res.status(423).json({
        error: "Troque a sua senha provisória para acessar o sistema.",
        code: "MUST_CHANGE_PASSWORD",
      });
      return;
    }

    const isSupervisor = session.role === "SUPERVISOR";
    const isAdmin = session.role === "ADMIN";
    const isSupervisorOrAdmin = isSupervisor || isAdmin;

    const [
      users,
      clientsRaw,
      sessionsRaw,
      appointmentsRaw,
      groupsRaw,
      groupRecordsRaw,
      configItems,
      instruments,
      instrumentLogsRaw,
      clinicalDocumentsRaw,
      groupClientNotesRaw,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.client.findMany({
        // O HISTÓRICO NÃO VEM MAIS AQUI. Ele é carregado sob demanda em
        // /api/clients/:id/history, por dois motivos: minimização de dados
        // (LGPD Art. 6º, III) e porque trazer a trilha inteira de todos os
        // pacientes em toda sincronização é desperdício puro.
        include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
        orderBy: { dateIncluded: "desc" },
      }),
      prisma.sessionRecord.findMany({ include: { versions: true }, orderBy: { date: "desc" } }),
      prisma.appointment.findMany({ orderBy: { date: "asc" } }),
      prisma.group.findMany({ include: { members: true }, orderBy: { createdAt: "desc" } }),
      prisma.groupRecord.findMany({ include: { attendances: true }, orderBy: { createdAt: "desc" } }),
      prisma.configItem.findMany(),
      prisma.instrument.findMany(),
      prisma.instrumentLog.findMany({ orderBy: { date: "desc" } }),
      prisma.clinicalDocument.findMany({ include: { author: true }, orderBy: { createdAt: "desc" } }),
      prisma.groupClientNote.findMany(),
    ]);

    const myLedGroupIds = new Set(
      groupsRaw.filter((g: any) => g.psychologistId === session.userId).map((g: any) => g.id)
    );
    const myGroupMemberClientIds = new Set(
      groupsRaw.filter((g: any) => myLedGroupIds.has(g.id)).flatMap((g: any) => g.members.map((m: any) => m.clientId))
    );

    // Quais pacientes este usuário enxerga (nível cadastro).
    const clients = isSupervisorOrAdmin
      ? clientsRaw
      : clientsRaw.filter(
          (c: any) => c.assignedPsicoId === session.userId || myGroupMemberClientIds.has(c.id)
        );

    // Quais pacientes este usuário pode ver CLINICAMENTE.
    const clinicalClientIds = new Set<string>(
      isAdmin
        ? []
        : isSupervisor
        ? clientsRaw.map((c: any) => c.id)
        : clients
            .filter((c: any) => c.assignedPsicoId === session.userId || myGroupMemberClientIds.has(c.id))
            .map((c: any) => c.id)
    );

    const clientIds = new Set(clients.map((c: any) => c.id));

    // O Administrativo recebe as sessões SEM conteúdo (só metadados), para
    // continuar contando pendências e ocupação sem ler evolução clínica.
    const visibleSessions = isSupervisor
      ? sessionsRaw
      : isAdmin
      ? sessionsRaw
      : sessionsRaw.filter((s: any) => s.psicoId === session.userId || clinicalClientIds.has(s.clientId));

    const sessions = visibleSessions.map((s: any) =>
      isAdmin || !clinicalClientIds.has(s.clientId) ? mapSessionMeta(s) : mapSession(s, session.userId)
    );

    const appointments = isSupervisorOrAdmin
      ? appointmentsRaw
      : appointmentsRaw.filter((a: any) => a.psicoId === session.userId);

    const groups = isSupervisorOrAdmin
      ? groupsRaw
      : groupsRaw.filter((g: any) => g.psychologistId === session.userId);

    const groupRecords = isSupervisor
      ? groupRecordsRaw
      : isAdmin
      ? [] // prontuário de grupo é conteúdo clínico
      : groupRecordsRaw.filter((r: any) => myLedGroupIds.has(r.groupId));

    // Documentos psicológicos são clínicos: fora do alcance do Administrativo.
    const clinicalDocuments = isAdmin
      ? []
      : clinicalDocumentsRaw.filter((d: any) => clinicalClientIds.has(d.clientId));

    const groupClientNotes = isSupervisor
      ? groupClientNotesRaw
      : isAdmin
      ? []
      : groupClientNotesRaw.filter((n: any) => n.authorId === session.userId);

    res.json({
      /**
       * Lista de colegas.
       * Supervisor e Administrativo gerenciam a equipe e precisam do cadastro
       * completo. O Psicólogo recebe só o necessário para agenda e atribuição
       * (nome, papel, CRP, cor) — e-mail, matrícula e data de nascimento de
       * colega também são dados pessoais protegidos pela LGPD.
       */
      users: users.map((u: any) =>
        isSupervisorOrAdmin || u.id === session.userId ? mapUser(u) : mapUserPublic(u)
      ),
      clients: clients.map((c: any) =>
        mapClient(c, { includeHistory: false, includeClinical: clinicalClientIds.has(c.id) })
      ),
      sessions,
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
      instrumentLogs: instrumentLogsRaw.map(mapInstrumentLog),
      clinicalDocuments: clinicalDocuments.map(mapClinicalDocument),
      groupClientNotes: groupClientNotes.map(mapGroupClientNote),
      clinicalClientIds: Array.from(clinicalClientIds),
    });
  })
);

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

app.post(
  "/api/clients",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};

    // Só quem pode transferir pode também JÁ NASCER com um responsável
    // diferente de si mesmo — senão o bloqueio do item 4 seria contornável
    // criando o caso direto no nome de outro profissional.
    let assignedPsicoId: string | null = b.assignedPsicoId || null;
    if (session.role === "PSICO" && assignedPsicoId && assignedPsicoId !== session.userId) {
      assignedPsicoId = session.userId;
    }

    const client = await prisma.client.create({
      data: {
        protocolNumber: b.protocolNumber,
        signedAgreement: !!b.signedAgreement,
        fullNameEnc: encryptField(b.fullName),
        whatsappEnc: encryptField(b.whatsapp),
        birthDateEnc: encryptField(b.birthDate),
        emergencyContactNameEnc: encryptField(b.emergencyContactName),
        emergencyContactPhoneEnc: encryptField(b.emergencyContactPhone),
        emergencyContactRelationshipEnc: encryptField(b.emergencyContactRelationship),
        residenceCityNeighborhoodEnc: encryptField(b.residenceCityNeighborhood),
        helpRequestEnc: encryptField(b.helpRequest),
        medicationsEnc: encryptField(b.medications),
        contactObservationsEnc: encryptField(b.contactObservations),
        registrationCode: b.registrationCode,
        affiliation: b.affiliation,
        allocation: b.allocation,
        dependencyType: b.dependencyType,
        dependencySponsor: b.dependencySponsor,
        tags: b.tags ?? [],
        dateIncluded: parseDateInput(b.dateIncluded) ?? undefined,
        status: b.status ?? "FILA_ESPERA",
        priority: b.priority,
        assignedPsicoId,
        maxSessions: b.maxSessions ?? 0,
        defaultRoom: b.defaultRoom,
        defaultTime: b.defaultTime,
        sector: b.sector,
        workShift: b.workShift,
        whatsappAuthorized: b.whatsappAuthorized,
        previouslyAttended: b.previouslyAttended,
        contactMadeByName: b.contactMadeByName,
        contactDate: parseDateInput(b.contactDate) ?? undefined,
        contactStatus: b.contactStatus,
      },
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });

    await writeHistory({
      clientId: client.id,
      actor: actorOf(session),
      category: "FLUXO",
      action: "Caso criado",
    });

    res.status(201).json({ client: mapClient(client, { includeClinical: true }) });
  })
);

app.post(
  "/api/clients/import",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const sourceLabel = String(req.body?.sourceLabel ?? "planilha").slice(0, 120);
    if (rows.length === 0) {
      res.status(400).json({ error: "Nenhuma linha para importar." });
      return;
    }
    if (rows.length > 500) {
      res.status(400).json({ error: "Máximo de 500 linhas por importação." });
      return;
    }

    // Identifica o lote: permite desfazer a importação inteira se o
    // mapeamento de colunas tiver saído errado.
    const importBatchId = crypto.randomUUID();

    // Carrega os cadastros existentes UMA vez para detectar duplicatas sem
    // fazer uma consulta por linha.
    const existentes = await prisma.client.findMany({
      select: { id: true, registrationCode: true, fullNameEnc: true, protocolNumber: true },
    });
    const porMatricula = new Map<string, string>();
    const porNome = new Map<string, string>();
    for (const c of existentes) {
      if (c.registrationCode) porMatricula.set(String(c.registrationCode).trim(), c.protocolNumber);
      const nome = decryptField(c.fullNameEnc);
      if (nome) porNome.set(normalizeName(nome), c.protocolNumber);
    }

    const existingAffiliations = await prisma.configItem.findMany({ where: { type: "AFFILIATION" } });
    const affiliationNames = new Set(existingAffiliations.map((a: any) => a.name.toLowerCase()));

    let created = 0;
    let flagged = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const b = rows[i] ?? {};
      try {
        if (!b.fullName) {
          errors.push({ row: b.sourceRowNumber ?? i + 1, error: "Nome é obrigatório." });
          continue;
        }

        // Motivos de revisão calculados no navegador + os detectados aqui.
        const reasons: string[] = Array.isArray(b.reviewReasons) ? [...b.reviewReasons] : [];

        // Duplicata: registramos e sinalizamos, mas NUNCA descartamos a linha —
        // pode ser reingresso legítimo, e sumir com alguém da fila é pior do
        // que ter um cadastro a mais para conferir.
        const matricula = b.registrationCode ? String(b.registrationCode).trim() : "";
        const nomeNorm = normalizeName(String(b.fullName));
        if (matricula && porMatricula.has(matricula)) {
          reasons.push(`Já existe cadastro com esta matrícula (protocolo ${porMatricula.get(matricula)}).`);
        } else if (porNome.has(nomeNorm)) {
          reasons.push(`Já existe cadastro com este nome (protocolo ${porNome.get(nomeNorm)}).`);
        }

        if (b.affiliation && !affiliationNames.has(String(b.affiliation).toLowerCase())) {
          await prisma.configItem.create({
            data: { type: "AFFILIATION", name: String(b.affiliation), isActive: true },
          });
          affiliationNames.add(String(b.affiliation).toLowerCase());
        }

        const needsReview = reasons.length > 0;
        if (needsReview) flagged++;

        const novo = await prisma.client.create({
          data: {
            protocolNumber: b.protocolNumber || "Pendente",
            registrationCode: matricula,
            fullNameEnc: encryptField(b.fullName),
            whatsappEnc: encryptField(b.whatsapp),
            birthDateEnc: encryptField(b.birthDate),
            emergencyContactNameEnc: encryptField(b.emergencyContactName),
            emergencyContactPhoneEnc: encryptField(b.emergencyContactPhone),
            emergencyContactRelationshipEnc: encryptField(b.emergencyContactRelationship),
            residenceCityNeighborhoodEnc: encryptField(b.residenceCityNeighborhood),
            helpRequestEnc: encryptField(b.helpRequest),
            medicationsEnc: encryptField(b.medications),
            // Diagnóstico/CID é dado de saúde: criptografado como o restante.
            diagnosisEnc: encryptField(b.diagnosis),
            contactObservationsEnc: encryptField(b.contactObservations),
            affiliation: b.affiliation || "",
            allocation: b.allocation || "",
            dependencyType: b.dependencyType,
            extension: b.extension,
            alescEntryDate: parseDateInput(b.alescEntryDate) ?? undefined,
            dateIncluded: parseDateInput(b.dateIncluded) ?? new Date(),
            status: "FILA_ESPERA",
            sector: b.sector,
            workShift: b.workShift,
            whatsappAuthorized: b.whatsappAuthorized,
            previouslyAttended: b.previouslyAttended,
            contactMadeByName: b.contactMadeByName,
            contactDate: parseDateInput(b.contactDate) ?? undefined,
            contactStatus: b.contactStatus,
            needsReview,
            reviewNotes: needsReview ? reasons.join(" ") : null,
            importBatchId,
          },
        });

        // Atualiza os índices para que duplicatas DENTRO da mesma planilha
        // também sejam detectadas.
        if (matricula) porMatricula.set(matricula, novo.protocolNumber);
        porNome.set(nomeNorm, novo.protocolNumber);

        await writeHistory({
          clientId: novo.id,
          actor: actorOf(session),
          category: "FLUXO",
          action: "Caso criado por importação de planilha",
          details: `Origem: ${sourceLabel}. Linha ${b.sourceRowNumber ?? i + 1}.` +
            (needsReview ? ` Marcado para revisão: ${reasons.join(" ")}` : ""),
        });
        created++;
      } catch (err: any) {
        errors.push({ row: b.sourceRowNumber ?? i + 1, error: err?.message || "Erro desconhecido." });
      }
    }

    res.json({ created, flagged, errors, importBatchId });
  })
);

function normalizeName(name: string): string {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Desfaz uma importação inteira (só o que aquele lote criou). */
app.delete(
  "/api/clients/import/:batchId",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const batchId = req.params.batchId;

    // Trava de segurança: se algum paciente do lote já recebeu atendimento,
    // apagar destruiria registro clínico. Nesse caso, recusamos.
    const comProntuario = await prisma.sessionRecord.count({
      where: { client: { importBatchId: batchId }, isDraft: false },
    });
    if (comProntuario > 0) {
      res.status(409).json({
        error: `Não é possível desfazer: ${comProntuario} atendimento(s) já foram registrados para pacientes deste lote.`,
      });
      return;
    }
    const result = await prisma.client.deleteMany({ where: { importBatchId: batchId } });
    res.json({ deleted: result.count });
  })
);

/** Marca um cadastro importado como revisado. */
app.post(
  "/api/clients/:id/mark-reviewed",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { needsReview: false, reviewNotes: null },
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });
    await writeHistory({
      clientId: client.id,
      actor: actorOf(session),
      category: "CADASTRO",
      action: "Cadastro importado conferido e liberado",
    });
    res.json({ client: mapClient(client) });
  })
);

/**
 * Atualização do cadastro do paciente.
 *
 * Três regras novas concentradas aqui:
 *  (4) Troca do profissional responsável só por SUPERVISOR ou ADMIN, com
 *      justificativa obrigatória e migração dos agendamentos futuros.
 *  (6) Toda alteração gera trilha de auditoria com o NOME DOS CAMPOS alterados
 *      (nunca os valores).
 *  (+) Encerramento do caso calcula e grava o prazo de guarda do registro
 *      documental (Res. CFP nº 001/2009).
 */
app.patch(
  "/api/clients/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await hasRegistrationAccess(session, req.params.id))) {
      denyRegistration(res);
      return;
    }

    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { assignedPsico: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Paciente não encontrado." });
      return;
    }

    const b = { ...(req.body ?? {}) };
    const data: any = {};

    // ---------------------------------------------------------------------
    // RBAC — TRANSFERÊNCIA DE PROFISSIONAL RESPONSÁVEL
    // ---------------------------------------------------------------------
    let transfer: { fromName: string; toName: string; reason: string; toId: string | null } | null = null;

    if ("assignedPsicoId" in b) {
      const nextId: string | null = b.assignedPsicoId || null;
      const isChange = (existing.assignedPsicoId ?? null) !== nextId;

      if (isChange) {
        const canTransfer = session.role === "SUPERVISOR" || session.role === "ADMIN";
        // Exceção estritamente delimitada: primeira atribuição de um caso que
        // ainda não tem responsável (fluxo de agendamento pela própria agenda).
        const isFirstAssignment = !existing.assignedPsicoId && nextId === session.userId;

        if (!canTransfer && !isFirstAssignment) {
          res.status(403).json({
            error:
              "Somente Supervisor e Administrativo podem transferir um paciente entre profissionais.",
          });
          return;
        }

        if (canTransfer && existing.assignedPsicoId) {
          const reason = String(b.transferReason ?? "").trim();
          if (reason.length < 10) {
            res.status(400).json({
              error:
                "Informe a justificativa da transferência (mínimo de 10 caracteres). Ela fica registrada na trilha de auditoria.",
            });
            return;
          }
          const target = nextId
            ? await prisma.user.findUnique({ where: { id: nextId }, select: { name: true, role: true, crp: true } })
            : null;
          if (nextId && (!target || (target.role !== "PSICO" && target.role !== "SUPERVISOR"))) {
            res.status(400).json({ error: "O responsável precisa ser um profissional de psicologia." });
            return;
          }
          if (nextId && target && !target.crp) {
            res.status(400).json({
              error: "O profissional escolhido está sem CRP cadastrado e não pode assumir pacientes.",
            });
            return;
          }
          transfer = {
            fromName: existing.assignedPsico?.name ?? "Não atribuído",
            toName: target?.name ?? "Não atribuído",
            reason,
            toId: nextId,
          };
        }
        data.assignedPsicoId = nextId;
      }
    }

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
      tags: "tags",
      sector: "sector",
      workShift: "workShift",
      whatsappAuthorized: "whatsappAuthorized",
      previouslyAttended: "previouslyAttended",
      contactMadeByName: "contactMadeByName",
      contactStatus: "contactStatus",
      extension: "extension",
    };
    for (const key of Object.keys(plain)) {
      if (key in b) data[key] = b[key];
    }
    if ("dateIncluded" in b) data.dateIncluded = parseDateInput(b.dateIncluded) ?? undefined;
    if ("contactDate" in b) data.contactDate = parseDateInput(b.contactDate);
    if ("fullName" in b) data.fullNameEnc = encryptField(b.fullName);
    if ("whatsapp" in b) data.whatsappEnc = encryptField(b.whatsapp);
    if ("birthDate" in b) data.birthDateEnc = encryptField(b.birthDate);
    if ("emergencyContactName" in b) data.emergencyContactNameEnc = encryptField(b.emergencyContactName);
    if ("emergencyContactPhone" in b) data.emergencyContactPhoneEnc = encryptField(b.emergencyContactPhone);
    if ("emergencyContactRelationship" in b) data.emergencyContactRelationshipEnc = encryptField(b.emergencyContactRelationship);
    if ("residenceCityNeighborhood" in b) data.residenceCityNeighborhoodEnc = encryptField(b.residenceCityNeighborhood);
    if ("helpRequest" in b) data.helpRequestEnc = encryptField(b.helpRequest);
    if ("medications" in b) data.medicationsEnc = encryptField(b.medications);
    if ("contactObservations" in b) data.contactObservationsEnc = encryptField(b.contactObservations);
    // Diagnóstico/CID: dado de saúde, criptografado como os demais sensíveis.
    if ("diagnosis" in b) data.diagnosisEnc = encryptField(b.diagnosis);
    if ("alescEntryDate" in b) data.alescEntryDate = parseDateInput(b.alescEntryDate);

    // Encerramento do caso: registra a data e calcula o prazo de guarda.
    let retentionNote: string | null = null;
    if (data.status === "FINALIZADO" && existing.status !== "FINALIZADO") {
      const finalizedAt = new Date();
      const retentionUntil = computeRetentionUntil(finalizedAt, decryptField(existing.birthDateEnc));
      data.finalizedAt = finalizedAt;
      data.retentionUntil = retentionUntil;
      retentionNote = describeRetention(retentionUntil, decryptField(existing.birthDateEnc));
    }
    if (data.status && data.status !== "FINALIZADO" && existing.status === "FINALIZADO") {
      data.finalizedAt = null;
      data.retentionUntil = null;
    }

    // Diferença ANTES de gravar — precisamos do estado anterior para comparar.
    const changedLabels = diffChangedFieldLabels(existing, b);

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data,
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });

    // --------------------------- AUDITORIA ---------------------------------
    if (transfer) {
      await logClientTransfer(
        client.id,
        actorOf(session),
        transfer.fromName,
        transfer.toName,
        transfer.reason
      );

      // Agendamentos futuros seguem com o paciente (decisão de negócio).
      const migrated = transfer.toId
        ? await prisma.appointment.updateMany({
            where: { clientId: client.id, date: { gte: startOfToday() } },
            data: { psicoId: transfer.toId },
          })
        : { count: 0 };

      if (migrated.count > 0) {
        await writeHistory({
          clientId: client.id,
          actor: actorOf(session),
          category: "TRANSFERENCIA",
          action: "Agendamentos futuros migrados para o novo profissional",
          details: `${migrated.count} agendamento(s) futuro(s) transferido(s).`,
        });
      }
    }

    const nonTransferLabels = changedLabels.filter((l) => l !== "Profissional responsável");
    await logClientFieldChanges(client.id, actorOf(session), nonTransferLabels);

    if (b.logAction) {
      // Ação explícita vinda da interface (ex.: reativação de caso).
      await writeHistory({
        clientId: client.id,
        actor: actorOf(session),
        category: "FLUXO",
        action: String(b.logAction),
        details: b.logDetails ? String(b.logDetails) : null,
      });
    }

    if (retentionNote) {
      await writeHistory({
        clientId: client.id,
        actor: actorOf(session),
        category: "SISTEMA",
        action: "Caso encerrado — prazo de guarda definido",
        details: retentionNote,
      });
    }

    res.json({
      client: mapClient(client, { includeClinical: await hasClinicalAccess(session, client.id) }),
    });
  })
);

function startOfToday(): Date {
  const now = new Date();
  const dateOnly = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return startOfDayBRT(dateOnly) ?? now;
}

/**
 * Trilha de auditoria do paciente (escrita).
 * Leitura restrita a Supervisor e Administrativo, conforme definido com o setor.
 */
app.get(
  "/api/clients/:id/history",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const logs = await prisma.historyLog.findMany({
      where: { clientId: req.params.id },
      include: { actor: true },
      orderBy: { date: "desc" },
      take: 500,
    });
    await logAccess({
      actor: actorOf(session),
      action: "LEITURA_TRILHA_AUDITORIA",
      resource: "historico_paciente",
      clientId: req.params.id,
      ip: clientIp(req),
    });
    res.json({ history: logs.map(mapHistoryLog) });
  })
);

/** Trilha de ACESSO (quem leu/exportou) — mesma restrição de leitura. */
app.get(
  "/api/clients/:id/access-log",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const logs = await prisma.accessLog.findMany({
      where: { clientId: req.params.id },
      include: { actor: true },
      orderBy: { at: "desc" },
      take: 300,
    });
    res.json({ accessLog: logs.map(mapAccessLog) });
  })
);

/** Registra a abertura do prontuário (trilha de leitura de dado sensível). */
app.post(
  "/api/clients/:id/register-access",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await hasClinicalAccess(session, req.params.id))) {
      denyClinical(res);
      return;
    }
    await logAccess({
      actor: actorOf(session),
      action: "ABERTURA_DE_PRONTUARIO",
      resource: String(req.body?.resource ?? "prontuario"),
      clientId: req.params.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  })
);

/** Registra a exportação de um PDF (documento psicológico ou prontuário). */
app.post(
  "/api/clients/:id/document-export",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await hasClinicalAccess(session, req.params.id))) {
      denyClinical(res);
      return;
    }
    const label = String(req.body?.documentLabel ?? "Documento").slice(0, 120);
    await logDocumentEvent(req.params.id, actorOf(session), label, "EXPORTACAO");
    await logAccess({
      actor: actorOf(session),
      action: "EXPORTACAO_PDF",
      resource: label,
      clientId: req.params.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
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
    if (!(await hasClinicalAccess(session, b.clientId))) {
      denyClinical(res);
      return;
    }

    if (b.id) {
      const existing = await prisma.sessionRecord.findUnique({ where: { id: b.id } });
      if (existing) {
        const data: any = {
          notesEnc: encryptField(b.notes ?? ""),
          isDraft: b.isDraft ?? false,
        };
        if (b.attendance !== undefined) data.attendance = b.attendance;
        // Anotação privada: só o autor da sessão escreve na dele.
        if ("privateNotes" in b && existing.psicoId === session.userId) {
          data.privateNotesEnc = encryptField(b.privateNotes);
        }
        if (existing.notesEnc) {
          data.versions = { create: [{ oldContentEnc: existing.notesEnc }] };
        }
        const updated = await prisma.sessionRecord.update({
          where: { id: b.id },
          data,
          include: { versions: true },
        });
        await maybeIncrementCompletedSessions(
          existing.clientId,
          existing.isDraft && !existing.appointmentId,
          updated.isDraft
        );
        // Metainformação apenas — o texto do prontuário NUNCA entra no log.
        await logClinicalRecord(
          existing.clientId,
          actorOf(session),
          existing.isDraft && !updated.isDraft ? "REGISTRO" : updated.isDraft ? "RASCUNHO" : "RETIFICACAO",
          new Date()
        );
        res.status(200).json({ session: mapSession(updated, session.userId) });
        return;
      }
    }

    const created = await prisma.sessionRecord.create({
      data: {
        clientId: b.clientId,
        psicoId: b.psicoId || session.userId,
        date: parseDateInput(b.date) ?? new Date(),
        notesEnc: encryptField(b.notes ?? ""),
        privateNotesEnc: encryptField(b.privateNotes ?? ""),
        isDraft: b.isDraft ?? false,
        status: b.status,
        groupId: b.groupId,
        appointmentId: b.appointmentId,
        attendance: b.attendance,
      },
      include: { versions: true },
    });
    await maybeIncrementCompletedSessions(created.clientId, !created.appointmentId, created.isDraft);
    await logClinicalRecord(
      created.clientId,
      actorOf(session),
      created.isDraft ? "RASCUNHO" : "REGISTRO",
      new Date()
    );
    res.status(201).json({ session: mapSession(created, session.userId) });
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
    if (!(await hasClinicalAccess(session, existing.clientId))) {
      denyClinical(res);
      return;
    }
    const b = req.body ?? {};
    const data: any = {};

    if ("notes" in b && existing.notesEnc) {
      data.versions = { create: [{ oldContentEnc: existing.notesEnc }] };
    }
    if ("notes" in b) data.notesEnc = encryptField(b.notes);

    // Anotação privada: exclusiva do autor da sessão. Se outra pessoa tentar
    // (inclusive Supervisor), respondemos 403 em vez de ignorar em silêncio —
    // ignorar sem avisar faz o usuário achar que salvou algo que não salvou.
    if ("privateNotes" in b) {
      if (existing.psicoId !== session.userId) {
        res.status(403).json({
          error: "A anotação privada pertence exclusivamente ao profissional que realizou o atendimento.",
        });
        return;
      }
      data.privateNotesEnc = encryptField(b.privateNotes);
    }

    if ("isDraft" in b) data.isDraft = b.isDraft;
    if ("status" in b) data.status = b.status;
    if ("attendance" in b) data.attendance = b.attendance;

    const updated = await prisma.sessionRecord.update({
      where: { id: req.params.id },
      data,
      include: { versions: true },
    });
    await maybeIncrementCompletedSessions(
      existing.clientId,
      existing.isDraft && !existing.appointmentId,
      updated.isDraft
    );

    // Anotação privada isolada não é evento de prontuário: não gera entrada
    // clínica na trilha (ela não compõe o prontuário oficial).
    const touchedOfficialRecord = "notes" in b || "isDraft" in b || "attendance" in b;
    if (touchedOfficialRecord) {
      await logClinicalRecord(
        existing.clientId,
        actorOf(session),
        existing.isDraft && !updated.isDraft ? "REGISTRO" : updated.isDraft ? "RASCUNHO" : "RETIFICACAO",
        new Date()
      );
    }

    res.json({ session: mapSession(updated, session.userId) });
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
        date: parseLocalDateTime(b.date, b.time) ?? new Date(),
        time: b.time,
        endTime: b.endTime,
        seriesId: b.seriesId,
        recurrence: b.recurrence,
        sessionNumber: b.sessionNumber,
      },
    });

    if (appt.clientId) {
      await prisma.sessionRecord.create({
        data: {
          clientId: appt.clientId,
          psicoId: appt.psicoId,
          date: parseLocalDateTime(b.date, b.time) ?? new Date(),
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
            sessionDate: parseLocalDateTime(b.date, b.time) ?? new Date(),
            contentEnc: "",
            isDraft: true,
          },
        });
      }
    }

    res.status(201).json({ appointment: mapAppointment(appt) });
  })
);

/**
 * Edição de agendamento.
 *
 * Novidade: `applyToFuture`. Ao mudar dia da semana, horário ou sala de um
 * atendimento recorrente, é possível propagar a mudança para todas as
 * ocorrências futuras da mesma série — sem tocar no que já aconteceu
 * (histórico de agenda é registro, não se reescreve).
 */
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

    // Trocar o profissional de um agendamento equivale a transferir o
    // atendimento: mesma regra do item 4.
    if ("psicoId" in b && b.psicoId !== existing.psicoId) {
      if (session.role !== "SUPERVISOR" && session.role !== "ADMIN") {
        res.status(403).json({
          error: "Somente Supervisor e Administrativo podem passar um atendimento para outro profissional.",
        });
        return;
      }
    }

    const data: any = {};
    for (const key of ["roomId", "time", "endTime", "recurrence", "sessionNumber", "attendance", "psicoId", "seriesId"]) {
      if (key in b) data[key] = b[key];
    }
    if ("clientId" in b) data.clientId = b.clientId || null;
    if ("groupId" in b) data.groupId = b.groupId || null;
    if ("date" in b) data.date = parseLocalDateTime(b.date, b.time ?? existing.time) ?? existing.date;

    const updated = await prisma.appointment.update({ where: { id: req.params.id }, data });

    // Propagação para as ocorrências futuras da mesma série.
    let futureUpdated = 0;
    if (b.applyToFuture && existing.seriesId) {
      const shiftDays = "date" in b ? diffInDays(existing.date, updated.date) : 0;
      const siblings = await prisma.appointment.findMany({
        where: { seriesId: existing.seriesId, date: { gt: existing.date } },
      });
      for (const sib of siblings) {
        const sibData: any = {};
        if ("time" in b) sibData.time = b.time;
        if ("endTime" in b) sibData.endTime = b.endTime;
        if ("roomId" in b) sibData.roomId = b.roomId;
        if ("psicoId" in b) sibData.psicoId = b.psicoId;
        if (shiftDays !== 0) {
          const moved = new Date(sib.date.getTime());
          moved.setDate(moved.getDate() + shiftDays);
          sibData.date = moved;
        }
        if (Object.keys(sibData).length > 0) {
          await prisma.appointment.update({ where: { id: sib.id }, data: sibData });
          futureUpdated++;
        }
      }
    }

    if ("attendance" in data && updated.clientId) {
      await maybeIncrementCompletedSessionsOnAttendance(updated.clientId, existing.attendance, updated.attendance);
    }

    res.json({ appointment: mapAppointment(updated), futureUpdated });
  })
);

function diffInDays(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / MS);
}
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

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
    if (session.role === "ADMIN") {
      res.status(403).json({ error: "O perfil Administrativo não conduz grupos terapêuticos." });
      return;
    }
    const b = req.body ?? {};
    const psychologistId = b.psychologistId || session.userId;
    const responsible = await prisma.user.findUnique({
      where: { id: psychologistId },
      select: { role: true, crp: true },
    });
    if (!responsible || (responsible.role !== "PSICO" && responsible.role !== "SUPERVISOR")) {
      res.status(400).json({ error: "O responsável pelo grupo precisa ser um profissional de psicologia." });
      return;
    }
    if (!responsible.crp) {
      res.status(400).json({ error: "O profissional responsável está sem CRP cadastrado." });
      return;
    }
    const group = await prisma.group.create({
      data: {
        name: b.name,
        objective: b.objective,
        methodology: b.methodology,
        frequency: b.frequency,
        criteria: b.criteria,
        psychologistId,
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
    if (!(await hasGroupAccess(session, req.params.id))) {
      res.status(403).json({ error: "Somente o psicólogo responsável pelo grupo (ou o Supervisor) pode editá-lo." });
      return;
    }
    const b = req.body ?? {};
    const data: any = {};
    for (const key of ["name", "objective", "methodology", "frequency", "criteria", "isActive"]) {
      if (key in b) data[key] = b[key];
    }
    if ("psychologistId" in b && b.psychologistId !== undefined) {
      if (session.role !== "SUPERVISOR" && session.role !== "ADMIN") {
        res.status(403).json({ error: "Somente Supervisor e Administrativo podem trocar o responsável pelo grupo." });
        return;
      }
      data.psychologistId = b.psychologistId;
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

    if (!(await hasGroupAccess(session, b.groupId))) {
      res.status(403).json({
        error: "Somente o psicólogo responsável pelo grupo (ou o Supervisor) pode registrar esta sessão.",
      });
      return;
    }

    const attendanceList: Array<{ clientId: string; status: string }> = Array.isArray(b.attendance) ? b.attendance : [];

    async function saveAttendance(groupRecordId: string) {
      for (const a of attendanceList) {
        await prisma.groupAttendance.upsert({
          where: { groupRecordId_clientId: { groupRecordId, clientId: a.clientId } },
          update: { status: a.status },
          create: { groupRecordId, clientId: a.clientId, status: a.status },
        });
      }
    }

    if (b.id) {
      const existing = await prisma.groupRecord.findUnique({ where: { id: b.id } });
      if (existing) {
        if (!(await hasGroupAccess(session, existing.groupId))) {
          res.status(403).json({ error: "Somente o psicólogo responsável pelo grupo (ou o Supervisor) pode editar esta sessão." });
          return;
        }
        const updated = await prisma.groupRecord.update({
          where: { id: b.id },
          data: { contentEnc: encryptField(b.content), isDraft: false },
        });
        await saveAttendance(updated.id);
        const withAttendance = await prisma.groupRecord.findUnique({
          where: { id: updated.id },
          include: { attendances: true },
        });
        res.status(200).json({ groupRecord: mapGroupRecord(withAttendance) });
        return;
      }
    }

    const sessionDate = parseDateInput(b.sessionDate) ?? new Date();
    const existingDraft = await prisma.groupRecord.findFirst({
      where: { groupId: b.groupId, sessionDate, isDraft: true },
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
          sessionDate,
          contentEnc: encryptField(b.content),
          isDraft: false,
        },
      });

      const group = await prisma.group.findUnique({ where: { id: b.groupId }, include: { members: true } });
      if (group) {
        for (const member of group.members) {
          await prisma.sessionRecord.create({
            data: {
              clientId: member.clientId,
              psicoId: record.authorId,
              date: parseLocalDateTime(String(b.sessionDate), "12:00") ?? sessionDate,
              notesEnc: "",
              isDraft: true,
              status: "PENDENTE",
              groupId: group.id,
            },
          });
          await writeHistory({
            clientId: member.clientId,
            actor: actorOf(session),
            category: "CLINICO",
            action: "Prontuário individual pendente gerado a partir de sessão de grupo",
            details: `Grupo: ${group.name}.`,
          });
        }
      }
    }
    await saveAttendance(record.id);
    const recordWithAttendance = await prisma.groupRecord.findUnique({
      where: { id: record.id },
      include: { attendances: true },
    });
    res.status(201).json({ groupRecord: mapGroupRecord(recordWithAttendance) });
  })
);

// ---------------------------------------------------------------------------
// CONFIG
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

/**
 * CRP obrigatório para SUPERVISOR e PSICO.
 * O Supervisor passou a atender pacientes, e todo documento psicológico
 * precisa ser assinado com nome e CRP (Resolução CFP nº 06/2019). Sem CRP no
 * cadastro, o atestado sairia sem identificação profissional válida.
 */
function crpProblem(role: string, crp: unknown): string | null {
  if (role !== "PSICO" && role !== "SUPERVISOR") return null;
  const value = String(crp ?? "").trim();
  if (!value) return "CRP é obrigatório para Psicólogo e Supervisor.";
  if (!/^\d{2}\/\d{4,6}$/.test(value)) return "Informe o CRP no formato 00/00000.";
  return null;
}

/** Senha provisória forte gerada no servidor (nunca no navegador). */
function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(14);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out}9a`;
}

app.post(
  "/api/users",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const b = req.body ?? {};
    if (!b.name || !b.email) {
      res.status(400).json({ error: "Nome e e-mail são obrigatórios." });
      return;
    }
    const problem = crpProblem(b.role, b.crp);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    // A senha provisória é gerada no servidor, entregue UMA única vez na
    // resposta e obriga troca no primeiro acesso.
    const temporaryPassword = generateTemporaryPassword();

    const user = await prisma.user.create({
      data: {
        name: b.name,
        email: String(b.email).toLowerCase().trim(),
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        role: b.role,
        crp: b.crp ? String(b.crp).trim() : null,
        title: b.title,
        institutionalLink: b.institutionalLink,
        birthDate: parseDateInput(b.birthDate) ?? undefined,
        matricula: b.matricula,
        color: b.color,
        capacity: b.capacity,
      },
    });
    res.status(201).json({ user: mapUser(user), temporaryPassword });
  })
);

app.patch(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const isSelf = session.userId === req.params.id;
    const isManager = session.role === "SUPERVISOR" || session.role === "ADMIN";
    if (!isSelf && !isManager) {
      res.status(403).json({ error: "Sem permissão." });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const b = req.body ?? {};
    const data: any = {};
    for (const key of ["name", "email", "title", "institutionalLink", "matricula", "color", "capacity"]) {
      if (key in b) data[key] = b[key];
    }
    if ("birthDate" in b) data.birthDate = parseDateInput(b.birthDate);

    if (isManager) {
      const nextRole = "role" in b ? b.role : target.role;
      const nextCrp = "crp" in b ? b.crp : target.crp;
      const problem = crpProblem(nextRole, nextCrp);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      if ("role" in b) data.role = b.role;
      if ("crp" in b) data.crp = b.crp ? String(b.crp).trim() : null;
    }

    /**
     * Redefinição de senha por gestor: gera uma senha provisória, devolvida
     * uma única vez, e volta a exigir troca no primeiro acesso.
     * Ninguém "escolhe a senha de outra pessoa": isso quebraria o não-repúdio
     * da assinatura do prontuário.
     */
    let temporaryPassword: string | undefined;
    if (b.resetPassword) {
      if (!isManager) {
        res.status(403).json({ error: "Sem permissão para redefinir a senha de outro usuário." });
        return;
      }
      temporaryPassword = generateTemporaryPassword();
      data.passwordHash = await hashPassword(temporaryPassword);
      data.mustChangePassword = true;
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: mapUser(user), temporaryPassword });
  })
);

app.delete(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    if (session.userId === req.params.id) {
      res.status(400).json({ error: "Você não pode excluir o seu próprio usuário." });
      return;
    }
    // Um profissional com pacientes atribuídos não pode simplesmente sumir:
    // o vínculo do caso ficaria órfão e a trilha de auditoria, quebrada.
    const assigned = await prisma.client.count({ where: { assignedPsicoId: req.params.id } });
    if (assigned > 0) {
      res.status(409).json({
        error: `Este profissional ainda é responsável por ${assigned} paciente(s). Transfira os casos antes de excluir o usuário.`,
      });
      return;
    }
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
    const { clientId, purpose, date, description } = req.body ?? {};
    // Aplicação de teste é ato clínico privativo do psicólogo.
    if (!(await hasClinicalAccess(session, clientId))) {
      denyClinical(res);
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
        purposeEnc: encryptField(purpose),
        entries: {
          create: [{ date: parseDateInput(date) ?? new Date(), descriptionEnc: encryptField(description) }],
        },
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

    await writeHistory({
      clientId,
      actor: actorOf(session),
      category: "CLINICO",
      // Metainformação: registra que houve aplicação, sem finalidade nem resultado.
      action: `Instrumento/teste aplicado (Protocolo: ${client.protocolNumber})`,
    });

    const updatedClient = await prisma.client.findUnique({
      where: { id: clientId },
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });
    res.json({ client: mapClient(updatedClient, { includeClinical: true }) });
  })
);

app.post(
  "/api/instrument-applications/:id/entries",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const application = await prisma.instrumentApplication.findUnique({ where: { id: req.params.id } });
    if (!application) {
      res.status(404).json({ error: "Aplicação não encontrada." });
      return;
    }
    if (!(await hasClinicalAccess(session, application.clientId))) {
      denyClinical(res);
      return;
    }
    const { date, description } = req.body ?? {};
    await prisma.instrumentApplicationEntry.create({
      data: {
        applicationId: application.id,
        date: parseDateInput(date) ?? new Date(),
        descriptionEnc: encryptField(description),
      },
    });
    const updatedClient = await prisma.client.findUnique({
      where: { id: application.clientId },
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });
    res.json({ client: mapClient(updatedClient, { includeClinical: true }) });
  })
);

app.patch(
  "/api/instrument-applications/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const application = await prisma.instrumentApplication.findUnique({ where: { id: req.params.id } });
    if (!application) {
      res.status(404).json({ error: "Aplicação não encontrada." });
      return;
    }
    if (!(await hasClinicalAccess(session, application.clientId))) {
      denyClinical(res);
      return;
    }
    const b = req.body ?? {};
    if ("purpose" in b) {
      await prisma.instrumentApplication.update({
        where: { id: application.id },
        data: { purposeEnc: encryptField(b.purpose) },
      });
    }
    if (b.entry?.id) {
      const data: any = {};
      if ("date" in b.entry) data.date = parseDateInput(b.entry.date);
      if ("description" in b.entry) data.descriptionEnc = encryptField(b.entry.description);
      await prisma.instrumentApplicationEntry.update({ where: { id: b.entry.id }, data }).catch(() => {});
    }
    const updatedClient = await prisma.client.findUnique({
      where: { id: application.clientId },
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });
    res.json({ client: mapClient(updatedClient, { includeClinical: true }) });
  })
);

// ---------------------------------------------------------------------------
// CLINICAL DOCUMENTS
// ---------------------------------------------------------------------------

const DOCUMENT_LABELS: Record<string, string> = {
  ANAMNESE_RISCO: "Anamnese e avaliação de risco",
  URGENCIA: "Atendimento de urgência",
  ATESTADO: "Atestado psicológico",
};

app.post(
  "/api/clinical-documents",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const b = req.body ?? {};
    if (!b.clientId || !b.type) {
      res.status(400).json({ error: "clientId e type são obrigatórios." });
      return;
    }
    if (!(await hasClinicalAccess(session, b.clientId))) {
      denyClinical(res);
      return;
    }
    // Documento psicológico é ato privativo: exige CRP do autor
    // (Resolução CFP nº 06/2019 — assinatura com nome e CRP).
    const author = await prisma.user.findUnique({ where: { id: session.userId }, select: { crp: true } });
    if (!author?.crp) {
      res.status(400).json({
        error: "Seu cadastro está sem CRP. Documentos psicológicos precisam ser assinados com nome e CRP.",
      });
      return;
    }
    const created = await prisma.clinicalDocument.create({
      data: {
        clientId: b.clientId,
        type: b.type,
        authorId: session.userId,
        dataEnc: encryptField(JSON.stringify(b.data ?? {})),
      },
      include: { author: true },
    });
    await logDocumentEvent(
      b.clientId,
      actorOf(session),
      DOCUMENT_LABELS[String(b.type)] ?? "Documento psicológico",
      "EMISSAO"
    );
    res.status(201).json({ clinicalDocument: mapClinicalDocument(created) });
  })
);

app.patch(
  "/api/clinical-documents/:id",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const existing = await prisma.clinicalDocument.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Documento não encontrado." });
      return;
    }
    if (!(await hasClinicalAccess(session, existing.clientId))) {
      denyClinical(res);
      return;
    }
    const b = req.body ?? {};
    const updated = await prisma.clinicalDocument.update({
      where: { id: req.params.id },
      data: { dataEnc: encryptField(JSON.stringify(b.data ?? {})) },
      include: { author: true },
    });
    await writeHistory({
      clientId: existing.clientId,
      actor: actorOf(session),
      category: "DOCUMENTO",
      action: `${DOCUMENT_LABELS[String(existing.type)] ?? "Documento psicológico"} alterado`,
    });
    res.json({ clinicalDocument: mapClinicalDocument(updated) });
  })
);

// ---------------------------------------------------------------------------
// GROUP CLIENT NOTES
// ---------------------------------------------------------------------------

app.post(
  "/api/group-client-notes",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { clientId, groupId, content } = req.body ?? {};
    if (!clientId || !groupId) {
      res.status(400).json({ error: "clientId e groupId são obrigatórios." });
      return;
    }
    if (!(await hasGroupAccess(session, groupId))) {
      res.status(403).json({ error: "Somente o psicólogo responsável pelo grupo pode registrar esta anotação." });
      return;
    }
    const member = await prisma.groupMember
      .findUnique({ where: { groupId_clientId: { groupId, clientId } } })
      .catch(() => null);
    if (!member) {
      res.status(400).json({ error: "Este paciente não é membro deste grupo." });
      return;
    }
    const note = await prisma.groupClientNote.upsert({
      where: { groupId_clientId_authorId: { groupId, clientId, authorId: session.userId } },
      update: { contentEnc: encryptField(content) },
      create: { groupId, clientId, authorId: session.userId, contentEnc: encryptField(content) },
    });
    res.json({ groupClientNote: mapGroupClientNote(note) });
  })
);

/**
 * Métricas de triagem por profissional, em formato AGREGADO.
 *
 * A tela de Métricas derivava esses números percorrendo o histórico completo
 * de todos os pacientes, que antes vinha inteiro no /api/bootstrap. Como a
 * trilha de auditoria deixou de ser trafegada em massa (minimização — LGPD
 * Art. 6º, III), o cálculo passou para o servidor e só o resultado agregado
 * volta: contagens por nome de profissional, sem identificar paciente algum.
 */
app.get(
  "/api/metrics/triagem",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;

    const from = parseDateInput(req.query.from as string);
    const to = parseDateInput(req.query.to as string);

    const logs = await prisma.historyLog.findMany({
      where: {
        category: "FLUXO",
        ...(from || to
          ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { actor: { select: { name: true } } },
      take: 5000,
    });

    const byPsico = new Map<string, { name: string; triagem: number; triados: number }>();
    for (const log of logs) {
      const name = log.actor?.name ?? "—";
      const isTriagem = /TRIAGEM/i.test(log.action);
      const isTriados = /TRIADOS/i.test(log.action);
      if (!isTriagem && !isTriados) continue;
      const current = byPsico.get(name) ?? { name, triagem: 0, triados: 0 };
      if (isTriagem) current.triagem++;
      if (isTriados) current.triados++;
      byPsico.set(name, current);
    }

    res.json({ rows: Array.from(byPsico.values()) });
  })
);

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
