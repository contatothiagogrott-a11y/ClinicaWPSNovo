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
  email: string;
  password?: string;
  role: Role;
  crp?: string;
  title?: string;
  institutionalLink?: string;
  birthDate?: string;
  matricula?: string;
  color?: string;
}

export type ClientStatus =
  | "FILA_ESPERA"
  | "TRIAGEM"
  | "TRIADOS"
  | "EM_ATENDIMENTO"
  | "FINALIZADO";

export type Priority = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export interface HistoryLog {
  id: string;
  date: string;
  actorId: string;
  actorName: string;
  action: string;
  details?: string;
}

export interface InstrumentApplication {
  id: string;
  instrumentId: string;
  date: string;
  psychoId: string;
  results: string;
}

export interface Client {
  id: string;
  protocolNumber: string;
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
  history: HistoryLog[];
  maxSessions: number;
  completedSessions: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
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
  id: string;
  clientId: string;
  psicoId: string;
  date: string;
  notes: string;
  isDraft: boolean;
  status?: "PENDENTE" | "CONCLUIDO"; // For auto-generated group individual records
  groupId?: string; // If this individual record was generated from a group session
  createdAt: string;
  updatedAt: string;
  attendance?: AttendanceStatus;
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
  memberIds: string[];
}

export interface GroupRecord {
  id: string;
  content: string;
  sessionDate: string; // YYYY-MM-DD
  groupId: string;
  authorId: string;
  createdAt: string;
  isDraft?: boolean;
}

export interface ConfigItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Appointment {
  attendance?: "PENDENTE" | "COMPARECEU" | "FALTA_JUSTIFICADA" | "FALTA_INJUSTIFICADA";
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
