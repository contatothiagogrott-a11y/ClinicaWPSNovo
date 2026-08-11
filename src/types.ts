export type Role = "SUPERVISOR" | "ADMIN" | "PSICO";

export interface UserCapacity {
  urgente: number;
  alta: number;
  media: number;
  baixa: number;
}

export interface User {
  capacity?: UserCapacity;
  id: string;
  name: string;
  /** Só vem preenchido para o próprio usuário logado (minimização de dados). */
  email?: string;
  role: Role;
  /** Flexão do título profissional em documentos ("Psicóloga" vs "Psicólogo"). */
  gender?: "FEMININO" | "MASCULINO" | "NAO_INFORMADO";
  /** Senha provisória pendente de troca no primeiro acesso. */
  mustChangePassword?: boolean;
  crp?: string;
  title?: string;
  institutionalLink?: string;
  birthDate?: string;
  matricula?: string;
  color?: string;
}

/**
 * CANCELADO = a pessoa entrou na fila mas não chegou a ser atendida
 * (não retornou o contato, desistiu, telefone inválido).
 *
 * É diferente de FINALIZADO, que significa serviço prestado e encerrado —
 * distinção que importa para as métricas do setor e para o prazo de guarda
 * do registro documental (Res. CFP nº 001/2009).
 */
export type ClientStatus =
  | "FILA_ESPERA"
  | "TRIAGEM"
  | "TRIADOS"
  | "EM_ATENDIMENTO"
  | "FINALIZADO"
  | "CANCELADO";

export type Priority = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export type HistoryCategory =
  | "CADASTRO"
  | "CLINICO"
  | "DOCUMENTO"
  | "TRANSFERENCIA"
  | "FLUXO"
  | "SISTEMA";

export interface HistoryLog {
  id: string;
  date: string;
  actorId: string;
  actorName: string;
  actorRole?: Role;
  action: string;
  category: HistoryCategory;
  /**
   * Metainformação apenas. Para entradas da categoria CLINICO este campo é
   * sempre vazio — conteúdo de prontuário nunca entra na trilha de auditoria.
   */
  details?: string;
}

/** Trilha de leitura/exportação de dado sensível. */
export interface AccessLogEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  resource: string;
}

export interface InstrumentApplicationEntry {
  id: string;
  date: string;
  description: string;
}

export interface InstrumentApplication {
  id: string;
  instrumentId: string;
  psychoId: string;
  purpose: string;
  createdAt: string;
  entries: InstrumentApplicationEntry[];
}

export interface Client {
  id: string;
  /** Nulo enquanto o caso está na fila de espera (ainda não há prontuário aberto). */
  protocolNumber?: string;
  signedAgreement?: boolean;
  fullName: string;
  whatsapp: string;
  birthDate: string;
  registrationCode: string;
  affiliation: string;
  allocation: string;
  dependencyType?: string;
  dependencySponsor?: string;
  tags?: string[];
  dateIncluded: string;
  status: ClientStatus;
  priority?: Priority;
  assignedPsicoId?: string;
  assignedPsicoName?: string;
  /**
   * Carregado sob demanda em /api/clients/:id/history (não vem no bootstrap).
   * Visível apenas para Supervisor e Administrativo.
   */
  history?: HistoryLog[];
  /** Diagnóstico/CID informado no formulário (dado sensível, criptografado). */
  diagnosis?: string;
  /** Ramal institucional. */
  extension?: string;
  /** Mês/ano de ingresso na ALESC. */
  alescEntryDate?: string;
  /** Cadastro importado que precisa de conferência humana. */
  needsReview?: boolean;
  reviewNotes?: string;
  /**
   * true quando o cadastro chegou em versão reduzida (psicólogo vendo a fila
   * de espera de quem ainda não é paciente dele). Os demais campos não vêm.
   */
  limitedView?: boolean;
  /** Motivo do encerramento sem atendimento (status CANCELADO). */
  cancellationReason?: string;
  /** Lote de importação (permite desfazer uma importação inteira). */
  importBatchId?: string;
  /** Encerramento do caso e prazo de guarda do registro documental. */
  finalizedAt?: string;
  retentionUntil?: string;
  maxSessions: number;
  completedSessions: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship?: string;
  residenceCityNeighborhood?: string;
  helpRequest?: string;
  medications?: string;
  sector?: string;
  workShift?: string;
  whatsappAuthorized?: boolean;
  previouslyAttended?: boolean;
  contactMadeByName?: string;
  contactDate?: string;
  contactStatus?: string;
  contactObservations?: string;
  defaultRoom?: string;
  defaultTime?: string;
  instruments?: InstrumentApplication[];
}

export type AttendanceStatus = "PRESENTE" | "FALTA_JUSTIFICADA" | "FALTA_NAO_JUSTIFICADA";

export interface RecordVersion {
  id: string;
  oldContent: string;
  savedAt: string;
}

export interface SessionRecord {
  appointmentId?: string;
  /** Natureza do registro: atendimento, triagem de grupo, entrevista, devolutiva. */
  sessionType?: "ATENDIMENTO" | "TRIAGEM_GRUPO" | "ENTREVISTA" | "DEVOLUTIVA";
  id: string;
  clientId: string;
  psicoId: string;
  date: string;
  notes: string;
  /** Só chega ao navegador do próprio autor da sessão. */
  privateNotes?: string;
  /** A API informa se este usuário pode escrever a anotação privada. */
  canWritePrivateNotes?: boolean;
  /** true quando o conteúdo clínico foi omitido pela API (perfil sem acesso). */
  clinicalContentHidden?: boolean;
  isDraft: boolean;
  status?: "PENDENTE" | "CONCLUIDO"; // For auto-generated group individual records
  groupId?: string; // If this individual record was generated from a group session
  createdAt: string;
  updatedAt: string;
  attendance?: AttendanceStatus;
  sessionNumber?: number;
  versions?: RecordVersion[];
}

export interface Group {
  id: string;
  name: string;
  objective: string;
  methodology?: string;
  frequency?: string;
  criteria?: string;
  createdAt: string;
  isActive: boolean;
  psychologistId: string;
  /** Coterapeuta: segundo responsável, também com acesso aos prontuários do grupo. */
  coPsychologistId?: string;
  memberIds: string[];
}

export interface GroupAttendanceEntry {
  clientId: string;
  status: "COMPARECEU" | "FALTA_JUSTIFICADA" | "FALTA_INJUSTIFICADA" | "PENDENTE";
}

export interface GroupRecord {
  id: string;
  content: string;
  sessionDate: string; // YYYY-MM-DD
  groupId: string;
  authorId: string;
  createdAt: string;
  isDraft?: boolean;
  attendance?: GroupAttendanceEntry[];
}

export interface ConfigItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Appointment {
  /**
   * Situação do agendamento.
   *
   * Cancelamento e reagendamento são distintos de FALTA: quem avisou e
   * desmarcou não pode ser contabilizado como faltoso, e o cancelamento pelo
   * serviço (afastamento do profissional, mudança de escala) não diz nada
   * sobre a adesão do paciente. Nenhum dos três consome sessão do pacote.
   */
  /**
   * Natureza do compromisso. Só ATENDIMENTO abre prontuário automaticamente;
   * triagem, entrevista, devolutiva e reunião ocupam a agenda sem gerar
   * registro clínico.
   */
  appointmentType?: "ATENDIMENTO" | "TRIAGEM_GRUPO" | "ENTREVISTA" | "DEVOLUTIVA" | "REUNIAO";
  attendance?:
    | "PENDENTE"
    | "COMPARECEU"
    | "FALTA_JUSTIFICADA"
    | "FALTA_INJUSTIFICADA"
    | "CANCELADO_PACIENTE"
    | "CANCELADO_PROFISSIONAL"
    | "REAGENDADO";
  sessionNumber?: number;
  id: string;
  clientId?: string;
  groupId?: string;
  psicoId: string;
  roomId: string; // stores configItem.name directly
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  endTime?: string; // HH:mm
  seriesId?: string;
  recurrence?: "none" | "weekly" | "biweekly";
}

export interface AppConfig {
  affiliations: ConfigItem[];
  allocations: ConfigItem[];
  rooms: ConfigItem[];
  tags: ConfigItem[];
}

export interface Instrument {
  id: string;
  name: string;
  sheetCount: number;
}

export interface InstrumentLog {
  id: string;
  instrumentId: string;
  date: string;
  type: "CONSUMPTION" | "ADJUSTMENT" | "INITIAL";
  amount: number;
  newCount: number;
  userId: string;
  protocolNumber?: string;
  reason?: string;
}

export interface GroupClientNote {
  id: string;
  clientId: string;
  groupId: string;
  authorId: string;
  content: string;
  updatedAt: string;
}

export type ClinicalDocumentType = "ANAMNESE_RISCO" | "URGENCIA" | "ATESTADO";

export interface ClinicalDocument {
  id: string;
  clientId: string;
  type: ClinicalDocumentType;
  data: Record<string, any>;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}
