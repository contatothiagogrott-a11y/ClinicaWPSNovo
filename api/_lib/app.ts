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
import {
  isPushConfigured, getPublicKey, sendToUser,
  lembreteDeAtendimento, resumoDoDia, pacienteAtribuido,
} from "./push.js";
import { checkRateLimit, registerFailure, registerSuccess, rateLimitKey } from "./rateLimit.js";
import { parseDateInput, parseLocalDateTime, startOfDayBRT, formatBR } from "./datetime.js";
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
  mapClientWaitlistSummary,
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

/**
 * Acesso ao conteúdo de UMA sessão específica.
 *
 * Diferente de `hasClinicalAccess` (que é por paciente): aqui a fronteira é o
 * CONTEXTO do atendimento. Sessão de grupo pertence a quem conduz o grupo.
 */
async function hasSessionAccess(
  session: { userId: string; role: AppRole },
  record: { clientId: string; groupId: string | null; psicoId: string }
): Promise<boolean> {
  if (session.role === "ADMIN") return false;
  if (session.role === "SUPERVISOR") return true;
  if (record.psicoId === session.userId) return true; // autor da sessão
  if (record.groupId) return hasGroupAccess(session, record.groupId);
  return hasClinicalAccess(session, record.clientId);
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
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { psychologistId: true, coPsychologistId: true },
  });
  if (!group) return false;
  // Ambos os condutores respondem pelo prontuário do grupo.
  return group.psychologistId === session.userId || group.coPsychologistId === session.userId;
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
/**
 * Contador de sessões REALIZADAS — SOMENTE atendimento individual.
 *
 * Fechar o rascunho não significa que houve sessão. Falta, cancelamento e
 * reagendamento também encerram o registro — e estavam sendo contados como
 * atendimento realizado, inflando o consumo do pacote do paciente.
 *
 * Só conta quando houve de fato o encontro.
 *
 * DECISÃO DO SETOR (corrigida aqui): sessão de grupo NÃO consome o pacote de
 * sessões previstas — esse espaço é do acompanhamento individual. A presença
 * ou falta na sessão de grupo continua sendo registrada normalmente (no
 * próprio `SessionRecord.attendance`, para fins de métrica), só não soma
 * neste contador. A contagem de sessões de grupo é calculada à parte, por
 * grupo, direto a partir dos registros — ver GET /api/groups em `mapGroup`
 * e o uso em `GroupProfile.tsx` — para não recriar outro contador solto no
 * banco (foi exatamente esse tipo de contador que causou o bug anterior).
 */
async function maybeIncrementCompletedSessions(
  clientId: string,
  wasDraft: boolean,
  isNowDraft: boolean,
  attendance?: string | null,
  groupId?: string | null
) {
  if (groupId) return;

  const naoHouveEncontro =
    attendance &&
    ["FALTA_JUSTIFICADA", "FALTA_INJUSTIFICADA", "CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"]
      .includes(attendance);
  if (naoHouveEncontro) return;

  if (wasDraft && !isNowDraft) {
    await prisma.client.update({ where: { id: clientId }, data: { completedSessions: { increment: 1 } } });
  }
}

/**
 * Idem, para a mudança de presença feita diretamente no AGENDAMENTO (tela de
 * agenda, botão "Compareceu"). Mesma regra: agendamento de GRUPO (sem
 * `clientId`, ou vinculado a `groupId`) nunca chega a chamar esta função hoje
 * (ver PATCH /api/appointments/:id, que só a chama quando `clientId` existe),
 * mas o parâmetro é mantido explícito para não depender desse detalhe do
 * chamador — se algum dia o agendamento de grupo passar a usar este caminho,
 * a exclusão continua garantida aqui.
 */
async function maybeIncrementCompletedSessionsOnAttendance(
  clientId: string,
  wasAttendance: string | null,
  isNowAttendance: string | null,
  groupId?: string | null
) {
  if (groupId) return;
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

    // Grupos que este profissional conduz — como responsável OU coterapeuta.
    const myLedGroupIds = new Set(
      groupsRaw
        .filter((g: any) => g.psychologistId === session.userId || g.coPsychologistId === session.userId)
        .map((g: any) => g.id)
    );
    const myGroupMemberClientIds = new Set(
      groupsRaw.filter((g: any) => myLedGroupIds.has(g.id)).flatMap((g: any) => g.members.map((m: any) => m.clientId))
    );

    // Quais pacientes este usuário enxerga (nível cadastro).
    /**
     * Pacientes que este profissional acessa.
     *
     * Inclui, além dos seus e dos membros dos seus grupos, quem ele ATENDEU em
     * algum momento — mesmo sendo acompanhado individualmente por outro colega.
     * É o caso da triagem de entrada em grupo: sem isso, o psicólogo escreveria
     * o registro e depois não conseguiria abrir a ficha para relê-lo.
     */
    const idsQueAtendi = new Set<string>(
      sessionsRaw.filter((s: any) => s.psicoId === session.userId).map((s: any) => s.clientId)
    );
    const idsQueAgendei = new Set<string>(
      appointmentsRaw
        .filter((a: any) => a.psicoId === session.userId && a.clientId)
        .map((a: any) => a.clientId)
    );

    const clients = isSupervisorOrAdmin
      ? clientsRaw
      : clientsRaw.filter(
          (c: any) =>
            c.assignedPsicoId === session.userId ||
            myGroupMemberClientIds.has(c.id) ||
            idsQueAtendi.has(c.id) ||
            idsQueAgendei.has(c.id)
        );

    /**
     * FILA DE ESPERA PARA O PSICÓLOGO.
     *
     * Quem está na fila ainda não tem responsável, então o filtro acima o
     * deixava de fora e a tela "Fila de Espera" aparecia VAZIA para os
     * psicólogos — efeito colateral do controle de acesso, não uma regra
     * pedida pelo setor.
     *
     * A correção envia esses casos em versão REDUZIDA: nome, data/hora de
     * entrada (para saber a posição) e contato de urgência. Nada de conteúdo
     * clínico ou de contato pessoal de quem não é paciente dele.
     */
    const idsJaVisiveis = new Set(clients.map((c: any) => c.id));
    const filaReduzida = isSupervisorOrAdmin
      ? []
      : clientsRaw.filter(
          (c: any) =>
            !idsJaVisiveis.has(c.id) &&
            ["FILA_ESPERA", "TRIAGEM", "TRIADOS"].includes(c.status)
        );

    // Quais pacientes este usuário pode ver CLINICAMENTE.
    const clinicalClientIds = new Set<string>(
      isAdmin
        ? []
        : isSupervisor
        ? clientsRaw.map((c: any) => c.id)
        : clients
            .filter(
              (c: any) =>
                c.assignedPsicoId === session.userId ||
                myGroupMemberClientIds.has(c.id) ||
                idsQueAtendi.has(c.id) ||
                idsQueAgendei.has(c.id)
            )
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

    /**
     * SIGILO ENTRE CONTEXTOS DE ATENDIMENTO
     * =====================================
     *
     * Um paciente pode ter, ao mesmo tempo, atendimento individual com A e
     * grupo com B. Cada um é uma relação clínica distinta.
     *
     * O Manual Orientativo do CFP trata o prontuário como único e
     * institucional, mas o setor decidiu — legitimamente, já que a norma
     * permite o acesso sem obrigá-lo — que o prontuário do GRUPO é restrito
     * aos condutores do grupo e ao Supervisor.
     *
     * O psicólogo individual continua SABENDO que o paciente participa de um
     * grupo (o vínculo aparece na ficha), mas não lê o conteúdo daquelas
     * sessões — e o texto sequer sai do servidor para ele.
     */
    /**
     * VAZAMENTO CORRIGIDO.
     *
     * `clinicalClientIds` libera o PACIENTE, e o psicólogo entra nessa lista
     * por conduzir um grupo do qual a pessoa participa. Como a sessão
     * individual não tem `groupId`, ela passava direto pelo filtro anterior —
     * e o condutor do grupo lia a terapia individual conduzida por outro
     * profissional.
     *
     * A fronteira correta é o CONTEXTO de cada sessão, não o paciente:
     *
     *   - autor da sessão            -> lê (é o registro dele)
     *   - sessão de grupo que conduz -> lê
     *   - responsável pelo caso      -> lê as sessões individuais
     *   - Supervisor                 -> lê tudo (supervisão clínica)
     *   - qualquer outro             -> só metadados, sem o texto
     */
    const souResponsavelPor = new Set<string>(
      clientsRaw.filter((c: any) => c.assignedPsicoId === session.userId).map((c: any) => c.id)
    );

    const sessions = visibleSessions.map((s: any) => {
      if (isAdmin) return mapSessionMeta(s);
      if (isSupervisor) return mapSession(s, session.userId);

      // Registro escrito por este profissional: sempre acessível a ele.
      if (s.psicoId === session.userId) return mapSession(s, session.userId);

      // Sessão de grupo: só quem conduz aquele grupo.
      if (s.groupId) {
        return myLedGroupIds.has(s.groupId)
          ? mapSession(s, session.userId)
          : mapSessionMeta(s);
      }

      // Sessão individual: só o profissional responsável pelo caso.
      return souResponsavelPor.has(s.clientId)
        ? mapSession(s, session.userId)
        : mapSessionMeta(s);
    });

    const appointments = isSupervisorOrAdmin
      ? appointmentsRaw
      : appointmentsRaw.filter((a: any) => a.psicoId === session.userId);

    const groups = isSupervisorOrAdmin
      ? groupsRaw
      : groupsRaw.filter(
          (g: any) => g.psychologistId === session.userId || g.coPsychologistId === session.userId
        );

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
      clients: [
        ...clients.map((c: any) =>
          mapClient(c, { includeHistory: false, includeClinical: clinicalClientIds.has(c.id) })
        ),
        ...filaReduzida.map(mapClientWaitlistSummary),
      ],
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
        // Nunca aceita número vindo do navegador: quem numera é o servidor.
        protocolNumber: null,
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

    /**
     * Status de destino da planilha.
     *
     * Listas antigas trazem casos já encerrados. Só três destinos são
     * aceitos na importação: fila de espera (padrão), finalizado (houve
     * atendimento) e cancelado (entrou na fila mas não houve atendimento).
     * Nunca EM_ATENDIMENTO: isso exigiria psicólogo responsável e agenda.
     */
    const STATUS_PERMITIDOS = ["FILA_ESPERA", "FINALIZADO", "CANCELADO"];
    const statusDestino = STATUS_PERMITIDOS.includes(String(req.body?.status))
      ? String(req.body.status)
      : "FILA_ESPERA";
    // O navegador envia a planilha em pedaços e reaproveita o mesmo lote,
    // para que "desfazer importação" continue apagando tudo de uma vez.
    const importBatchId = String(req.body?.importBatchId || crypto.randomUUID());

    if (rows.length === 0) {
      res.status(400).json({ error: "Nenhuma linha para importar." });
      return;
    }
    if (rows.length > 200) {
      res.status(400).json({ error: "Envie no máximo 200 linhas por requisição." });
      return;
    }

    /**
     * DESEMPENHO — por que aqui usamos createMany
     * -------------------------------------------
     * A versão anterior fazia, para CADA linha, um `client.create` seguido de
     * um `historyLog.create`. Com 233 linhas isso vira ~470 idas e voltas
     * sequenciais até o Neon, o que estourava o limite de tempo da função
     * (erro 504 na Vercel).
     *
     * Agora os IDs são gerados aqui e tudo entra em DUAS operações em lote,
     * independentemente do número de linhas. A trilha de auditoria continua
     * completa: cada paciente importado gera sua entrada de histórico.
     */
    const existentes = await prisma.client.findMany({
      select: { id: true, registrationCode: true, fullNameEnc: true, protocolNumber: true },
    });
    /**
     * Índices de duplicata.
     *
     * A referência mostrada ao usuário passou a ser o NOME, não o número de
     * prontuário: quem está na fila de espera ainda não tem número, então
     * "protocolo null" não ajudaria ninguém a localizar o cadastro existente.
     */
    const porMatricula = new Map<string, string>();
    const porNome = new Map<string, string>();
    for (const c of existentes) {
      const nome = decryptField(c.fullNameEnc);
      const referencia = c.protocolNumber ? `prontuário ${c.protocolNumber}` : nome || "cadastro existente";
      if (c.registrationCode) porMatricula.set(String(c.registrationCode).trim(), referencia);
      if (nome) porNome.set(normalizeName(nome), referencia);
    }

    // Vínculos novos: coletados e criados de uma vez só.
    const existingAffiliations = await prisma.configItem.findMany({ where: { type: "AFFILIATION" } });
    const affiliationNames = new Set(existingAffiliations.map((a: any) => a.name.toLowerCase()));
    const novasAfiliacoes = new Set<string>();

    const clientesParaCriar: any[] = [];
    const historicoParaCriar: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    let flagged = 0;

    for (let i = 0; i < rows.length; i++) {
      const b = rows[i] ?? {};
      const linha = b.sourceRowNumber ?? i + 1;
      try {
        if (!b.fullName) {
          errors.push({ row: linha, error: "Nome é obrigatório." });
          continue;
        }

        const reasons: string[] = Array.isArray(b.reviewReasons) ? [...b.reviewReasons] : [];
        const matricula = b.registrationCode ? String(b.registrationCode).trim() : "";
        const nomeNorm = normalizeName(String(b.fullName));

        // Duplicata: sinalizada, nunca descartada — pode ser reingresso
        // legítimo, e sumir com alguém da fila é pior que ter um cadastro a
        // mais para conferir.
        if (matricula && porMatricula.has(matricula)) {
          reasons.push(`Já existe cadastro com esta matrícula (${porMatricula.get(matricula)}).`);
        } else if (porNome.has(nomeNorm)) {
          reasons.push(`Já existe cadastro com este nome (${porNome.get(nomeNorm)}).`);
        }

        const afiliacao = b.affiliation ? String(b.affiliation) : "";
        if (afiliacao && !affiliationNames.has(afiliacao.toLowerCase())) {
          novasAfiliacoes.add(afiliacao);
          affiliationNames.add(afiliacao.toLowerCase());
        }

        const needsReview = reasons.length > 0;
        if (needsReview) flagged++;

        const id = crypto.randomUUID();
        /**
         * Número de prontuário.
         *
         * Fila de espera e cancelado NÃO têm prontuário aberto, logo não têm
         * número. Já os casos FINALIZADOS foram atendidos de verdade e
         * costumam ter numeração histórica na planilha — que precisa ser
         * PRESERVADA, senão o documento antigo deixa de bater com o sistema.
         *
         * Se um caso finalizado vier sem número, ele é sinalizado para
         * revisão em vez de receber um número novo: inventar numeração
         * retroativa embaralharia a sequência do setor.
         */
        let protocolNumber: string | null = null;
        if (statusDestino === "FINALIZADO") {
          const informado = b.protocolNumber ? String(b.protocolNumber).trim() : "";
          if (informado) {
            protocolNumber = informado;
          } else {
            reasons.push("Caso finalizado sem número de prontuário na planilha.");
          }
        }

        clientesParaCriar.push({
          id,
          protocolNumber,
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
          diagnosisEnc: encryptField(b.diagnosis),
          contactObservationsEnc: encryptField(b.contactObservations),
          affiliation: afiliacao,
          allocation: b.allocation || "",
          dependencyType: b.dependencyType,
          extension: b.extension,
          alescEntryDate: parseDateInput(b.alescEntryDate) ?? undefined,
          dateIncluded: parseDateInput(b.dateIncluded) ?? new Date(),
          status: statusDestino as any,
          // Caso encerrado: registra a data e, quando houve atendimento,
          // calcula o prazo de guarda do registro documental.
          finalizedAt: statusDestino === "FILA_ESPERA" ? null : (parseDateInput(b.finalizedAt) ?? new Date()),
          retentionUntil:
            statusDestino === "FINALIZADO"
              ? computeRetentionUntil(parseDateInput(b.finalizedAt) ?? new Date(), b.birthDate)
              : null,
          cancellationReasonEnc:
            statusDestino === "CANCELADO" ? encryptField(b.cancellationReason || b.contactObservations) : null,
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
        });

        historicoParaCriar.push({
          clientId: id,
          actorId: session.userId,
          category: "FLUXO",
          action:
            statusDestino === "CANCELADO"
              ? "Caso importado como encerrado sem atendimento"
              : statusDestino === "FINALIZADO"
              ? "Caso importado como finalizado"
              : "Caso criado por importação de planilha",
          detailsEnc: encryptField(
            `Origem: ${sourceLabel}. Linha ${linha}.` +
              (needsReview ? ` Marcado para revisão: ${reasons.join(" ")}` : "")
          ),
        });

        // Permite detectar duplicatas DENTRO da própria planilha.
        // Permite detectar duplicatas DENTRO da própria planilha.
        const referencia = String(b.fullName).slice(0, 40);
        if (matricula) porMatricula.set(matricula, referencia);
        porNome.set(nomeNorm, referencia);
      } catch (err: any) {
        errors.push({ row: linha, error: err?.message || "Erro desconhecido." });
      }
    }

    if (novasAfiliacoes.size > 0) {
      await prisma.configItem.createMany({
        data: Array.from(novasAfiliacoes).map((name) => ({ type: "AFFILIATION" as any, name, isActive: true })),
        skipDuplicates: true,
      });
    }

    if (clientesParaCriar.length > 0) {
      await prisma.client.createMany({ data: clientesParaCriar });
      await prisma.historyLog.createMany({ data: historicoParaCriar });
    }

    res.json({ created: clientesParaCriar.length, flagged, errors, importBatchId });
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

    /**
     * CORREÇÃO MANUAL DO NÚMERO DE PRONTUÁRIO — restrita a SUPERVISOR e ADMIN.
     *
     * A numeração é gerada automaticamente pelo servidor quando o caso sai da
     * fila (ver `assignProtocolNumber`). Mas listas históricas trazem números
     * que precisam ser preservados, e erros de digitação em importação
     * precisam de conserto — daí a edição manual.
     *
     * O campo NÃO entra na lista `plain` de campos livres de propósito: um
     * psicólogo não pode alterar numeração de prontuário, porque isso permitiria
     * sobrescrever ou duplicar o número de um caso alheio.
     *
     * Duplicidade é bloqueada: dois prontuários com o mesmo número tornam o
     * registro documental irrastreável (Res. CFP nº 001/2009).
     */
    if ("protocolNumber" in b) {
      if (session.role !== "SUPERVISOR" && session.role !== "ADMIN") {
        res.status(403).json({
          error: "Somente Supervisor e Administrativo podem alterar o número de prontuário.",
        });
        return;
      }
      const informado = b.protocolNumber === null || b.protocolNumber === ""
        ? null
        : String(b.protocolNumber).trim();

      if (informado !== null) {
        if (!/^\d+$/.test(informado)) {
          res.status(400).json({ error: "O número de prontuário deve conter apenas dígitos." });
          return;
        }
        const jaUsado = await prisma.client.findFirst({
          where: { protocolNumber: informado, NOT: { id: req.params.id } },
          select: { id: true },
        });
        if (jaUsado) {
          res.status(409).json({
            error: `O número ${informado} já pertence a outro prontuário.`,
          });
          return;
        }
      }
      data.protocolNumber = informado;
    }

    const plain: Record<string, string> = {
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
    if ("cancellationReason" in b) data.cancellationReasonEnc = encryptField(b.cancellationReason);
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
    /**
     * CANCELADO: registra a data de encerramento, mas NÃO calcula prazo de
     * guarda. A guarda de 5 anos da Resolução CFP nº 001/2009 conta a partir
     * do encerramento do SERVIÇO PRESTADO — e aqui não houve serviço.
     */
    if (data.status === "CANCELADO" && existing.status !== "CANCELADO") {
      data.finalizedAt = new Date();
      data.retentionUntil = null;
    }

    // Diferença ANTES de gravar — precisamos do estado anterior para comparar.
    const changedLabels = diffChangedFieldLabels(existing, b);

    // O caso está saindo da fila de espera? Então abre-se o prontuário.
    const saiuDaFila =
      typeof data.status === "string" &&
      STATUS_COM_PRONTUARIO.includes(data.status) &&
      !existing.protocolNumber;

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data,
      include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
    });

    // Numeração do prontuário: atribuída na saída da fila de espera.
    if (saiuDaFila) {
      const numero = await assignProtocolNumber(client.id);
      if (numero) {
        await writeHistory({
          clientId: client.id,
          actor: actorOf(session),
          category: "CADASTRO",
          action: `Prontuário aberto sob o número ${numero}`,
        });
      }
    }

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

    const clientFinal = saiuDaFila
      ? await prisma.client.findUnique({
          where: { id: client.id },
          include: { assignedPsico: true, instrumentApps: { include: { entries: true } } },
        })
      : client;

    res.json({
      client: mapClient(clientFinal, { includeClinical: await hasClinicalAccess(session, client.id) }),
    });
  })
);

/**
 * NUMERAÇÃO DE PRONTUÁRIO
 * =======================
 *
 * Regra do setor: quem está na FILA DE ESPERA não tem prontuário aberto, logo
 * não tem número. O número nasce quando o caso passa a ser atendido — seja via
 * triagem, seja direto em atendimento.
 *
 * POR QUE ISTO É UMA ÚNICA INSTRUÇÃO SQL
 * --------------------------------------
 * A versão anterior gerava o número no NAVEGADOR, com `clients.length + 1`.
 * Isso quebrava de três formas:
 *   - duas pessoas cadastrando ao mesmo tempo recebiam o MESMO número;
 *   - apagar um paciente fazia o próximo REPETIR um número já usado;
 *   - um psicólogo, que só enxerga os próprios pacientes, geraria um número
 *     baixíssimo, colidindo com prontuário antigo.
 *
 * Ler o maior número e depois gravar em dois passos teria o mesmo problema de
 * concorrência. Aqui o cálculo e a gravação acontecem na MESMA instrução, e o
 * banco garante que dois pedidos simultâneos não recebam o mesmo número.
 *
 * O `WHERE "protocolNumber" IS NULL` também torna a operação idempotente: se
 * for chamada duas vezes para o mesmo paciente, a segunda não altera nada.
 *
 * Formato: zeros à esquerda até 3 dígitos ("001"), crescendo naturalmente
 * depois do 999 ("1000"). A sequência é contínua, sem reiniciar a cada ano, e
 * continua de onde a numeração histórica do setor parou.
 */
async function assignProtocolNumber(clientId: string): Promise<string | null> {
  const linhas = await prisma.$queryRaw<Array<{ protocolNumber: string }>>`
    UPDATE "Client"
    SET "protocolNumber" = (
      SELECT LPAD(
        (COALESCE(MAX(CAST("protocolNumber" AS BIGINT)), 0) + 1)::text,
        3, '0'
      )
      FROM "Client"
      WHERE "protocolNumber" ~ '^[0-9]+$'
    )
    WHERE id = ${clientId} AND "protocolNumber" IS NULL
    RETURNING "protocolNumber";
  `;
  return linhas[0]?.protocolNumber ?? null;
}

/**
 * Numeração do prontuário de GRUPO — sequência própria, prefixada com "G".
 *
 * Separada da numeração individual porque são documentos distintos: "G012" e
 * "012" referenciam coisas diferentes, e sem o prefixo a referência a um
 * prontuário no registro do setor ficaria ambígua.
 *
 * Mesmo cálculo atômico da numeração individual: uma única instrução SQL.
 */
async function assignGroupProtocolNumber(groupId: string): Promise<string | null> {
  const linhas = await prisma.$queryRaw<Array<{ protocolNumber: string }>>`
    UPDATE "Group"
    SET "protocolNumber" = (
      SELECT 'G' || LPAD(
        (COALESCE(MAX(CAST(SUBSTRING("protocolNumber" FROM 2) AS BIGINT)), 0) + 1)::text,
        3, '0'
      )
      FROM "Group"
      WHERE "protocolNumber" ~ '^G[0-9]+$'
    )
    WHERE id = ${groupId} AND "protocolNumber" IS NULL
    RETURNING "protocolNumber";
  `;
  return linhas[0]?.protocolNumber ?? null;
}

/**
 * Desfechos possíveis do vínculo com o grupo.
 *
 * Terminologia clínica, não administrativa: o motivo do desligamento é dado
 * do acompanhamento e compõe o registro documental do paciente. "Saiu" não
 * diz nada; "alta do processo grupal" e "abandono" dizem coisas diferentes
 * sobre o percurso e orientam conduta distinta.
 */
export const GROUP_EXIT_OUTCOMES: Record<string, string> = {
  ALTA_GRUPAL: "Alta do processo grupal — objetivos terapêuticos alcançados",
  ENCAMINHAMENTO: "Encaminhamento para outra modalidade de atendimento",
  ABANDONO: "Abandono do processo — interrupção sem devolutiva",
  DESISTENCIA: "Desistência manifestada pelo participante",
  INCOMPATIBILIDADE: "Incompatibilidade com os critérios ou objetivos do grupo",
  IMPEDIMENTO: "Impedimento externo (afastamento, mudança de lotação, agenda)",
  ENCERRAMENTO_GRUPO: "Encerramento do grupo",
  OUTRO: "Outro motivo (descrito na justificativa)",
};

/** Status em que o caso já é considerado atendido e, portanto, tem prontuário. */
// CANCELADO fica de fora: quem não foi atendido não tem prontuário aberto.
const STATUS_COM_PRONTUARIO = ["TRIAGEM", "TRIADOS", "EM_ATENDIMENTO", "FINALIZADO"];

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
    /**
     * Exportação de documento de GRUPO: restrita aos condutores e ao
     * Supervisor, conforme decidido com o setor. Baixar o PDF é a forma mais
     * fácil de o conteúdo sair do sistema, então a restrição vale aqui também.
     */
    if (req.body?.groupId) {
      if (!(await hasGroupAccess(session, String(req.body.groupId)))) {
        res.status(403).json({
          error: "Documentos de grupo podem ser exportados apenas pelos profissionais responsáveis pelo grupo.",
        });
        return;
      }
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

    /**
     * Quem pode registrar.
     *
     * Além do responsável pelo caso e de quem conduz um grupo do paciente,
     * também pode registrar quem TEM UM AGENDAMENTO com essa pessoa — é o caso
     * da triagem de entrada em grupo, da entrevista e da devolutiva, conduzidas
     * por um profissional que não acompanha o paciente individualmente.
     *
     * Sem isso, o profissional conseguia agendar o evento mas não conseguia
     * escrever a evolução dele.
     */
    const temAgendamento = b.clientId
      ? !!(await prisma.appointment.findFirst({
          where: { clientId: b.clientId, psicoId: session.userId },
          select: { id: true },
        }))
      : false;

    if (!temAgendamento && !(await hasClinicalAccess(session, b.clientId))) {
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
          updated.isDraft,
          updated.attendance,
          existing.groupId
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
        sessionType: b.sessionType || "ATENDIMENTO",
        attendance: b.attendance,
      },
      include: { versions: true },
    });
    await maybeIncrementCompletedSessions(created.clientId, !created.appointmentId, created.isDraft, created.attendance, created.groupId);
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
    if (!(await hasSessionAccess(session, existing))) {
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
      updated.isDraft,
      updated.attendance,
      existing.groupId
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

    /**
     * Agendar NÃO exige ser o responsável pelo paciente.
     *
     * O setor trabalha com vínculos que coexistem: a mesma pessoa pode estar
     * em atendimento individual com A e ser avaliada por B para entrar num
     * grupo. Exigir titularidade aqui inviabilizaria a triagem de grupo.
     *
     * O que continua protegido é a TITULARIDADE do caso: nenhuma rota de
     * agendamento altera `assignedPsicoId` de um paciente que já tem
     * responsável (ver PATCH /api/clients/:id).
     */
    if (b.clientId) {
      const alvo = await prisma.client.findUnique({
        where: { id: b.clientId },
        select: { status: true },
      });
      if (!alvo) {
        res.status(404).json({ error: "Paciente não encontrado." });
        return;
      }
      if (alvo.status === "FINALIZADO" || alvo.status === "CANCELADO") {
        res.status(409).json({
          error: "Este caso está encerrado. Reative o cadastro antes de agendar um atendimento.",
        });
        return;
      }
    }

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
        appointmentType: b.appointmentType || "ATENDIMENTO",
      },
    });

    /**
     * PRONTUÁRIO PENDENTE — só para ATENDIMENTO.
     *
     * Antes, TODO agendamento criava um registro clínico em branco. Numa série
     * recorrente isso significava um prontuário por ocorrência, e num
     * compromisso que nem é atendimento (triagem de grupo, entrevista,
     * devolutiva) significava um registro que nunca deveria existir.
     *
     * Resultado prático: a ficha do paciente enchia de prontuários vazios.
     *
     * Agora o registro nasce apenas quando o compromisso é de fato um
     * atendimento — e apenas para a PRIMEIRA ocorrência de uma série (as
     * demais geram o seu quando acontecerem, ao registrar a presença).
     */
    /**
     * Quando nasce o registro pendente.
     *
     * Eventos avulsos (atendimento único, triagem de grupo, entrevista,
     * devolutiva) geram o registro na hora: são encontros pontuais e o
     * profissional designado precisa poder escrever a evolução deles.
     *
     * Séries recorrentes NÃO geram, exceto a primeira ocorrência — do
     * contrário, agendar 12 semanas criaria 12 prontuários em branco de uma
     * vez, para sessões que só acontecerão meses depois.
     */
    const geraProntuario = !b.seriesId;
    const tipoDoEvento = b.appointmentType || "ATENDIMENTO";

    /**
     * GRUPO É EXCEÇÃO À REGRA DA SÉRIE.
     *
     * Grupos são quase sempre agendados como série semanal. Ao bloquear a
     * geração para séries (para não criar 12 prontuários individuais de uma
     * vez), eu impedi também a criação do registro do grupo — e nenhum dia de
     * grupo passou a gerar prontuário.
     *
     * A diferença é que o registro de grupo é UM por encontro, não um por
     * paciente: não há multiplicação. E o art. 5º da Resolução CFP nº 001/2009
     * exige documentação de cada encontro do grupo não eventual.
     */
    const geraRegistroDeGrupo = true;

    if (appt.clientId && geraProntuario) {
      /**
       * O prontuário pendente nasce vinculado a QUEM VAI ATENDER (`appt.psicoId`),
       * não ao responsável pelo caso. É isso que permite ao psicólogo do grupo
       * registrar a triagem de entrada de um paciente que é acompanhado
       * individualmente por outro colega — cada registro pertence a seu autor.
       */
      await prisma.sessionRecord.create({
        data: {
          clientId: appt.clientId,
          psicoId: appt.psicoId,
          date: parseLocalDateTime(b.date, b.time) ?? new Date(),
          notesEnc: "",
          isDraft: true,
          appointmentId: appt.id,
          sessionType: tipoDoEvento,
        },
      });
    } else if (appt.groupId && geraRegistroDeGrupo) {
      const group = await prisma.group.findUnique({
        where: { id: appt.groupId },
        include: { members: true },
      });
      if (group) {
        const dataDoEncontro = parseLocalDateTime(b.date, b.time) ?? new Date();

        /**
         * BUG CORRIGIDO — as duas criações são INDEPENDENTES.
         *
         * A verificação de duplicata do registro COLETIVO estava envolvendo
         * também a criação dos prontuários individuais. Como já existiam
         * registros coletivos antigos naquelas datas, o bloco inteiro era
         * pulado e NENHUM prontuário individual era gerado — por isso o
         * problema persistiu em todas as tentativas anteriores de corrigir.
         *
         * Agora cada criação verifica a própria duplicata, isoladamente.
         */

        /**
         * Número deste encontro dentro do grupo.
         * Conta quantos encontros do grupo já existem ATÉ esta data — assim a
         * numeração acompanha a ordem cronológica mesmo que os agendamentos
         * sejam criados fora de ordem.
         */
        const encontrosAnteriores = await prisma.groupRecord.count({
          where: { groupId: group.id, sessionDate: { lt: dataDoEncontro } },
        });
        const numeroDoEncontro = encontrosAnteriores + 1;

        // --- 1. Registro COLETIVO do encontro ---
        const coletivoExiste = await prisma.groupRecord.findFirst({
          where: { groupId: group.id, sessionDate: dataDoEncontro },
          select: { id: true },
        });
        if (!coletivoExiste) {
          await prisma.groupRecord.create({
            data: {
              groupId: group.id,
              authorId: appt.psicoId,
              sessionDate: dataDoEncontro,
              contentEnc: "",
              isDraft: true,
              appointmentId: appt.id,
            },
          });
        }

        /**
         * --- 2. Documentação INDIVIDUAL de cada integrante ---
         *
         * Exigida pelo art. 5º da Resolução CFP nº 001/2009 para grupos não
         * eventuais. É também o que permite ao profissional registrar a
         * presença ou a falta de cada participante naquele encontro.
         */
        for (const membro of group.members) {
          const individualExiste = await prisma.sessionRecord.findFirst({
            where: { clientId: membro.clientId, groupId: group.id, date: dataDoEncontro },
            select: { id: true },
          });
          if (individualExiste) continue;

          await prisma.sessionRecord.create({
            data: {
              clientId: membro.clientId,
              psicoId: appt.psicoId,
              date: dataDoEncontro,
              notesEnc: "",
              isDraft: true,
              status: "PENDENTE",
              groupId: group.id,
              appointmentId: appt.id,
              sessionType: "ATENDIMENTO",
              groupSessionNumber: numeroDoEncontro,
            },
          });
        }
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
/**
 * FALHA CORRIGIDA: `SessionRecord.date` (e `GroupRecord.sessionDate`) ficavam
 * "presos" na data antiga quando o agendamento era editado — não existia
 * nenhum código que sincronizasse a data do prontuário com a nova data do
 * agendamento (`appointmentId` é só um vínculo por texto, sem cascata no
 * banco). Resultado: o prontuário continuava aparecendo na ficha do paciente
 * na data de origem, e nenhuma sessão aparecia na data nova, mesmo o
 * agendamento estando correto e confirmado na agenda.
 *
 * Data de agendamento é dado de gestão de agenda, não fato clínico —
 * corrigi-la não reescreve o que foi escrito no prontuário (o texto não é
 * tocado), só o rótulo de QUANDO aquele atendimento aconteceu.
 */
async function sincronizarDataDoProntuario(appointmentId: string, novaData: Date): Promise<void> {
  await prisma.sessionRecord.updateMany({
    where: { appointmentId },
    data: { date: novaData },
  });
  await prisma.groupRecord.updateMany({
    where: { appointmentId },
    data: { sessionDate: novaData },
  });
}

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
    for (const key of ["roomId", "time", "endTime", "recurrence", "sessionNumber", "attendance", "psicoId", "seriesId", "appointmentType"]) {
      if (key in b) data[key] = b[key];
    }
    if ("clientId" in b) data.clientId = b.clientId || null;
    if ("groupId" in b) data.groupId = b.groupId || null;
    if ("date" in b) data.date = parseLocalDateTime(b.date, b.time ?? existing.time) ?? existing.date;

    const updated = await prisma.appointment.update({ where: { id: req.params.id }, data });

    if ("date" in data) {
      await sincronizarDataDoProntuario(updated.id, updated.date);
    }

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
          if (sibData.date) {
            await sincronizarDataDoProntuario(sib.id, sibData.date);
          }
          futureUpdated++;
        }
      }
    }

    if ("attendance" in data && updated.clientId) {
      await maybeIncrementCompletedSessionsOnAttendance(updated.clientId, existing.attendance, updated.attendance, updated.groupId);
      await resolverProntuarioPorPresenca(updated);
    }

    res.json({ appointment: mapAppointment(updated), futureUpdated });
  })
);

/**
 * Fecha (ou abre) o prontuário pendente conforme a situação do agendamento.
 *
 * O rascunho é criado no agendamento e só faz sentido enquanto se espera uma
 * evolução. Se o encontro NÃO ACONTECEU — cancelado, reagendado ou falta — não
 * há evolução a escrever, e deixar o rascunho aberto faz o sistema cobrar para
 * sempre um registro que nunca virá.
 *
 * Falta e cancelamento não são a mesma coisa:
 *
 *  - FALTA é dado clínico do acompanhamento e PERMANECE no prontuário, com o
 *    registro de que o paciente não compareceu (o CFP trata a frequência como
 *    parte do acompanhamento). O rascunho é fechado com esse texto.
 *
 *  - CANCELAMENTO e REAGENDAMENTO são movimentação de agenda, não atendimento.
 *    O rascunho VAZIO é removido — não houve ato clínico a registrar. Se o
 *    profissional já tiver escrito algo, o registro é preservado.
 *
 * FALHA CORRIGIDA (COMPARECEU sem prontuário): agendamentos com repetição
 * (semanal/quinzenal) só geram o prontuário pendente na 1ª ocorrência da
 * série — as demais deveriam gerar o seu "quando a sessão acontecesse, ao
 * marcar a presença", segundo o comentário original em POST /api/appointments.
 * Essa parte nunca tinha sido implementada: esta função retornava direto para
 * COMPARECEU, sem criar nada. Resultado: da 2ª sessão da série em diante,
 * confirmar presença não deixava rastro nenhum no prontuário — o profissional
 * não tinha onde escrever a evolução, e a sessão simplesmente não aparecia.
 * Sem documentação de sessão realizada, o sistema descumpria a própria
 * exigência da Resolução CFP nº 001/2009 (art. 3º) de registro de todo
 * atendimento prestado.
 */
async function resolverProntuarioPorPresenca(appt: any): Promise<void> {
  const situacao = appt.attendance;
  if (!situacao || situacao === "PENDENTE") return;

  if (situacao === "COMPARECEU") {
    if (!appt.clientId) return; // agendamento de grupo não passa por aqui (ver call site)
    const jaTemRegistro = await prisma.sessionRecord.findFirst({
      where: { appointmentId: appt.id },
      select: { id: true },
    });
    if (jaTemRegistro) return; // já existe (1ª ocorrência, ou já corrigido antes)

    await prisma.sessionRecord.create({
      data: {
        clientId: appt.clientId,
        psicoId: appt.psicoId,
        date: appt.date,
        notesEnc: "",
        isDraft: true,
        appointmentId: appt.id,
        sessionType: appt.appointmentType || "ATENDIMENTO",
        attendance: situacao,
      },
    });
    return;
  }

  const rascunho = await prisma.sessionRecord.findFirst({
    where: { appointmentId: appt.id, isDraft: true },
    include: { versions: true },
  });
  if (!rascunho) return;

  const temConteudo =
    !!decryptField(rascunho.notesEnc) ||
    !!decryptField(rascunho.privateNotesEnc) ||
    (rascunho.versions ?? []).length > 0;

  const ehFalta = situacao === "FALTA_JUSTIFICADA" || situacao === "FALTA_INJUSTIFICADA";

  if (ehFalta) {
    if (temConteudo) return; // já há registro escrito: não sobrescreve
    const texto =
      situacao === "FALTA_JUSTIFICADA"
        ? "Paciente não compareceu ao atendimento — falta justificada."
        : "Paciente não compareceu ao atendimento — falta sem justificativa.";
    // Fecha o registro SEM contar como sessão realizada — a presença gravada
    // no próprio registro impede o incremento (ver maybeIncrementCompletedSessions).
    await prisma.sessionRecord.update({
      where: { id: rascunho.id },
      data: { notesEnc: encryptField(texto), isDraft: false, attendance: situacao },
    });
    return;
  }

  // Cancelado ou reagendado: sem ato clínico.
  if (!temConteudo) {
    await prisma.sessionRecord.delete({ where: { id: rascunho.id } }).catch(() => {});
  }
}

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
    /**
     * BUG CORRIGIDO: apagar o agendamento deixava o prontuário pendente ÓRFÃO.
     *
     * O campo `appointmentId` do SessionRecord é apenas um texto — não há
     * relação nem cascata no banco. Então cada agendamento cancelado deixava
     * para trás um rascunho em branco que nunca mais some, e a ficha do
     * paciente ia acumulando registros fantasmas.
     *
     * Só apagamos rascunhos VAZIOS. Se o profissional já escreveu alguma coisa
     * naquele registro, ele é preservado mesmo com o agendamento cancelado —
     * o atendimento pode ter acontecido fora da agenda, e evolução escrita
     * jamais é descartada automaticamente.
     */
    const idsParaApagar = deleteFuture && appt.seriesId
      ? (await prisma.appointment.findMany({
          where: { seriesId: appt.seriesId, date: { gte: appt.date } },
          select: { id: true },
        })).map((a: any) => a.id)
      : [appt.id];

    const rascunhosVazios = await prisma.sessionRecord.findMany({
      where: { appointmentId: { in: idsParaApagar }, isDraft: true },
      include: { versions: true },
    });
    const removiveis = rascunhosVazios
      .filter((r: any) =>
        !decryptField(r.notesEnc) && !decryptField(r.privateNotesEnc) && (r.versions ?? []).length === 0
      )
      .map((r: any) => r.id);

    if (removiveis.length > 0) {
      await prisma.sessionRecord.deleteMany({ where: { id: { in: removiveis } } });
    }

    /**
     * Registros de GRUPO do mesmo agendamento.
     *
     * Estes não eram tocados por nenhuma rotina: apagar o encontro da agenda
     * deixava o prontuário coletivo para trás, e ao reagendar surgia um
     * segundo registro para o mesmo grupo — daí as sessões duplicadas.
     */
    const gruposVazios = await prisma.groupRecord.findMany({
      where: { appointmentId: { in: idsParaApagar }, isDraft: true },
    });
    const gruposRemoviveis = gruposVazios
      .filter((g: any) => !decryptField(g.contentEnc))
      .map((g: any) => g.id);
    if (gruposRemoviveis.length > 0) {
      await prisma.groupRecord.deleteMany({ where: { id: { in: gruposRemoviveis } } });
    }

    await prisma.appointment.deleteMany({ where: { id: { in: idsParaApagar } } });

    res.json({
      ok: true,
      agendamentosRemovidos: idsParaApagar.length,
      prontuariosRemovidos: removiveis.length,
      registrosDeGrupoRemovidos: gruposRemoviveis.length,
    });
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
    // Coterapeuta (opcional): mesmo requisito profissional do responsável.
    const coPsychologistId: string | null = b.coPsychologistId || null;
    if (coPsychologistId) {
      if (coPsychologistId === psychologistId) {
        res.status(400).json({ error: "O coterapeuta precisa ser um profissional diferente do responsável." });
        return;
      }
      const co = await prisma.user.findUnique({
        where: { id: coPsychologistId },
        select: { role: true, crp: true },
      });
      if (!co || (co.role !== "PSICO" && co.role !== "SUPERVISOR")) {
        res.status(400).json({ error: "O coterapeuta precisa ser um profissional de psicologia." });
        return;
      }
      if (!co.crp) {
        res.status(400).json({ error: "O coterapeuta está sem CRP cadastrado." });
        return;
      }
    }

    if (!b.name || !b.objective) {
      res.status(400).json({ error: "Informe o nome e o objetivo do grupo." });
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
        coPsychologistId,
      },
      include: { members: true },
    });

    // Numeração própria do grupo, atribuída na criação.
    await assignGroupProtocolNumber(group.id);
    const comNumero = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: true },
    });
    res.status(201).json({ group: mapGroup(comNumero) });
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
    if ("coPsychologistId" in b) {
      data.coPsychologistId = b.coPsychologistId || null;
    }
    /**
     * Inclusão de integrantes.
     *
     * A remoção NÃO acontece mais por aqui: apagar a lista inteira e recriar
     * destruía o histórico de quem participou. Desligar alguém passou a ser
     * ato próprio, com data e motivo (rota /members/:clientId/exit).
     */
    if (Array.isArray(b.memberIds)) {
      const atuais = await prisma.groupMember.findMany({
        where: { groupId: req.params.id },
        select: { clientId: true },
      });
      const jaSao = new Set(atuais.map((m: any) => m.clientId));
      const novos = b.memberIds.filter((id: string) => !jaSao.has(id));

      for (const clientId of novos) {
        await prisma.groupMember.create({
          data: {
            groupId: req.params.id,
            clientId,
            // Data de ingresso informada (para quem entrou depois do início)
            // ou o momento da inclusão.
            joinedAt: parseDateInput(b.joinedAt) ?? new Date(),
          },
        });
        await writeHistory({
          clientId,
          actor: actorOf(session),
          category: "CLINICO",
          action: "Integrante incluído em grupo terapêutico",
          details: `Ingresso em ${formatBR(parseDateInput(b.joinedAt) ?? new Date())}.`,
        });
      }
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
        const dataDoEncontro = parseLocalDateTime(String(b.sessionDate), "12:00") ?? sessionDate;
        for (const member of group.members) {
          /**
           * SEGUNDA FONTE DE DUPLICATAS.
           *
           * O agendamento do grupo já cria o prontuário individual de cada
           * integrante. Ao finalizar o registro coletivo, este trecho criava
           * TUDO DE NOVO, sem verificar — gerando um segundo conjunto de
           * prontuários para o mesmo encontro.
           */
          const jaExiste = await prisma.sessionRecord.findFirst({
            where: { clientId: member.clientId, groupId: group.id, date: dataDoEncontro },
            select: { id: true },
          });
          if (jaExiste) continue;

          await prisma.sessionRecord.create({
            data: {
              clientId: member.clientId,
              psicoId: record.authorId,
              date: dataDoEncontro,
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
        gender: b.gender ?? "NAO_INFORMADO",
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
    for (const key of ["name", "email", "title", "institutionalLink", "matricula", "color", "capacity", "gender"]) {
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

// ---------------------------------------------------------------------------
// NOTIFICAÇÕES PUSH
// ---------------------------------------------------------------------------

app.get(
  "/api/push/public-key",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    res.json({ publicKey: getPublicKey(), enabled: isPushConfigured() });
  })
);

/** Registra um dispositivo. Uma pessoa pode ter vários (celular + computador). */
app.post(
  "/api/push/subscribe",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Inscrição inválida." });
      return;
    }
    // upsert pelo endpoint: reinstalar o app no mesmo aparelho não duplica.
    await prisma.pushSubscription.upsert({
      where: { endpoint: String(endpoint) },
      update: {
        userId: session.userId,
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
        failureCount: 0,
      },
      create: {
        userId: session.userId,
        endpoint: String(endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
      },
    });
    res.json({ ok: true });
  })
);

app.post(
  "/api/push/unsubscribe",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const endpoint = String(req.body?.endpoint ?? "");
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.userId } });
    }
    res.json({ ok: true });
  })
);

/** Envio de teste para o próprio usuário, para conferir se chegou. */
app.post(
  "/api/push/test",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const enviados = await sendToUser(session.userId, {
      title: "Notificações ativadas",
      body: "É assim que os avisos do Setor de Psicologia vão aparecer.",
      url: "/dashboard",
      tag: "teste",
    });
    res.json({ enviados });
  })
);

// ---------------------------------------------------------------------------
// DISPARADOR DE LEMBRETES (chamado por agendador EXTERNO)
// ---------------------------------------------------------------------------
//
// O plano gratuito da Vercel permite apenas um agendamento por dia, o que não
// serve para lembretes por horário. A solução é um serviço externo gratuito
// (cron-job.org, Upstash QStash) batendo nesta rota a cada 15 minutos.
//
// Como a rota fica exposta na internet, ela exige um segredo. A comparação é
// feita em TEMPO CONSTANTE: comparar strings com === vaza, pelo tempo de
// resposta, quantos caracteres iniciais estavam certos, o que permite
// descobrir o segredo caractere a caractere.
//
// IDEMPOTÊNCIA: como o disparador bate de 15 em 15 minutos e a janela de
// lembrete é maior que isso, o mesmo atendimento cairia na busca várias vezes.
// Por isso gravamos `reminderSentAt` e ignoramos quem já foi avisado.
app.post(
  "/api/cron/reminders",
  asyncHandler(async (req, res) => {
    if (!verifyCronSecret(req)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }
    if (!isPushConfigured()) {
      res.json({ skipped: "VAPID não configurado." });
      return;
    }

    const agora = new Date();
    const hoje = toDateOnlyBRT(agora);
    const inicioDoDia = startOfDayBRT(hoje);
    const fimDoDia = inicioDoDia ? new Date(inicioDoDia.getTime() + 24 * 3600 * 1000) : null;
    if (!inicioDoDia || !fimDoDia) {
      res.status(500).json({ error: "Falha ao calcular o dia." });
      return;
    }

    const agendamentos = await prisma.appointment.findMany({
      where: { date: { gte: inicioDoDia, lt: fimDoDia }, reminderSentAt: null },
    });

    const minutosAgora = minutesOfDayBRT(agora);
    let enviados = 0;
    const avisados: string[] = [];

    /**
     * COMO A JANELA É CALCULADA
     * -------------------------
     * `avisoMinimo`  = com quanta antecedência a pessoa precisa ser avisada.
     * `intervalo`    = de quanto em quanto tempo o disparador externo bate aqui.
     *
     * A janela é `0 < faltam <= avisoMinimo + intervalo`. O motivo: como cada
     * agendamento só é avisado UMA vez (reminderSentAt), o aviso sai na
     * primeira batida em que o tempo restante cabe na janela. Somando o
     * intervalo ao aviso mínimo, garantimos que ninguém receba com MENOS
     * antecedência do que o combinado, mesmo no pior caso.
     *
     * Consequência prática: quanto mais frequente o disparador, mais preciso
     * o aviso. Com aviso mínimo de 30 min:
     *   disparador a cada 30 min -> chega entre 30 e 60 min antes
     *   disparador a cada 15 min -> chega entre 30 e 45 min antes
     *   disparador a cada  5 min -> chega entre 30 e 35 min antes
     */
    const avisoMinimo = Number(process.env.REMINDER_MINUTES_BEFORE ?? 30);
    const intervalo = Number(process.env.CRON_INTERVAL_MINUTES ?? 30);
    const limiteSuperior = avisoMinimo + intervalo;

    for (const a of agendamentos) {
      const [h, m] = String(a.time ?? "").split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;
      const minutosDoAtendimento = h * 60 + m;
      const faltam = minutosDoAtendimento - minutosAgora;

      if (faltam <= 0 || faltam > limiteSuperior) continue;

      const n = await sendToUser(
        a.psicoId,
        lembreteDeAtendimento(a.time, a.roomId ?? undefined)
      );
      enviados += n;
      avisados.push(a.id);
    }

    if (avisados.length > 0) {
      await prisma.appointment.updateMany({
        where: { id: { in: avisados } },
        data: { reminderSentAt: new Date() },
      });
    }

    res.json({
      verificados: agendamentos.length,
      avisados: avisados.length,
      enviados,
      janela: `0 a ${limiteSuperior} minutos antes`,
    });
  })
);

/** Resumo matinal — cabe no agendamento único do plano gratuito da Vercel. */
app.post(
  "/api/cron/daily-summary",
  asyncHandler(async (req, res) => {
    if (!verifyCronSecret(req)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }
    if (!isPushConfigured()) {
      res.json({ skipped: "VAPID não configurado." });
      return;
    }

    const hoje = toDateOnlyBRT(new Date());
    const inicio = startOfDayBRT(hoje);
    const fim = inicio ? new Date(inicio.getTime() + 24 * 3600 * 1000) : null;
    if (!inicio || !fim) {
      res.status(500).json({ error: "Falha ao calcular o dia." });
      return;
    }

    const agendamentos = await prisma.appointment.findMany({
      where: { date: { gte: inicio, lt: fim } },
      orderBy: { time: "asc" },
    });

    const porPsico = new Map<string, string[]>();
    for (const a of agendamentos) {
      const lista = porPsico.get(a.psicoId) ?? [];
      lista.push(a.time);
      porPsico.set(a.psicoId, lista);
    }

    let enviados = 0;
    for (const [psicoId, horarios] of porPsico) {
      enviados += await sendToUser(psicoId, resumoDoDia(horarios.length, horarios[0]));
    }
    res.json({ profissionais: porPsico.size, enviados });
  })
);

/**
 * Comparação em tempo constante do segredo do disparador.
 * O segredo vai no cabeçalho, não na URL: parâmetros de query aparecem em
 * logs de servidor, de proxy e no histórico do navegador.
 */
function verifyCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers["authorization"];
  const provided = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice(7)
    : String(req.headers["x-cron-secret"] ?? "");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function toDateOnlyBRT(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function minutesOfDayBRT(d: Date): number {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}

/**
 * Limpeza única: remove número de prontuário de quem ainda está na fila.
 *
 * Necessária por causa de dois defeitos corrigidos:
 *   - a importação gravava o texto "Pendente" no campo;
 *   - o cadastro manual gerava número no navegador com `clients.length + 1`,
 *     produzindo números repetidos e colidindo com a numeração histórica.
 *
 * Só mexe em quem está em FILA_ESPERA. Quem já é atendido mantém o número.
 */
app.post(
  "/api/manutencao/limpar-prontuarios-da-fila",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;

    const alvos = await prisma.client.findMany({
      where: { status: "FILA_ESPERA", NOT: { protocolNumber: null } },
      select: { id: true, protocolNumber: true },
    });

    const result = await prisma.client.updateMany({
      where: { status: "FILA_ESPERA", NOT: { protocolNumber: null } },
      data: { protocolNumber: null },
    });

    for (const alvo of alvos.slice(0, 200)) {
      await writeHistory({
        clientId: alvo.id,
        actor: actorOf(session),
        category: "CADASTRO",
        action: "Número de prontuário removido (caso ainda em fila de espera)",
        details: `Valor anterior: ${alvo.protocolNumber}. Correção de numeração indevida.`,
      });
    }

    res.json({ limpos: result.count });
  })
);

/**
 * Limpeza de prontuários pendentes em branco.
 *
 * Corrige o efeito do defeito anterior, em que TODO agendamento criava um
 * registro clínico — inclusive séries recorrentes (um por ocorrência) e
 * compromissos que nem eram atendimento.
 *
 * Remove apenas rascunhos SEM NENHUM CONTEÚDO: texto vazio, sem anotação
 * privada, sem presença registrada e sem versões anteriores. Nada que alguém
 * tenha escrito é tocado.
 */
app.post(
  "/api/manutencao/limpar-prontuarios-vazios",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;

    /**
     * ATENÇÃO à janela de datas.
     *
     * Só entram rascunhos de sessões FUTURAS. Os rascunhos de sessões que já
     * aconteceram são PENDÊNCIAS LEGÍTIMAS: o profissional ainda precisa
     * registrar aquela evolução, e apagá-los faria sumir o lembrete de que há
     * prontuário a escrever — além de apagar a própria prova de que o
     * atendimento estava agendado.
     *
     * O problema real era outro: o registro nascia no momento do AGENDAMENTO,
     * não do atendimento. Com séries de 12 ocorrências, isso criava
     * prontuários pendentes para sessões que só acontecerão meses depois.
     */
    const agora = new Date();

    // Agendamentos existentes e sua situação, para identificar órfãos e
    // encontros que não chegaram a acontecer.
    const agendamentos = await prisma.appointment.findMany({
      select: { id: true, attendance: true },
    });
    const agendamentosExistentes = new Set(agendamentos.map((a: any) => a.id));
    const naoAconteceram = new Set(
      agendamentos
        .filter((a: any) =>
          ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"].includes(a.attendance)
        )
        .map((a: any) => a.id)
    );

    /**
     * FALHA CORRIGIDA: rascunho com presença "Compareceu" ficava de fora
     * desta consulta, mesmo vazio e mesmo órfão — porque o filtro só
     * considerava `attendance` nulo ou "PENDENTE". Depois da correção da
     * sincronização de data (`sincronizarDataDoProntuario`) e da geração de
     * prontuário ao confirmar presença (`resolverProntuarioPorPresenca`), é
     * exatamente esse o estado que um rascunho órfão costuma ter — e ele
     * nunca era alcançado por nenhum botão de manutenção.
     *
     * Incluir "COMPARECEU" aqui não muda o que é removido: a decisão de
     * remover continua vindo só de órfão/futuro/agendamento cancelado, mais
     * abaixo. Um rascunho "Compareceu" vazio ligado a um agendamento que
     * ainda existe e já aconteceu continua sendo pendência legítima e
     * permanece intocado — só passa a ser alcançável quando realmente é
     * órfão (o caso que motivou esta correção).
     */
    const candidatos = await prisma.sessionRecord.findMany({
      where: {
        isDraft: true,
        OR: [{ attendance: null }, { attendance: "PENDENTE" }, { attendance: "COMPARECEU" }],
      },
      include: { versions: true },
    });

    const idsParaRemover = candidatos
      .filter((s: any) => {
        const semTexto = !decryptField(s.notesEnc);
        const semPrivada = !decryptField(s.privateNotesEnc);
        const semVersoes = (s.versions ?? []).length === 0;
        if (!semTexto || !semPrivada || !semVersoes) return false;

        /**
         * Duas situações removíveis:
         *  1. ÓRFÃO — o agendamento que o gerou foi cancelado e o rascunho
         *     ficou para trás (o campo appointmentId não tinha cascata).
         *  2. FUTURO — sessão que ainda não aconteceu; o registro só deve
         *     nascer quando o atendimento ocorrer.
         *
         * Rascunho de sessão JÁ REALIZADA e com agendamento ativo é pendência
         * legítima: fica, porque o profissional ainda precisa escrever.
         */
        const orfao = !!s.appointmentId && !agendamentosExistentes.has(s.appointmentId);
        const futuro = new Date(s.date) > agora;
        // Encontro cancelado ou reagendado: não houve atendimento a registrar.
        const naoOcorreu = !!s.appointmentId && naoAconteceram.has(s.appointmentId);
        return orfao || futuro || naoOcorreu;
      })
      .map((s: any) => s.id);

    /**
     * Registros de GRUPO vazios: órfãos, futuros ou de encontros que não
     * ocorreram. Estavam fora da limpeza, então o botão de Configurações não
     * conseguia remover as duplicatas de grupo.
     */
    const registrosDeGrupo = await prisma.groupRecord.findMany({ where: { isDraft: true } });
    const gruposParaRemover = registrosDeGrupo
      .filter((g: any) => {
        if (decryptField(g.contentEnc)) return false;
        const orfao = !!g.appointmentId && !agendamentosExistentes.has(g.appointmentId);
        const futuro = new Date(g.sessionDate) > agora;
        const naoOcorreu = !!g.appointmentId && naoAconteceram.has(g.appointmentId);
        return orfao || futuro || naoOcorreu;
      })
      .map((g: any) => g.id);

    if (gruposParaRemover.length > 0) {
      await prisma.groupRecord.deleteMany({ where: { id: { in: gruposParaRemover } } });
    }

    if (idsParaRemover.length === 0) {
      res.json({ removidos: gruposParaRemover.length, registrosDeGrupo: gruposParaRemover.length });
      return;
    }

    const result = await prisma.sessionRecord.deleteMany({
      where: { id: { in: idsParaRemover } },
    });
    res.json({
      removidos: result.count + gruposParaRemover.length,
      registrosDeGrupo: gruposParaRemover.length,
      observacao:
        "Removidos rascunhos vazios: órfãos, de sessões futuras e de encontros cancelados ou reagendados. Pendências de atendimentos realizados foram preservadas.",
    });
  })
);

/**
 * REALINHAMENTO DE AUTORIA DOS PRONTUÁRIOS
 * ========================================
 *
 * Corrige registros cujo autor não corresponde ao profissional que estava
 * agendado naquele dia. Isso acontece com prontuários criados antes das
 * correções: eles apontavam para o responsável ATUAL do caso, e não para quem
 * de fato realizou o atendimento.
 *
 * Por que importa: a evolução precisa ser escrita por quem prestou o
 * atendimento. Com o vínculo errado, o profissional que atendeu não consegue
 * preencher — e o que assumiu o caso depois apareceria como autor de um ato
 * que não praticou.
 *
 * Só realinha registros SEM CONTEÚDO. Se alguém já escreveu, o autor é quem
 * assinou aquele texto e não se mexe.
 *
 * `?aplicar=true` executa; sem isso, apenas devolve a prévia.
 */
app.post(
  "/api/manutencao/realinhar-autoria",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const aplicar = req.query.aplicar === "true";

    const registros = await prisma.sessionRecord.findMany({
      where: { NOT: { appointmentId: null } },
      include: { versions: true },
    });

    const agendamentos = new Map<string, any>(
      (await prisma.appointment.findMany({ select: { id: true, psicoId: true, date: true } }))
        .map((a: any) => [a.id, a])
    );
    const equipe = new Map<string, string>(
      (await prisma.user.findMany({ select: { id: true, name: true } })).map((u: any) => [u.id, u.name])
    );

    const divergentes = registros.filter((r: any) => {
      const appt = agendamentos.get(r.appointmentId);
      if (!appt) return false;
      if (appt.psicoId === r.psicoId) return false;
      // Só realinha o que ainda não foi escrito.
      const temConteudo =
        !!decryptField(r.notesEnc) ||
        !!decryptField(r.privateNotesEnc) ||
        (r.versions ?? []).length > 0;
      return !temConteudo;
    });

    const previa = divergentes.slice(0, 100).map((r: any) => {
      const appt = agendamentos.get(r.appointmentId);
      return {
        data: toDateOnlyBRT(r.date),
        autorAtual: equipe.get(r.psicoId) ?? "—",
        autorCorreto: equipe.get(appt.psicoId) ?? "—",
      };
    });

    if (!aplicar) {
      res.json({ modo: "previa", total: divergentes.length, exemplos: previa });
      return;
    }

    let corrigidos = 0;
    for (const r of divergentes) {
      const appt = agendamentos.get(r.appointmentId);
      await prisma.sessionRecord.update({
        where: { id: r.id },
        data: { psicoId: appt.psicoId },
      });
      corrigidos++;
    }

    await logAccess({
      actor: actorOf(session),
      action: "REALINHAMENTO_DE_AUTORIA",
      resource: `${corrigidos} prontuário(s)`,
      ip: clientIp(req),
    });

    res.json({ modo: "aplicado", corrigidos });
  })
);

/**
 * Remove DUPLICATAS já existentes.
 *
 * Duas fontes geraram registros repetidos: o agendamento do grupo e a
 * finalização do registro coletivo criavam, cada um, o prontuário individual
 * do mesmo encontro.
 *
 * Critério: mesma pessoa, mesmo grupo, mesma data. Mantém o registro que TEM
 * conteúdo escrito; se nenhum tiver, mantém o mais antigo. Nunca remove dois
 * registros preenchidos — nesse caso não é duplicata, e a decisão é humana.
 */
app.post(
  "/api/manutencao/remover-duplicatas-de-grupo",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const aplicar = req.query.aplicar === "true";

    const registros = await prisma.sessionRecord.findMany({
      where: { NOT: { groupId: null } },
      orderBy: { createdAt: "asc" },
    });

    const porChave = new Map<string, any[]>();
    for (const r of registros) {
      const chave = `${r.clientId}|${r.groupId}|${toDateOnlyBRT(r.date)}`;
      porChave.set(chave, [...(porChave.get(chave) ?? []), r]);
    }

    const remover: string[] = [];
    let conflitos = 0;

    for (const [, grupo] of porChave) {
      if (grupo.length < 2) continue;
      const comConteudo = grupo.filter((r: any) => !!decryptField(r.notesEnc));

      if (comConteudo.length > 1) {
        // Dois registros preenchidos: não é duplicata técnica. Deixa para
        // conferência humana.
        conflitos++;
        continue;
      }
      const manter = comConteudo[0] ?? grupo[0];
      remover.push(...grupo.filter((r: any) => r.id !== manter.id).map((r: any) => r.id));
    }

    // Registros COLETIVOS duplicados (mesmo grupo, mesma data).
    const coletivos = await prisma.groupRecord.findMany({ orderBy: { createdAt: "asc" } });
    const porChaveColetiva = new Map<string, any[]>();
    for (const g of coletivos) {
      const chave = `${g.groupId}|${toDateOnlyBRT(g.sessionDate)}`;
      porChaveColetiva.set(chave, [...(porChaveColetiva.get(chave) ?? []), g]);
    }
    const removerColetivos: string[] = [];
    for (const [, grupo] of porChaveColetiva) {
      if (grupo.length < 2) continue;
      const comConteudo = grupo.filter((g: any) => !!decryptField(g.contentEnc));
      if (comConteudo.length > 1) { conflitos++; continue; }
      const manter = comConteudo[0] ?? grupo[0];
      removerColetivos.push(...grupo.filter((g: any) => g.id !== manter.id).map((g: any) => g.id));
    }

    if (!aplicar) {
      res.json({
        modo: "previa",
        prontuariosIndividuais: remover.length,
        registrosColetivos: removerColetivos.length,
        conflitosParaConferencia: conflitos,
      });
      return;
    }

    if (remover.length) await prisma.sessionRecord.deleteMany({ where: { id: { in: remover } } });
    if (removerColetivos.length) await prisma.groupRecord.deleteMany({ where: { id: { in: removerColetivos } } });

    await logAccess({
      actor: actorOf(session),
      action: "REMOCAO_DE_DUPLICATAS_DE_GRUPO",
      resource: `${remover.length + removerColetivos.length} registro(s)`,
      ip: clientIp(req),
    });

    res.json({
      modo: "aplicado",
      prontuariosIndividuais: remover.length,
      registrosColetivos: removerColetivos.length,
      conflitosParaConferencia: conflitos,
    });
  })
);

/**
 * Gera os prontuários individuais que faltam nos encontros de grupo.
 *
 * Necessária porque os grupos já agendados foram criados enquanto o defeito
 * existia: os encontros estão na agenda, mas sem a documentação individual de
 * cada integrante — que é o que permite registrar presença ou falta.
 *
 * Serve também quando alguém ENTRA no grupo depois: os encontros já marcados
 * passam a ter o registro dessa pessoa.
 *
 * `?aplicar=true` executa; sem isso, devolve apenas a prévia.
 */
app.post(
  "/api/manutencao/gerar-prontuarios-de-grupo",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const aplicar = req.query.aplicar === "true";

    const agendamentosDeGrupo = await prisma.appointment.findMany({
      where: { NOT: { groupId: null } },
    });

    const grupos = new Map(
      (await prisma.group.findMany({ include: { members: true } })).map((g: any) => [g.id, g])
    );

    const existentes = await prisma.sessionRecord.findMany({
      where: { NOT: { groupId: null } },
      select: { clientId: true, groupId: true, date: true },
    });
    const chaveExistente = new Set(
      existentes.map((r: any) => `${r.clientId}|${r.groupId}|${r.date.getTime()}`)
    );

    /**
     * Ordem cronológica dos encontros de cada grupo, para numerar corretamente
     * ("Sessão 3 do grupo") mesmo nos registros criados retroativamente.
     */
    const ordemPorGrupo = new Map<string, number>();
    const datasPorGrupo = new Map<string, number[]>();
    for (const appt of agendamentosDeGrupo) {
      const lista = datasPorGrupo.get(appt.groupId!) ?? [];
      lista.push(appt.date.getTime());
      datasPorGrupo.set(appt.groupId!, lista);
    }
    for (const [groupId, datas] of datasPorGrupo) {
      [...new Set(datas)].sort((a, b) => a - b).forEach((t, i) => {
        ordemPorGrupo.set(`${groupId}|${t}`, i + 1);
      });
    }

    const aCriar: any[] = [];
    const resumo = new Map<string, number>();

    for (const appt of agendamentosDeGrupo) {
      const grupo: any = grupos.get(appt.groupId);
      if (!grupo) continue;

      // Encontros cancelados ou reagendados não precisam de documentação.
      if (["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"].includes(appt.attendance ?? "")) {
        continue;
      }

      for (const membro of grupo.members) {
        const chave = `${membro.clientId}|${grupo.id}|${appt.date.getTime()}`;
        if (chaveExistente.has(chave)) continue;
        chaveExistente.add(chave);

        aCriar.push({
          clientId: membro.clientId,
          psicoId: appt.psicoId,
          date: appt.date,
          groupSessionNumber: ordemPorGrupo.get(`${grupo.id}|${appt.date.getTime()}`) ?? null,
          notesEnc: "",
          isDraft: true,
          status: "PENDENTE",
          groupId: grupo.id,
          appointmentId: appt.id,
          sessionType: "ATENDIMENTO",
        });
        resumo.set(grupo.name, (resumo.get(grupo.name) ?? 0) + 1);
      }
    }

    if (!aplicar) {
      res.json({
        modo: "previa",
        total: aCriar.length,
        porGrupo: Array.from(resumo.entries()).map(([grupo, quantidade]) => ({ grupo, quantidade })),
      });
      return;
    }

    if (aCriar.length > 0) {
      await prisma.sessionRecord.createMany({ data: aCriar });
    }

    await logAccess({
      actor: actorOf(session),
      action: "GERACAO_DE_PRONTUARIOS_DE_GRUPO",
      resource: `${aCriar.length} registro(s)`,
      ip: clientIp(req),
    });

    res.json({
      modo: "aplicado",
      criados: aCriar.length,
      porGrupo: Array.from(resumo.entries()).map(([grupo, quantidade]) => ({ grupo, quantidade })),
    });
  })
);

/**
 * Corrige os dois efeitos da falha de sincronização entre AGENDAMENTO
 * INDIVIDUAL e prontuário (o equivalente desta rotina, para grupo, é a
 * `/api/manutencao/gerar-prontuarios-de-grupo` acima):
 *
 *   1. Ocorrências de série recorrente (semanal/quinzenal), da 2ª em diante,
 *      que foram marcadas "Compareceu" antes da correção (ver
 *      `resolverProntuarioPorPresenca`) não geraram prontuário nenhum —
 *      ficaram sem documentação mesmo tendo, segundo o próprio sistema,
 *      acontecido.
 *   2. Agendamentos cuja data foi editada depois de o prontuário já existir
 *      ficaram com o prontuário "preso" na data antiga — `SessionRecord.date`
 *      nunca era atualizado junto com `Appointment.date` (ver
 *      `sincronizarDataDoProntuario`, que corrige isso a partir de agora;
 *      esta rotina conserta o que já ficou desalinhado antes da correção).
 *
 * Só mexe em agendamento INDIVIDUAL (`clientId` preenchido, `groupId`
 * vazio) — grupo tem rotina própria.
 *
 * `?aplicar=true` executa; sem isso, devolve apenas a prévia.
 */
app.post(
  "/api/manutencao/gerar-prontuarios-de-atendimento",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const aplicar = req.query.aplicar === "true";

    const agendamentosIndividuais = await prisma.appointment.findMany({
      where: { NOT: { clientId: null }, groupId: null },
    });

    const registrosExistentes = await prisma.sessionRecord.findMany({
      where: { NOT: { appointmentId: null }, groupId: null },
      select: { id: true, appointmentId: true, date: true },
    });
    const registroPorAgendamento = new Map<string, { id: string; date: Date }>(
      registrosExistentes.map((r: any) => [r.appointmentId as string, { id: r.id, date: r.date }])
    );

    const aCriar: any[] = [];
    const aCorrigirData: { id: string; paraData: Date }[] = [];

    for (const appt of agendamentosIndividuais) {
      const registro = registroPorAgendamento.get(appt.id);

      if (!registro) {
        // Só preenche quem já foi confirmado como comparecido. Pendente sem
        // presença marcada ainda não deveria ter prontuário — é o fluxo
        // normal (nasce na 1ª ocorrência ou quando alguém marcar presença).
        if (appt.attendance === "COMPARECEU") {
          aCriar.push({
            clientId: appt.clientId,
            psicoId: appt.psicoId,
            date: appt.date,
            notesEnc: "",
            isDraft: true,
            appointmentId: appt.id,
            sessionType: appt.appointmentType || "ATENDIMENTO",
            attendance: appt.attendance,
          });
        }
        continue;
      }

      if (registro.date.getTime() !== appt.date.getTime()) {
        aCorrigirData.push({ id: registro.id, paraData: appt.date });
      }
    }

    if (!aplicar) {
      res.json({
        modo: "previa",
        prontuariosAGerar: aCriar.length,
        datasADivergir: aCorrigirData.length,
      });
      return;
    }

    if (aCriar.length > 0) {
      await prisma.sessionRecord.createMany({ data: aCriar });
    }
    for (const item of aCorrigirData) {
      await prisma.sessionRecord.update({ where: { id: item.id }, data: { date: item.paraData } });
    }

    await logAccess({
      actor: actorOf(session),
      action: "CORRECAO_DE_PRONTUARIOS_DE_ATENDIMENTO",
      resource: `${aCriar.length} criado(s), ${aCorrigirData.length} data(s) corrigida(s)`,
      ip: clientIp(req),
    });

    res.json({
      modo: "aplicado",
      criados: aCriar.length,
      datasCorrigidas: aCorrigirData.length,
    });
  })
);

/**
 * RECÁLCULO do Controle de Sessões (`completedSessions`).
 *
 * DECISÃO DO SETOR: sessão de grupo não consome o pacote de sessões previstas
 * do atendimento individual (ver `maybeIncrementCompletedSessions`). Antes
 * desta correção, toda sessão de grupo finalizada incrementava o mesmo
 * contador do atendimento individual — inflando artificialmente o consumo do
 * pacote de todo paciente que também participa de grupo.
 *
 * Esta rotina recalcula `completedSessions` do zero, para todo paciente, a
 * partir dos próprios registros: conta só `SessionRecord` INDIVIDUAL
 * (`groupId` nulo), finalizado (`isDraft:false`), cuja presença não seja
 * falta/cancelamento/reagendamento — a mesma regra já aplicada em
 * `maybeIncrementCompletedSessions`, só que sem a contaminação da sessão de
 * grupo. O valor atual é SOBRESCRITO (decisão do setor: o campo nunca foi
 * corrigido manualmente na prática, então não há edição humana a preservar).
 *
 * `?aplicar=true` executa; sem isso, devolve apenas a prévia.
 */
app.post(
  "/api/manutencao/recalcular-sessoes-concluidas",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const aplicar = req.query.aplicar === "true";

    const registrosIndividuaisFinalizados = await prisma.sessionRecord.findMany({
      where: {
        groupId: null,
        isDraft: false,
        NOT: {
          attendance: {
            in: ["FALTA_JUSTIFICADA", "FALTA_INJUSTIFICADA", "CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"],
          },
        },
      },
      select: { clientId: true },
    });

    const contagemPorPaciente = new Map<string, number>();
    for (const r of registrosIndividuaisFinalizados) {
      contagemPorPaciente.set(r.clientId, (contagemPorPaciente.get(r.clientId) ?? 0) + 1);
    }

    const clientes = await prisma.client.findMany({ select: { id: true, completedSessions: true } });
    const divergentes = clientes
      .map((c: any) => ({
        id: c.id,
        valorAtual: c.completedSessions,
        valorRecalculado: contagemPorPaciente.get(c.id) ?? 0,
      }))
      .filter((c: any) => c.valorAtual !== c.valorRecalculado);

    if (!aplicar) {
      res.json({ modo: "previa", total: divergentes.length });
      return;
    }

    for (const c of divergentes) {
      await prisma.client.update({ where: { id: c.id }, data: { completedSessions: c.valorRecalculado } });
    }

    await logAccess({
      actor: actorOf(session),
      action: "RECALCULO_DE_SESSOES_CONCLUIDAS",
      resource: `${divergentes.length} paciente(s)`,
      ip: clientIp(req),
    });

    res.json({ modo: "aplicado", corrigidos: divergentes.length });
  })
);

/** Desfechos disponíveis para o desligamento de integrante. */
app.get(
  "/api/groups/exit-outcomes",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    res.json({
      outcomes: Object.entries(GROUP_EXIT_OUTCOMES).map(([value, label]) => ({ value, label })),
    });
  })
);

/**
 * Desligamento de integrante do grupo.
 *
 * Não apaga o vínculo: registra a SAÍDA, com data, desfecho e justificativa.
 * Os prontuários dos encontros de que a pessoa participou permanecem — são
 * registro do que aconteceu, e apagá-los seria destruir documentação clínica.
 */
app.post(
  "/api/groups/:id/members/:clientId/exit",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await hasGroupAccess(session, req.params.id))) {
      res.status(403).json({ error: "Somente os profissionais responsáveis pelo grupo (ou o Supervisor) podem desligar integrantes." });
      return;
    }

    const outcome = String(req.body?.exitOutcome ?? "");
    const reason = String(req.body?.exitReason ?? "").trim();
    if (!GROUP_EXIT_OUTCOMES[outcome]) {
      res.status(400).json({ error: "Selecione o desfecho do vínculo." });
      return;
    }
    if (reason.length < 10) {
      res.status(400).json({ error: "Descreva a justificativa clínica (mínimo de 10 caracteres)." });
      return;
    }

    const exitedAt = parseDateInput(req.body?.exitedAt) ?? new Date();

    const vinculo = await prisma.groupMember.findUnique({
      where: { groupId_clientId: { groupId: req.params.id, clientId: req.params.clientId } },
    });
    if (!vinculo) {
      res.status(404).json({ error: "Integrante não encontrado neste grupo." });
      return;
    }

    await prisma.groupMember.update({
      where: { groupId_clientId: { groupId: req.params.id, clientId: req.params.clientId } },
      data: { exitedAt, exitOutcome: outcome, exitReason: reason },
    });

    /**
     * Prontuários FUTUROS daquele grupo deixam de fazer sentido para quem
     * saiu: a pessoa não estará nos próximos encontros. Só removemos os
     * vazios — o que já foi escrito é registro e permanece.
     */
    const futurosVazios = await prisma.sessionRecord.findMany({
      where: {
        clientId: req.params.clientId,
        groupId: req.params.id,
        date: { gt: exitedAt },
        isDraft: true,
      },
    });
    const removiveis = futurosVazios
      .filter((r: any) => !decryptField(r.notesEnc))
      .map((r: any) => r.id);
    if (removiveis.length) {
      await prisma.sessionRecord.deleteMany({ where: { id: { in: removiveis } } });
    }

    const grupo = await prisma.group.findUnique({ where: { id: req.params.id }, select: { name: true } });
    await writeHistory({
      clientId: req.params.clientId,
      actor: actorOf(session),
      category: "CLINICO",
      action: "Desligamento de grupo terapêutico",
      details: `Grupo: ${grupo?.name ?? "—"}. Desfecho: ${GROUP_EXIT_OUTCOMES[outcome]}. Justificativa: ${reason}`,
    });

    res.json({ ok: true, prontuariosFuturosRemovidos: removiveis.length });
  })
);

/** Correção manual do número do prontuário de grupo. */
app.patch(
  "/api/groups/:id/protocol-number",
  asyncHandler(async (req, res) => {
    const session = requireSession(req, res, ["SUPERVISOR", "ADMIN"]);
    if (!session) return;
    const informado = req.body?.protocolNumber === null || req.body?.protocolNumber === ""
      ? null
      : String(req.body.protocolNumber).trim().toUpperCase();

    if (informado !== null) {
      if (!/^G\d+$/.test(informado)) {
        res.status(400).json({ error: 'O número deve seguir o formato "G" seguido de dígitos (ex.: G001).' });
        return;
      }
      const emUso = await prisma.group.findFirst({
        where: { protocolNumber: informado, NOT: { id: req.params.id } },
        select: { id: true },
      });
      if (emUso) {
        res.status(409).json({ error: `O número ${informado} já pertence a outro grupo.` });
        return;
      }
    }

    const group = await prisma.group.update({
      where: { id: req.params.id },
      data: { protocolNumber: informado },
      include: { members: true },
    });
    res.json({ group: mapGroup(group) });
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
