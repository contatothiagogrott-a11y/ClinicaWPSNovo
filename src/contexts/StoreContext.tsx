import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Client, SessionRecord, AppConfig, ClientStatus, ConfigItem, Appointment, Group, GroupRecord, Instrument, InstrumentLog, ClinicalDocument, ClinicalDocumentType, GroupClientNote, HistoryLog, AccessLogEntry } from "../types";
import { api, ApiError } from "../lib/api";
import { clearAppCache } from "../lib/pwa";

export interface StoreState {
  users: User[];
  clients: Client[];
  sessions: SessionRecord[];
  appointments: Appointment[];
  groups: Group[];
  groupRecords: GroupRecord[];
  config: AppConfig;
  instruments: Instrument[];
  instrumentLogs: InstrumentLog[];
  clinicalDocuments: ClinicalDocument[];
  groupClientNotes: GroupClientNote[];
  currentUser: User | null;
  /**
   * IDs dos pacientes cujo conteúdo clínico este usuário pode ver.
   * Quem decide é a API — a interface apenas obedece. Nenhuma tela deve
   * recalcular essa regra por conta própria.
   */
  clinicalClientIds: string[];
}

const EMPTY_CONFIG: AppConfig = { affiliations: [], allocations: [], rooms: [], tags: [] };

interface StoreContextType extends StoreState {
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  setCurrentUser: (user: User | null) => void; // setCurrentUser(null) = logout
  addClient: (client: Omit<Client, "id" | "history" | "completedSessions">) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>, logAction?: string) => Promise<void>;
  /** Transferência de responsável (Supervisor/Administrativo, com justificativa). */
  transferClient: (clientId: string, newPsicoId: string | null, reason: string) => Promise<void>;
  /** Trilha de auditoria do paciente, carregada sob demanda. */
  fetchClientHistory: (clientId: string) => Promise<HistoryLog[]>;
  fetchClientAccessLog: (clientId: string) => Promise<AccessLogEntry[]>;
  /** Registra a abertura do prontuário na trilha de leitura. */
  registerClientAccess: (clientId: string, resource: string) => Promise<void>;
  /** Registra a exportação de um PDF na trilha de auditoria. */
  registerDocumentExport: (clientId: string, documentLabel: string) => Promise<void>;
  /** Troca da própria senha (obrigatória no primeiro acesso). */
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Gera nova senha provisória para outro usuário (Supervisor/Admin). */
  resetUserPassword: (userId: string) => Promise<string>;
  mustChangePassword: boolean;
  /** Momento da última sincronização com o servidor. */
  lastSyncedAt: Date | null;
  /** Força uma sincronização imediata. */
  syncNow: () => Promise<void>;
  addSession: (session: Omit<SessionRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<void>;
  updateSession: (id: string, newContent: string) => Promise<void>;
  updatePrivateSessionNotes: (id: string, text: string) => Promise<void>;
  addGroup: (group: Omit<Group, "id" | "createdAt" | "memberIds">) => Promise<void>;
  updateGroup: (id: string, updates: Partial<Group>) => Promise<void>;
  addGroupRecord: (record: Omit<GroupRecord, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  reactivateClient: (clientId: string, newStatus: ClientStatus) => Promise<void>;
  addAppointment: (appt: Omit<Appointment, "id">) => Promise<void>;
  updateAppointment: (id: string, updates: Partial<Appointment>, applyToFuture?: boolean) => Promise<number>;
  deleteAppointment: (id: string, deleteFuture?: boolean) => Promise<void>;
  markAttendance: (appointmentId: string, attendance: NonNullable<Appointment["attendance"]>) => Promise<void>;
  updateConfig: (config: AppConfig) => void;
  addConfigItem: (type: "affiliations" | "allocations" | "rooms" | "tags", name: string) => Promise<void>;
  updateConfigItem: (type: "affiliations" | "allocations" | "rooms" | "tags", id: string, updates: Partial<ConfigItem>) => Promise<void>;
  /** Cria o usuário e devolve a senha provisória gerada pelo servidor. */
  addUser: (user: Omit<User, "id"> & { crp?: string }) => Promise<string>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  logClientHistory: (clientId: string, action: string, details?: string) => Promise<void>;
  addInstrument: (name: string, initialCount: number) => Promise<void>;
  adjustInstrumentStock: (id: string, newCount: number, reason: string) => Promise<void>;
  applyInstrument: (clientId: string, instrumentId: string, purpose: string, date: string, description: string) => Promise<void>;
  addInstrumentApplicationEntry: (applicationId: string, date: string, description: string) => Promise<void>;
  updateInstrumentApplication: (applicationId: string, updates: { purpose?: string; entry?: { id: string; date?: string; description?: string } }) => Promise<void>;
  addClinicalDocument: (clientId: string, type: ClinicalDocumentType, data: Record<string, any>) => Promise<ClinicalDocument>;
  updateClinicalDocument: (id: string, data: Record<string, any>) => Promise<void>;
  importClients: (
    rows: Record<string, any>[],
    sourceLabel?: string,
    onProgress?: (enviadas: number, total: number) => void,
    status?: "FILA_ESPERA" | "FINALIZADO" | "CANCELADO"
  ) => Promise<{ created: number; flagged: number; errors: { row: number; error: string }[]; importBatchId: string }>;
  /** Desfaz uma importação inteira pelo identificador do lote. */
  undoImport: (batchId: string) => Promise<number>;
  /** Marca um cadastro importado como conferido. */
  markClientReviewed: (clientId: string) => Promise<void>;
  /** Remove prontuários pendentes vazios (órfãos, futuros e de encontros que não ocorreram). */
  limparProntuariosVazios: () => Promise<number>;
  saveGroupClientNote: (clientId: string, groupId: string, content: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

interface BootstrapResponse {
  users: User[];
  clients: Client[];
  sessions: SessionRecord[];
  appointments: Appointment[];
  groups: Group[];
  groupRecords: GroupRecord[];
  config: AppConfig;
  instruments: Instrument[];
  instrumentLogs: InstrumentLog[];
  clinicalDocuments: ClinicalDocument[];
  groupClientNotes: GroupClientNote[];
  clinicalClientIds: string[];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupRecords, setGroupRecords] = useState<GroupRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentLogs, setInstrumentLogs] = useState<InstrumentLog[]>([]);
  const [clinicalDocuments, setClinicalDocuments] = useState<ClinicalDocument[]>([]);
  const [groupClientNotes, setGroupClientNotes] = useState<GroupClientNote[]>([]);
  const [clinicalClientIds, setClinicalClientIds] = useState<string[]>([]);
  /** Evita duas cargas simultâneas quando foco e timer disparam juntos. */
  const isRefreshingRef = React.useRef(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const applyBootstrap = (data: BootstrapResponse) => {
    setUsers(data.users);
    setClients(data.clients);
    setSessions(data.sessions);
    setAppointments(data.appointments);
    setGroups(data.groups);
    setGroupRecords(data.groupRecords);
    setConfig(data.config);
    setInstruments(data.instruments);
    setInstrumentLogs(data.instrumentLogs);
    setClinicalDocuments(data.clinicalDocuments);
    setGroupClientNotes(data.groupClientNotes);
    setClinicalClientIds(data.clinicalClientIds ?? []);
    setLastSyncedAt(new Date());
  };

  // Recarrega todos os dados do servidor. Chamado depois de toda operação de
  // escrita para manter o front-end sempre em sincronia com o banco (Neon).
  const refreshAll = useCallback(async () => {
    try {
      const data = await api.get<BootstrapResponse>("/api/bootstrap");
      applyBootstrap(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUserState(null);
      }
      // 423 = senha provisória pendente de troca. Não é erro: o app mostra a
      // tela de troca de senha e só libera o restante depois disso.
      if (err instanceof ApiError && err.status === 423) {
        setMustChangePassword(true);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.get<{ user: User }>("/api/auth/me");
        setCurrentUserState(user);
        setMustChangePassword(!!user.mustChangePassword);
        if (!user.mustChangePassword) await refreshAll();
      } catch {
        setCurrentUserState(null);
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * SINCRONIZAÇÃO AUTOMÁTICA
   * ------------------------
   * Antes, os dados só eram recarregados depois de uma ação do próprio
   * usuário. Quem deixasse a tela aberta — ou estivesse vendo a agenda
   * enquanto um colega marcava um atendimento — via informação velha e
   * precisava apertar F5.
   *
   * Agora recarrega quando a aba volta ao foco (o caso mais comum: alternar
   * entre janelas) e a cada 90 segundos com a aba visível. Nada roda em aba
   * escondida, para não gastar bateria nem banda à toa.
   *
   * O rascunho de prontuário NÃO é afetado: ele vive no estado local da tela,
   * não no store.
   */
  const syncIfIdle = useCallback(async () => {
    if (isRefreshingRef.current) return;
    if (document.visibilityState !== "visible") return;
    isRefreshingRef.current = true;
    try {
      await refreshAll();
    } catch {
      // Falha de rede aqui é silenciosa de propósito: é atualização de fundo,
      // não pode interromper o que a pessoa está fazendo.
    } finally {
      isRefreshingRef.current = false;
    }
  }, [refreshAll]);

  useEffect(() => {
    if (!currentUser || mustChangePassword) return;

    const onFocus = () => { void syncIfIdle(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncIfIdle();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => { void syncIfIdle(); }, 90_000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [currentUser, mustChangePassword, syncIfIdle]);

  const login = async (email: string, password: string) => {
    try {
      const { user } = await api.post<{ user: User }>("/api/auth/login", { email, password });
      setCurrentUserState(user);
      setMustChangePassword(!!user.mustChangePassword);
      if (!user.mustChangePassword) await refreshAll();
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
      return { ok: false, error: message };
    }
  };

  const setCurrentUser = (user: User | null) => {
    if (user === null) {
      api.post("/api/auth/logout").catch(() => {});
      clearAppCache();
      setMustChangePassword(false);
      setClinicalClientIds([]);
      setCurrentUserState(null);
      setUsers([]);
      setClients([]);
      setSessions([]);
      setAppointments([]);
      setGroups([]);
      setGroupRecords([]);
      setConfig(EMPTY_CONFIG);
      setInstruments([]);
      setInstrumentLogs([]);
      setClinicalDocuments([]);
      setGroupClientNotes([]);
      return;
    }
    // Por segurança, trocar de usuário sem senha não é permitido: só é possível
    // "logar" de fato via login(). Isso substitui o antigo seletor de "Modo Teste".
    setCurrentUserState(user);
  };

  const addClient: StoreContextType["addClient"] = async (client) => {
    await api.post("/api/clients", client);
    await refreshAll();
  };

  const updateClient: StoreContextType["updateClient"] = async (id, updates, logAction) => {
    await api.patch(`/api/clients/${id}`, { ...updates, logAction });
    await refreshAll();
  };

  const addSession: StoreContextType["addSession"] = async (sessionData) => {
    await api.post("/api/sessions", sessionData);
    await refreshAll();
  };

  const updateSession: StoreContextType["updateSession"] = async (id, newContent) => {
    await api.patch(`/api/sessions/${id}`, { notes: newContent, isDraft: false });
    await refreshAll();
  };

  const updatePrivateSessionNotes: StoreContextType["updatePrivateSessionNotes"] = async (id, text) => {
    await api.patch(`/api/sessions/${id}`, { privateNotes: text });
    await refreshAll();
  };

  const addGroup: StoreContextType["addGroup"] = async (group) => {
    await api.post("/api/groups", group);
    await refreshAll();
  };

  const updateGroup: StoreContextType["updateGroup"] = async (id, updates) => {
    await api.patch(`/api/groups/${id}`, updates);
    await refreshAll();
  };

  const addGroupRecord: StoreContextType["addGroupRecord"] = async (record) => {
    await api.post("/api/group-records", record);
    await refreshAll();
  };

  const reactivateClient: StoreContextType["reactivateClient"] = async (clientId, newStatus) => {
    await updateClient(clientId, { status: newStatus }, `Caso reativado e movido para ${newStatus} por ${currentUser?.name}`);
  };

  const addAppointment: StoreContextType["addAppointment"] = async (appt) => {
    await api.post("/api/appointments", appt);
    await refreshAll();
  };

  const updateAppointment: StoreContextType["updateAppointment"] = async (id, updates, applyToFuture) => {
    const result = await api.patch<{ futureUpdated?: number }>(`/api/appointments/${id}`, {
      ...updates,
      applyToFuture: !!applyToFuture,
    });
    await refreshAll();
    return result?.futureUpdated ?? 0;
  };

  const deleteAppointment: StoreContextType["deleteAppointment"] = async (id, deleteFuture) => {
    await api.delete(`/api/appointments/${id}${deleteFuture ? "?deleteFuture=true" : ""}`);
    await refreshAll();
  };

  const markAttendance: StoreContextType["markAttendance"] = async (appointmentId, attendance) => {
    await api.patch(`/api/appointments/${appointmentId}`, { attendance });
    await refreshAll();
  };

  const updateConfig = (newConfig: AppConfig) => {
    // A tela de configurações usa addConfigItem/updateConfigItem para persistir;
    // isso aqui só reflete o estado local (ex.: reordenações puramente visuais).
    setConfig(newConfig);
  };

  const addConfigItem: StoreContextType["addConfigItem"] = async (type, name) => {
    await api.post(`/api/config/${type}`, { name });
    await refreshAll();
  };

  const updateConfigItem: StoreContextType["updateConfigItem"] = async (type, id, updates) => {
    await api.patch(`/api/config/${type}/${id}`, updates);
    await refreshAll();
  };

  const addUser: StoreContextType["addUser"] = async (user) => {
    // A senha provisória é gerada NO SERVIDOR e devolvida uma única vez.
    // O navegador nunca escolhe nem armazena senha de ninguém.
    const { temporaryPassword } = await api.post<{ user: User; temporaryPassword: string }>(
      "/api/users",
      user
    );
    await refreshAll();
    return temporaryPassword;
  };

  const updateUser: StoreContextType["updateUser"] = async (id, updates) => {
    const { user } = await api.patch<{ user: User }>(`/api/users/${id}`, updates);
    if (currentUser?.id === id) setCurrentUserState(user);
    await refreshAll();
  };

  const deleteUser: StoreContextType["deleteUser"] = async (id) => {
    await api.delete(`/api/users/${id}`);
    await refreshAll();
  };

  const logClientHistory: StoreContextType["logClientHistory"] = async (clientId, action, details) => {
    await api.patch(`/api/clients/${clientId}`, { logAction: action, logDetails: details });
    await refreshAll();
  };

  // -------------------------------------------------------------------------
  // Auditoria, transferência e credenciais
  // -------------------------------------------------------------------------

  const transferClient: StoreContextType["transferClient"] = async (clientId, newPsicoId, reason) => {
    await api.patch(`/api/clients/${clientId}`, {
      assignedPsicoId: newPsicoId,
      transferReason: reason,
    });
    await refreshAll();
  };

  const fetchClientHistory: StoreContextType["fetchClientHistory"] = async (clientId) => {
    const { history } = await api.get<{ history: HistoryLog[] }>(`/api/clients/${clientId}/history`);
    return history;
  };

  const fetchClientAccessLog: StoreContextType["fetchClientAccessLog"] = async (clientId) => {
    const { accessLog } = await api.get<{ accessLog: AccessLogEntry[] }>(
      `/api/clients/${clientId}/access-log`
    );
    return accessLog;
  };

  const registerClientAccess: StoreContextType["registerClientAccess"] = async (clientId, resource) => {
    // Falha de trilha não pode impedir o atendimento: registra e segue.
    await api.post(`/api/clients/${clientId}/register-access`, { resource }).catch(() => {});
  };

  const registerDocumentExport: StoreContextType["registerDocumentExport"] = async (clientId, documentLabel) => {
    await api.post(`/api/clients/${clientId}/document-export`, { documentLabel }).catch(() => {});
  };

  const changeOwnPassword: StoreContextType["changeOwnPassword"] = async (currentPassword, newPassword) => {
    const { user } = await api.post<{ user: User }>("/api/auth/change-password", {
      currentPassword,
      newPassword,
    });
    setCurrentUserState(user);
    setMustChangePassword(false);
    await refreshAll();
  };

  const resetUserPassword: StoreContextType["resetUserPassword"] = async (userId) => {
    const { temporaryPassword } = await api.patch<{ temporaryPassword: string }>(
      `/api/users/${userId}`,
      { resetPassword: true }
    );
    await refreshAll();
    return temporaryPassword;
  };

  const addInstrument: StoreContextType["addInstrument"] = async (name, initialCount) => {
    await api.post("/api/instruments", { name, initialCount });
    await refreshAll();
  };

  const adjustInstrumentStock: StoreContextType["adjustInstrumentStock"] = async (id, newCount, reason) => {
    await api.patch(`/api/instruments/${id}/stock`, { newCount, reason });
    await refreshAll();
  };

  const applyInstrument: StoreContextType["applyInstrument"] = async (clientId, instrumentId, purpose, date, description) => {
    await api.post(`/api/instruments/${instrumentId}/apply`, { clientId, purpose, date, description });
    await refreshAll();
  };

  const addInstrumentApplicationEntry: StoreContextType["addInstrumentApplicationEntry"] = async (applicationId, date, description) => {
    await api.post(`/api/instrument-applications/${applicationId}/entries`, { date, description });
    await refreshAll();
  };

  const updateInstrumentApplication: StoreContextType["updateInstrumentApplication"] = async (applicationId, updates) => {
    await api.patch(`/api/instrument-applications/${applicationId}`, updates);
    await refreshAll();
  };

  const addClinicalDocument: StoreContextType["addClinicalDocument"] = async (clientId, type, data) => {
    const { clinicalDocument } = await api.post<{ clinicalDocument: ClinicalDocument }>("/api/clinical-documents", { clientId, type, data });
    await refreshAll();
    return clinicalDocument;
  };

  const updateClinicalDocument: StoreContextType["updateClinicalDocument"] = async (id, data) => {
    await api.patch(`/api/clinical-documents/${id}`, { data });
    await refreshAll();
  };

  const limparProntuariosVazios: StoreContextType["limparProntuariosVazios"] = async () => {
    const { removidos } = await api.post<{ removidos: number }>(
      "/api/manutencao/limpar-prontuarios-vazios"
    );
    await refreshAll();
    return removidos;
  };

  const markClientReviewed: StoreContextType["markClientReviewed"] = async (clientId) => {
    await api.post(`/api/clients/${clientId}/mark-reviewed`);
    await refreshAll();
  };

  /**
   * Importa em PEDAÇOS de 50 linhas.
   *
   * Uma planilha inteira numa única requisição estourava o tempo limite da
   * função na Vercel (erro 504). Fatiar resolve de duas formas: cada
   * requisição é curta, e o usuário vê o progresso em vez de uma tela parada.
   *
   * Todos os pedaços compartilham o mesmo `importBatchId`, então "desfazer
   * importação" continua apagando a planilha inteira de uma vez.
   */
  const importClients: StoreContextType["importClients"] = async (rows, sourceLabel, onProgress, status) => {
    const TAMANHO_DO_LOTE = 50;
    let importBatchId = "";
    let created = 0;
    let flagged = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i += TAMANHO_DO_LOTE) {
      const pedaco = rows.slice(i, i + TAMANHO_DO_LOTE);
      const res = await api.post<{
        created: number;
        flagged: number;
        errors: { row: number; error: string }[];
        importBatchId: string;
      }>("/api/clients/import", { rows: pedaco, sourceLabel, status, importBatchId: importBatchId || undefined });

      importBatchId = res.importBatchId;
      created += res.created;
      flagged += res.flagged;
      if (res.errors?.length) errors.push(...res.errors);
      onProgress?.(Math.min(i + TAMANHO_DO_LOTE, rows.length), rows.length);
    }

    await refreshAll();
    return { created, flagged, errors, importBatchId };
  };

  const undoImport: StoreContextType["undoImport"] = async (batchId) => {
    const res = await api.delete<{ deleted: number }>(`/api/clients/import/${batchId}`);
    await refreshAll();
    return res.deleted;
  };

  const saveGroupClientNote: StoreContextType["saveGroupClientNote"] = async (clientId, groupId, content) => {
    await api.post("/api/group-client-notes", { clientId, groupId, content });
    await refreshAll();
  };

  if (isLoading) return null;

  return (
    <StoreContext.Provider
      value={{
        users,
        clients,
        sessions,
        appointments,
        groups,
        groupRecords,
        config,
        instruments,
        instrumentLogs,
        clinicalDocuments,
        groupClientNotes,
        clinicalClientIds,
        currentUser,
        isLoading,
        mustChangePassword,
        lastSyncedAt,
        syncNow: syncIfIdle,
        login,
        setCurrentUser,
        addClient,
        updateClient,
        transferClient,
        fetchClientHistory,
        fetchClientAccessLog,
        registerClientAccess,
        registerDocumentExport,
        changeOwnPassword,
        resetUserPassword,
        addSession,
        updateSession,
        updatePrivateSessionNotes,
        addGroup,
        updateGroup,
        addGroupRecord,
        reactivateClient,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        markAttendance,
        updateConfig,
        addConfigItem,
        updateConfigItem,
        addUser,
        updateUser,
        deleteUser,
        logClientHistory,
        addInstrument,
        adjustInstrumentStock,
        applyInstrument,
        addInstrumentApplicationEntry,
        updateInstrumentApplication,
        addClinicalDocument,
        updateClinicalDocument,
        importClients,
        undoImport,
        markClientReviewed,
        limparProntuariosVazios,
        saveGroupClientNote,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
