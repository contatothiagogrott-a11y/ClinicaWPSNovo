import { decryptField } from "./crypto.js";
import { toDateOnly, toISO } from "./datetime.js";

/**
 * Conversão banco -> JSON da API.
 *
 * Duas responsabilidades de compliance vivem aqui:
 *  1. Decriptação (os campos "*Enc" só voltam a ser legíveis nesta camada).
 *  2. MINIMIZAÇÃO: cada mapper só devolve o que aquele solicitante pode ver.
 *     Se um dado não deve chegar ao navegador, ele não pode ser incluído aqui —
 *     esconder no front-end não é controle de acesso, é maquiagem (qualquer
 *     pessoa lê a resposta da API pelo "Inspecionar elemento").
 *
 * Datas: `toDateOnly`/`toISO` respeitam America/Sao_Paulo. O antigo
 * `toISOString().split("T")[0]` deslocava o dia civil e era a origem do bug
 * de datas dos atestados.
 */

export function mapUser(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    crp: u.crp ?? undefined,
    title: u.title ?? undefined,
    gender: u.gender ?? "NAO_INFORMADO",
    institutionalLink: u.institutionalLink ?? undefined,
    birthDate: u.birthDate ? toDateOnly(u.birthDate) : undefined,
    matricula: u.matricula ?? undefined,
    color: u.color ?? undefined,
    capacity: u.capacity ?? undefined,
    mustChangePassword: u.mustChangePassword ?? false,
    // passwordHash NUNCA é enviado ao front-end.
  };
}

/**
 * Versão reduzida do usuário para listas visíveis a todos os perfis.
 * Não expõe e-mail, matrícula nem data de nascimento de colegas — dado
 * pessoal de funcionário também é protegido pela LGPD.
 */
export function mapUserPublic(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    crp: u.crp ?? undefined,
    title: u.title ?? undefined,
    gender: u.gender ?? "NAO_INFORMADO",
    color: u.color ?? undefined,
    capacity: u.capacity ?? undefined,
  };
}

export function mapHistoryLog(h: any) {
  return {
    id: h.id,
    date: toISO(h.date),
    actorId: h.actorId,
    actorName: h.actor?.name ?? "",
    actorRole: h.actor?.role ?? undefined,
    action: h.action,
    category: h.category ?? "CADASTRO",
    // `details` nunca contém conteúdo clínico (ver api/_lib/audit.ts).
    details: h.detailsEnc ? decryptField(h.detailsEnc) : undefined,
  };
}

export function mapAccessLog(a: any) {
  return {
    id: a.id,
    at: toISO(a.at),
    actorId: a.actorId,
    actorName: a.actor?.name ?? "",
    action: a.action,
    resource: a.resource,
  };
}

export function mapInstrumentApplicationEntry(e: any) {
  return {
    id: e.id,
    date: toISO(e.date),
    description: decryptField(e.descriptionEnc),
  };
}

export function mapInstrumentApplication(a: any) {
  return {
    id: a.id,
    instrumentId: a.instrumentId,
    psychoId: a.psychoId,
    purpose: decryptField(a.purposeEnc),
    createdAt: toISO(a.createdAt),
    entries: (a.entries ?? [])
      .map(mapInstrumentApplicationEntry)
      .sort((x: any, y: any) => new Date(x.date).getTime() - new Date(y.date).getTime()),
  };
}

export interface ClientMapOptions {
  /** Histórico só vai junto quando explicitamente pedido (rota dedicada). */
  includeHistory?: boolean;
  /** Instrumentos aplicados são dado clínico: só para quem tem acesso clínico. */
  includeClinical?: boolean;
}

export function mapClient(c: any, options: ClientMapOptions = {}) {
  const base = {
    id: c.id,
    protocolNumber: c.protocolNumber ?? undefined,
    signedAgreement: c.signedAgreement,
    fullName: decryptField(c.fullNameEnc),
    whatsapp: decryptField(c.whatsappEnc),
    birthDate: decryptField(c.birthDateEnc),
    registrationCode: c.registrationCode,
    affiliation: c.affiliation,
    allocation: c.allocation,
    dependencyType: c.dependencyType ?? undefined,
    dependencySponsor: c.dependencySponsor ?? undefined,
    tags: c.tags ?? [],
    dateIncluded: toDateOnly(c.dateIncluded),
    status: c.status,
    priority: c.priority ?? undefined,
    assignedPsicoId: c.assignedPsicoId ?? undefined,
    assignedPsicoName: c.assignedPsico?.name ?? undefined,
    maxSessions: c.maxSessions,
    completedSessions: c.completedSessions,
    emergencyContactName: decryptField(c.emergencyContactNameEnc),
    emergencyContactPhone: decryptField(c.emergencyContactPhoneEnc),
    emergencyContactRelationship: decryptField(c.emergencyContactRelationshipEnc),
    residenceCityNeighborhood: decryptField(c.residenceCityNeighborhoodEnc),
    helpRequest: decryptField(c.helpRequestEnc),
    medications: decryptField(c.medicationsEnc),
    contactObservations: decryptField(c.contactObservationsEnc),
    sector: c.sector ?? undefined,
    workShift: c.workShift ?? undefined,
    whatsappAuthorized: c.whatsappAuthorized ?? undefined,
    previouslyAttended: c.previouslyAttended ?? undefined,
    contactMadeByName: c.contactMadeByName ?? undefined,
    contactDate: c.contactDate ? toISO(c.contactDate) : undefined,
    contactStatus: c.contactStatus ?? undefined,
    defaultRoom: c.defaultRoom ?? undefined,
    defaultTime: c.defaultTime ?? undefined,
    diagnosis: decryptField(c.diagnosisEnc),
    extension: c.extension ?? undefined,
    alescEntryDate: c.alescEntryDate ? toDateOnly(c.alescEntryDate) : undefined,
    needsReview: c.needsReview ?? false,
    reviewNotes: c.reviewNotes ?? undefined,
    cancellationReason: decryptField(c.cancellationReasonEnc),
    importBatchId: c.importBatchId ?? undefined,
    finalizedAt: c.finalizedAt ? toISO(c.finalizedAt) : undefined,
    retentionUntil: c.retentionUntil ? toDateOnly(c.retentionUntil) : undefined,
  } as Record<string, any>;

  if (options.includeHistory) {
    base.history = (c.history ?? []).map(mapHistoryLog);
  }
  if (options.includeClinical) {
    base.instruments = (c.instrumentApps ?? []).map(mapInstrumentApplication);
  }
  return base;
}

export function mapRecordVersion(v: any) {
  return {
    id: v.id,
    oldContent: decryptField(v.oldContentEnc),
    savedAt: toISO(v.savedAt),
  };
}

export function mapSession(s: any, viewerId?: string) {
  const isAuthor = !!viewerId && viewerId === s.psicoId;
  return {
    id: s.id,
    clientId: s.clientId,
    psicoId: s.psicoId,
    date: toISO(s.date),
    notes: decryptField(s.notesEnc),
    isDraft: s.isDraft,
    status: s.status ?? undefined,
    groupId: s.groupId ?? undefined,
    appointmentId: s.appointmentId ?? undefined,
    sessionType: s.sessionType ?? "ATENDIMENTO",
    groupSessionNumber: s.groupSessionNumber ?? undefined,
    attendance: s.attendance ?? undefined,
    createdAt: toISO(s.createdAt),
    updatedAt: toISO(s.updatedAt),
    versions: (s.versions ?? []).map(mapRecordVersion),
    /**
     * ANOTAÇÃO PRIVADA DO TERAPEUTA.
     * Só é decriptada e enviada para o próprio autor da sessão. Supervisor e
     * Administrativo NÃO recebem o campo — nem vazio, nem cifrado: ele
     * simplesmente não existe na resposta.
     *
     * `canWritePrivateNotes` diz à interface se deve exibir o editor, para que
     * o front-end não precise reimplementar essa regra por conta própria.
     */
    privateNotes: isAuthor ? decryptField(s.privateNotesEnc) : undefined,
    canWritePrivateNotes: isAuthor,
  };
}

export function mapGroup(g: any) {
  return {
    id: g.id,
    name: g.name,
    objective: g.objective,
    methodology: g.methodology ?? undefined,
    frequency: g.frequency ?? undefined,
    criteria: g.criteria ?? undefined,
    createdAt: toISO(g.createdAt),
    isActive: g.isActive,
    psychologistId: g.psychologistId,
    coPsychologistId: g.coPsychologistId ?? undefined,
    protocolNumber: g.protocolNumber ?? undefined,
    /**
     * memberIds traz apenas os vínculos ATIVOS — é o que as telas usam para
     * saber quem participa hoje.
     * `membros` traz o histórico completo, incluindo quem já foi desligado,
     * com data e desfecho. Registro documental não se apaga.
     */
    memberIds: (g.members ?? []).filter((m: any) => !m.exitedAt).map((m: any) => m.clientId),
    membros: (g.members ?? []).map((m: any) => ({
      clientId: m.clientId,
      joinedAt: toISO(m.joinedAt),
      exitedAt: m.exitedAt ? toISO(m.exitedAt) : undefined,
      exitOutcome: m.exitOutcome ?? undefined,
      exitReason: m.exitReason ?? undefined,
    })),
  };
}

export function mapGroupRecord(r: any) {
  return {
    id: r.id,
    content: decryptField(r.contentEnc),
    sessionDate: toDateOnly(r.sessionDate),
    groupId: r.groupId,
    authorId: r.authorId,
    createdAt: toISO(r.createdAt),
    isDraft: r.isDraft,
    attendance: (r.attendances ?? []).map((a: any) => ({ clientId: a.clientId, status: a.status })),
  };
}

export function mapAppointment(a: any) {
  return {
    id: a.id,
    clientId: a.clientId ?? undefined,
    groupId: a.groupId ?? undefined,
    psicoId: a.psicoId,
    roomId: a.roomId,
    date: toDateOnly(a.date),
    time: a.time,
    endTime: a.endTime ?? undefined,
    seriesId: a.seriesId ?? undefined,
    recurrence: a.recurrence ?? undefined,
    sessionNumber: a.sessionNumber ?? undefined,
    attendance: a.attendance ?? undefined,
    appointmentType: a.appointmentType ?? "ATENDIMENTO",
  };
}

export function mapConfigItem(i: any) {
  return { id: i.id, name: i.name, isActive: i.isActive };
}

export function mapInstrument(i: any) {
  return { id: i.id, name: i.name, sheetCount: i.sheetCount };
}

export function mapInstrumentLog(l: any) {
  return {
    id: l.id,
    instrumentId: l.instrumentId,
    date: toISO(l.date),
    type: l.type,
    amount: l.amount,
    newCount: l.newCount,
    userId: l.userId,
    protocolNumber: l.protocolNumber ?? undefined,
    reason: l.reason ?? undefined,
  };
}

export function mapClinicalDocument(d: any) {
  let data: any = {};
  try {
    data = JSON.parse(decryptField(d.dataEnc) || "{}");
  } catch {
    data = {};
  }
  return {
    id: d.id,
    clientId: d.clientId,
    type: d.type,
    data,
    authorId: d.authorId,
    authorName: d.author?.name ?? "",
    authorCrp: d.author?.crp ?? undefined,
    createdAt: toISO(d.createdAt),
    updatedAt: toISO(d.updatedAt),
  };
}

export function mapGroupClientNote(n: any) {
  return {
    id: n.id,
    clientId: n.clientId,
    groupId: n.groupId,
    authorId: n.authorId,
    content: decryptField(n.contentEnc),
    updatedAt: toISO(n.updatedAt),
  };
}

/**
 * Sessão SEM conteúdo clínico.
 *
 * Usado para o perfil Administrativo, que precisa de contagens (sessões
 * realizadas, pendências, ocupação da agenda) mas NÃO pode ler a evolução.
 * O texto do prontuário nem sequer é decriptado neste caminho.
 */
export function mapSessionMeta(s: any) {
  return {
    id: s.id,
    clientId: s.clientId,
    psicoId: s.psicoId,
    date: toISO(s.date),
    notes: "", // conteúdo clínico jamais sai daqui
    isDraft: s.isDraft,
    status: s.status ?? undefined,
    groupId: s.groupId ?? undefined,
    appointmentId: s.appointmentId ?? undefined,
    sessionType: s.sessionType ?? "ATENDIMENTO",
    groupSessionNumber: s.groupSessionNumber ?? undefined,
    attendance: s.attendance ?? undefined,
    createdAt: toISO(s.createdAt),
    updatedAt: toISO(s.updatedAt),
    versions: [],
    privateNotes: undefined,
    canWritePrivateNotes: false,
    clinicalContentHidden: true,
  };
}

/**
 * Fila de espera vista pelo PSICÓLOGO que ainda não é responsável pelo caso.
 *
 * O psicólogo precisa acompanhar a fila para saber quem está esperando e em
 * que posição — e precisa do contato de urgência caso surja necessidade. Mas
 * ele NÃO é responsável por essas pessoas, então não recebe o restante:
 * pedido de ajuda, diagnóstico/CID, medicações, observações de contato,
 * telefone pessoal, matrícula, setor.
 *
 * Isto é MINIMIZAÇÃO na origem (LGPD Art. 6º, III): o dado não trafega para o
 * navegador de quem não precisa dele. Esconder na tela não seria controle de
 * acesso — bastaria abrir o inspetor para ler tudo.
 */
export function mapClientWaitlistSummary(c: any) {
  return {
    id: c.id,
    fullName: decryptField(c.fullNameEnc),
    // Data E hora: é o que define a posição de quem entrou no mesmo dia.
    dateIncluded: toISO(c.dateIncluded),
    status: c.status,
    priority: c.priority ?? undefined,
    // Contato de urgência, conforme definido com o setor.
    emergencyContactName: decryptField(c.emergencyContactNameEnc),
    emergencyContactPhone: decryptField(c.emergencyContactPhoneEnc),
    emergencyContactRelationship: decryptField(c.emergencyContactRelationshipEnc),
    /** Sinaliza à interface que este cadastro veio reduzido. */
    limitedView: true,
    tags: [],
  } as Record<string, any>;
}
