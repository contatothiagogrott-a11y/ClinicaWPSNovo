import { decryptField } from "./crypto";

const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().split("T")[0] : "");
const isoDate = (d: Date | null | undefined) => (d ? d.toISOString() : "");

export function mapUser(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    crp: u.crp ?? undefined,
    title: u.title ?? undefined,
    institutionalLink: u.institutionalLink ?? undefined,
    birthDate: u.birthDate ? dateOnly(u.birthDate) : undefined,
    matricula: u.matricula ?? undefined,
    color: u.color ?? undefined,
    capacity: u.capacity ?? undefined,
    // password NUNCA é enviado ao front-end.
  };
}

export function mapHistoryLog(h: any) {
  return {
    id: h.id,
    date: isoDate(h.date),
    actorId: h.actorId,
    actorName: h.actor?.name ?? "",
    action: h.action,
    details: h.detailsEnc ? decryptField(h.detailsEnc) : undefined,
  };
}

export function mapInstrumentApplication(a: any) {
  return {
    id: a.id,
    instrumentId: a.instrumentId,
    date: isoDate(a.date),
    psychoId: a.psychoId,
    results: decryptField(a.resultsEnc),
  };
}

export function mapClient(c: any) {
  return {
    id: c.id,
    protocolNumber: c.protocolNumber,
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
    dateIncluded: dateOnly(c.dateIncluded),
    status: c.status,
    priority: c.priority ?? undefined,
    assignedPsicoId: c.assignedPsicoId ?? undefined,
    assignedPsicoName: c.assignedPsico?.name ?? undefined,
    history: (c.history ?? []).map(mapHistoryLog),
    maxSessions: c.maxSessions,
    completedSessions: c.completedSessions,
    emergencyContactName: decryptField(c.emergencyContactNameEnc),
    emergencyContactPhone: decryptField(c.emergencyContactPhoneEnc),
    defaultRoom: c.defaultRoom ?? undefined,
    defaultTime: c.defaultTime ?? undefined,
    instruments: (c.instrumentApps ?? []).map(mapInstrumentApplication),
  };
}

export function mapRecordVersion(v: any) {
  return {
    id: v.id,
    oldContent: decryptField(v.oldContentEnc),
    savedAt: isoDate(v.savedAt),
  };
}

export function mapSession(s: any) {
  return {
    id: s.id,
    clientId: s.clientId,
    psicoId: s.psicoId,
    date: isoDate(s.date),
    notes: decryptField(s.notesEnc),
    isDraft: s.isDraft,
    status: s.status ?? undefined,
    groupId: s.groupId ?? undefined,
    appointmentId: s.appointmentId ?? undefined,
    attendance: s.attendance ?? undefined,
    createdAt: isoDate(s.createdAt),
    updatedAt: isoDate(s.updatedAt),
    versions: (s.versions ?? []).map(mapRecordVersion),
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
    createdAt: isoDate(g.createdAt),
    isActive: g.isActive,
    psychologistId: g.psychologistId,
    memberIds: (g.members ?? []).map((m: any) => m.clientId),
  };
}

export function mapGroupRecord(r: any) {
  return {
    id: r.id,
    content: decryptField(r.contentEnc),
    sessionDate: dateOnly(r.sessionDate),
    groupId: r.groupId,
    authorId: r.authorId,
    createdAt: isoDate(r.createdAt),
    isDraft: r.isDraft,
  };
}

export function mapAppointment(a: any) {
  return {
    id: a.id,
    clientId: a.clientId ?? undefined,
    groupId: a.groupId ?? undefined,
    psicoId: a.psicoId,
    roomId: a.roomId,
    date: dateOnly(a.date),
    time: a.time,
    endTime: a.endTime ?? undefined,
    seriesId: a.seriesId ?? undefined,
    recurrence: a.recurrence ?? undefined,
    sessionNumber: a.sessionNumber ?? undefined,
    attendance: a.attendance ?? undefined,
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
    date: isoDate(l.date),
    type: l.type,
    amount: l.amount,
    newCount: l.newCount,
    userId: l.userId,
    protocolNumber: l.protocolNumber ?? undefined,
    reason: l.reason ?? undefined,
  };
}
