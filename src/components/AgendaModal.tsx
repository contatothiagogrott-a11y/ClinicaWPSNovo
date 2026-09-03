import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { X, Clock, Trash2, Repeat, ExternalLink, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toDate, toDateOnly } from "../lib/datetime";
import { Appointment } from "../types";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { clinicians } from "../lib/roles";

const STATUS_LABELS: Record<string, string> = {
  FILA_ESPERA: "Fila de Espera",
  TRIAGEM: "Triagem",
  TRIADOS: "Triados",
  EM_ATENDIMENTO: "Em Atendimento",
  FINALIZADO: "Finalizado",
};

export default function AgendaModal({ open, onClose, initialData, existingAppointment }: { open: boolean, onClose: () => void, initialData: { date: string, time: string, endTime?: string, roomId: string }, existingAppointment?: Appointment }) {
  const { clients, users, groups, currentUser, addAppointment, updateAppointment, deleteAppointment, appointments, markAttendance, config, updateClient, reporSessao } = useStore();

  const activeRooms = config.rooms.filter(r => r.isActive).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(r => r.name);
  const [roomId, setRoomId] = useState(initialData.roomId || activeRooms[0] || "");

  // Antes só listava pacientes "Em Atendimento" — por isso quem estava em
  // Fila de Espera/Triagem nunca aparecia para ser agendado. Agora mostra
  // qualquer paciente ainda ativo (não finalizado), com filtro de status e
  // busca por nome/matrícula para facilitar achar quem se procura.
  /**
   * QUEM PODE SER AGENDADO
   * ======================
   *
   * Antes, o psicólogo só via os pacientes atribuídos a ele (ou os que ainda
   * não tinham responsável). Isso impedia o caso real do setor: agendar uma
   * TRIAGEM DE GRUPO para alguém que já está em atendimento individual com
   * outro colega — a pessoa nem aparecia na lista.
   *
   * O setor definiu que qualquer psicólogo pode fazer triagem de entrada em
   * grupo, e que os vínculos coexistem: individual com A, grupo com B, sem
   * que um exclua o outro.
   *
   * Casos ENCERRADOS (finalizados ou cancelados) continuam fora: agendar
   * alguém cujo caso foi encerrado seria reabertura disfarçada, sem registro.
   */
  const bookableClients = clients.filter(
    c => c.status !== "FINALIZADO" && c.status !== "CANCELADO"
  );

  const [clientStatusFilter, setClientStatusFilter] = useState<"TODOS" | "FILA_ESPERA" | "TRIAGEM" | "TRIADOS" | "EM_ATENDIMENTO">("TODOS");
  const [clientSearch, setClientSearch] = useState("");

  // Ordem alfabética em toda lista de escolha: procurar nome numa lista
  // desordenada é fonte de erro de seleção.
  const activeClients = bookableClients.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR")).filter(c => {
    if (clientStatusFilter !== "TODOS" && c.status !== clientStatusFilter) return false;
    if (clientSearch.trim()) {
      const q = clientSearch.trim().toLowerCase();
      if (!c.fullName.toLowerCase().includes(q) && !c.registrationCode?.toLowerCase().includes(q) && !c.protocolNumber?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const NEXT_STATUS: Record<string, { value: string; label: string } | null> = {
    FILA_ESPERA: { value: "TRIAGEM", label: "Mover para Triagem" },
    TRIAGEM: { value: "TRIADOS", label: "Mover para Triados (classificação de risco definida)" },
    TRIADOS: { value: "EM_ATENDIMENTO", label: "Mover para Em Atendimento" },
    EM_ATENDIMENTO: null,
  };
  const [statusTransition, setStatusTransition] = useState<string>("");
  const [responsiblePsicoId, setResponsiblePsicoId] = useState<string>("");
  // Profissionais que atendem = Psicólogos + Supervisores.
  const psicos = clinicians(users).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  
  const activeGroups = groups
    .filter(g => g.isActive && (
      currentUser?.role !== "PSICO" ||
      g.psychologistId === currentUser.id ||
      g.coPsychologistId === currentUser.id  // o coterapeuta também agenda
    ))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const [bookingType, setBookingType] = useState<"client" | "group">(existingAppointment?.groupId ? "group" : "client");
  const [selectedId, setSelectedId] = useState(existingAppointment?.clientId || existingAppointment?.groupId || "");

  /** Paciente escolhido já é acompanhado por outro profissional? */
  const clienteEscolhido = bookingType === "client" ? clients.find(c => c.id === selectedId) : null;
  const outroResponsavel =
    clienteEscolhido?.assignedPsicoId &&
    clienteEscolhido.assignedPsicoId !== currentUser?.id
      ? clienteEscolhido.assignedPsicoName
      : null;
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "biweekly">(existingAppointment?.recurrence || "none");

  const defaultEndTime = () => {
    if (initialData.endTime) return initialData.endTime;
    const [h, m] = initialData.time.split(":").map(Number);
    const endH = (h + 1).toString().padStart(2, "0");
    const endM = m.toString().padStart(2, "0");
    return `${endH}:${endM}`;
  };
  
  /**
   * Edição de dia/horário de um atendimento já marcado (item 15 do diagnóstico).
   * Antes, mudar de terça para quarta exigia apagar e recriar — e a série de
   * repetições ficava inconsistente. Agora a data é editável e, quando o
   * atendimento pertence a uma série, é possível aplicar a mudança às
   * próximas ocorrências. As sessões passadas nunca são alteradas: agenda
   * realizada é registro, não se reescreve.
   */
  /**
   * Natureza do compromisso.
   * Só ATENDIMENTO abre prontuário. Triagem de grupo, entrevista e devolutiva
   * ocupam agenda e sala, mas não geram registro clínico automático.
   */
  const [appointmentType, setAppointmentType] = useState<NonNullable<Appointment["appointmentType"]>>(
    (existingAppointment as any)?.appointmentType || "ATENDIMENTO"
  );

  /** Profissional designado para conduzir um evento que não é atendimento. */
  const [eventPsicoId, setEventPsicoId] = useState<string>("");

  /**
   * Quantidade de repetições.
   *
   * Era fixa em 12, e as séries reais do setor tinham 9, 11, 12... — sobrava
   * agendamento para apagar toda vez. Agora quem marca decide, e o padrão
   * acompanha o limite de sessões previstas do paciente quando houver.
   */
  const [repeticoes, setRepeticoes] = useState<number>(12);

  /** Paciente selecionado, usado para sugerir o restante do pacote. */
  const selectedClient = bookingType === "client" ? clients.find(c => c.id === selectedId) : undefined;

  const [appointmentDate, setAppointmentDate] = useState(initialData.date);
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [futureFeedback, setFutureFeedback] = useState("");

  const [startTime, setStartTime] = useState(initialData.time);
  const [endTime, setEndTime] = useState(defaultEndTime());
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedId) return;
    if (startTime >= endTime) {
       setErrorMsg("O horário de término deve ser maior que o início.");
       return;
    }
    if ((statusTransition === "EM_ATENDIMENTO" || statusTransition === "TRIAGEM") && !responsiblePsicoId) {
       setErrorMsg("Escolha o psicólogo responsável pelo atendimento antes de continuar.");
       return;
    }

    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();

    /**
     * CONFLITO DE SALA — dois defeitos corrigidos.
     *
     * 1. Encontros CANCELADOS e REAGENDADOS continuavam ocupando a sala. Se o
     *    atendimento não vai acontecer, o horário está livre e precisa poder
     *    ser reaproveitado — era o que impedia remarcar outra pessoa ali.
     *
     * 2. A comparação usava `initialData.date` (a data em que o modal foi
     *    aberto) em vez de `appointmentDate` (a data escolhida). Ao remarcar
     *    para outro dia, o conflito era conferido no dia errado — deixando
     *    passar choque real e barrando horário livre.
     */
    const NAO_OCUPA_SALA = ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"];

    const conflict = appointments.find(a => {
      if (existingAppointment && a.id === existingAppointment.id) return false;
      if (NAO_OCUPA_SALA.includes(a.attendance ?? "")) return false;
      if (a.date !== appointmentDate || a.roomId !== roomId) return false;

      const tStart = new Date(`1970-01-01T${a.time}:00`).getTime();
      const tEnd = new Date(`1970-01-01T${a.endTime || a.time}:00`).getTime() || (tStart + 60 * 60 * 1000); 
      
      if (startMs < tEnd && endMs > tStart) return true;
      return false;
    });

    if (conflict) {
       setErrorMsg("Já existe um agendamento conflitante neste horário nesta sala.");
       return;
    }

    let seriesId = existingAppointment?.seriesId;
    if (!existingAppointment && recurrence !== "none") {
       seriesId = Math.random().toString(36).substring(2, 9);
    }
    
    // O responsável pelo agendamento é o psicólogo do PACIENTE (ou do grupo),
    // não necessariamente quem está preenchendo a agenda — senão o
    // agendamento não aparecia na agenda do psicólogo certo, e a cor exibida
    // também ficava errada.
    let resolvedPsicoId = existingAppointment?.psicoId;
    // Evento que não é atendimento: quem conduz é quem foi designado (ou quem
    // está agendando), e não o responsável pelo acompanhamento do paciente.
    if (appointmentType !== "ATENDIMENTO") {
      resolvedPsicoId = eventPsicoId || currentUser?.id || "";
    }
    if (!resolvedPsicoId) {
      if (bookingType === "client") {
        if ((statusTransition === "TRIAGEM" || statusTransition === "EM_ATENDIMENTO") && responsiblePsicoId) {
          resolvedPsicoId = responsiblePsicoId;
        } else {
          resolvedPsicoId = selectedClient?.assignedPsicoId || currentUser?.id || "";
        }
      } else {
        const selectedGroup = groups.find(g => g.id === selectedId);
        resolvedPsicoId = selectedGroup?.psychologistId || currentUser?.id || "";
      }
    }

    const baseAppt = {
      time: startTime,
      endTime: endTime,
      roomId: roomId,
      clientId: bookingType === "client" ? selectedId : undefined,
      groupId: bookingType === "group" ? selectedId : undefined,
      appointmentType,
      sessionType: appointmentType,
      psicoId: resolvedPsicoId,
      recurrence,
      seriesId
    };

    if (existingAppointment) {
       updateAppointment(
         existingAppointment.id,
         { ...baseAppt, date: appointmentDate },
         applyToFuture
       ).then((count) => {
         if (count > 0) setFutureFeedback(`${count} atendimento(s) futuro(s) da série também foram atualizados.`);
       });
    } else {
       const instances = recurrence === "none" ? 1 : Math.max(1, Math.min(52, repeticoes));
       for (let i = 0; i < instances; i++) {
          // toDate() interpreta "YYYY-MM-DD" como meio-dia local, então somar
          // dias nunca "pula" ou "volta" um dia por causa de fuso.
          const d = toDate(appointmentDate) ?? new Date();
          if (recurrence === "weekly") d.setDate(d.getDate() + (i * 7));
          else if (recurrence === "biweekly") d.setDate(d.getDate() + (i * 14));
          const dateStr = toDateOnly(d);
          
          addAppointment({ ...baseAppt, date: dateStr });
       }
    }

    /**
     * Avanço de status junto com o agendamento.
     *
     * REGRA CRÍTICA: a atribuição de responsável só acontece quando o paciente
     * AINDA NÃO TEM um. Antes, agendar com avanço de status sobrescrevia o
     * responsável — então o psicólogo B, ao agendar uma triagem de grupo para
     * um paciente do colega A, tomava o caso dele sem querer e sem registro.
     *
     * Transferir é ato próprio, com justificativa e trilha (privativo de
     * Supervisor e Administrativo). Agendar não transfere.
     */
    /**
     * ACOLHIMENTO EMERGENCIAL não mexe no fluxo do paciente.
     * A pessoa é atendida pontualmente numa situação de urgência: quem está na
     * fila continua na fila, quem está em acompanhamento continua com o seu
     * profissional. Só o registro daquele atendimento é criado.
     */
    if (bookingType === "client" && statusTransition && appointmentType !== "ACOLHIMENTO") {
      const updates: any = { status: statusTransition };

      const semResponsavel = selectedClient && !selectedClient.assignedPsicoId;
      if (semResponsavel) {
        // Primeira atribuição: quem foi escolhido no formulário, ou quem agenda.
        updates.assignedPsicoId = responsiblePsicoId || currentUser?.id;
      }

      updateClient(selectedId, updates, `Status alterado para ${statusTransition} ao agendar atendimento.`);
    }

    onClose();
  };

  const handleDelete = () => {
    if (existingAppointment) {
      if (existingAppointment.seriesId) {
         const removeFuture = confirm("Este agendamento faz parte de uma série (repetição).\n\nDeseja remover ESTE e TODOS OS FUTUROS?\n\nOK: Remover este e futuros\nCancelar: Remover APENAS este");
         deleteAppointment(existingAppointment.id, removeFuture);
         onClose();
      } else {
         if (confirm("Deseja realmente remover este agendamento?")) {
           deleteAppointment(existingAppointment.id);
           onClose();
         }
      }
    }
  };

  const parsedDate = toDate(appointmentDate) ?? new Date();

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right duration-300">
        <div className="px-6 py-6 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{existingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</h2>
            <p className="text-gray-500 text-sm mt-1 capitalize">{format(parsedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 flex flex-col">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
             <div>
               <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Sala</label>
               <select value={roomId} onChange={e => setRoomId(e.target.value)} required className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 outline-none font-bold text-gray-900 transition-colors">
                 {activeRooms.map(r => <option key={r} value={r}>{r}</option>)}
               </select>
             </div>

             {/* Natureza do compromisso */}
             <div className="pt-4 border-t border-gray-200">
               <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                 Tipo de compromisso
               </label>
               <div className="grid grid-cols-2 gap-2">
                 {([
                   ["ATENDIMENTO", "Atendimento"],
                   ["ACOLHIMENTO", "Acolhimento emergencial"],
                   ["TRIAGEM_GRUPO", "Triagem para grupo"],
                   ["ENTREVISTA", "Entrevista"],
                   ["DEVOLUTIVA", "Devolutiva"],
                 ] as const).map(([valor, rotulo]) => (
                   <button
                     key={valor}
                     type="button"
                     onClick={() => setAppointmentType(valor)}
                     className={cn(
                       "text-sm font-bold py-2.5 rounded-xl border transition-colors",
                       appointmentType === valor
                         ? "bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-400"
                         : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                     )}
                   >
                     {rotulo}
                   </button>
                 ))}
               </div>
               <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                 {appointmentType === "ATENDIMENTO"
                   ? "Abre um registro pendente para a evolução do atendimento."
                   : appointmentType === "ACOLHIMENTO"
                   ? "Atendimento pontual em situação de urgência. Gera prontuário próprio e NÃO altera o status do paciente — quem está na fila continua na fila, quem está em atendimento continua com seu profissional."
                   : "Abre um registro pendente próprio deste evento, para o profissional designado escrever a evolução. Não altera o responsável pelo acompanhamento do paciente."}
               </p>

               {/*
                 Profissional que conduz ESTE evento.
                 A triagem de grupo, a entrevista e a devolutiva costumam ser
                 conduzidas por alguém que não acompanha o paciente
                 individualmente. É esta pessoa que poderá escrever a evolução
                 do evento — e só ela.
               */}
               {appointmentType !== "ATENDIMENTO" && (
                 <div className="mt-3">
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                     Profissional que vai conduzir
                   </label>
                   <select
                     value={eventPsicoId || currentUser?.id || ""}
                     onChange={e => setEventPsicoId(e.target.value)}
                     className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 outline-none font-medium text-sm"
                   >
                     {psicos.map(p => (
                       <option key={p.id} value={p.id}>{p.name}{p.crp ? ` — CRP ${p.crp}` : ""}</option>
                     ))}
                   </select>
                 </div>
               )}
             </div>

             {/* Data do atendimento — editável também na edição (mudar de terça
                 para quarta, por exemplo, sem apagar e recriar). */}
             <div className="pt-4 border-t border-gray-200">
               <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Data</label>
               <div className="relative">
                 <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input
                   type="date"
                   value={appointmentDate}
                   onChange={e => setAppointmentDate(e.target.value)}
                   required
                   className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 outline-none font-bold text-gray-900 transition-colors"
                 />
               </div>
             </div>

             <div className="flex gap-4">
               <div className="flex-1">
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Início</label>
                 <div className="relative">
                   <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input type="time" step="900" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 outline-none font-bold text-gray-900 transition-colors" />
                 </div>
               </div>
               <div className="flex-1">
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Término</label>
                 <div className="relative">
                   <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input type="time" step="900" value={endTime} onChange={e => setEndTime(e.target.value)} required className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 outline-none font-bold text-gray-900 transition-colors" />
                 </div>
               </div>
             </div>

             {/* O paciente escolhido já é acompanhado por outro profissional */}
             {outroResponsavel && (
               <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
                 <strong>{clienteEscolhido?.fullName}</strong> está em acompanhamento individual com{" "}
                 <strong>{outroResponsavel}</strong>. Este agendamento é um atendimento à parte
                 (triagem, grupo ou avaliação) e <strong>não altera</strong> o profissional responsável
                 pelo caso.
               </div>
             )}

             {/* Quantidade de repetições, quando a série for recorrente */}
             {!existingAppointment && recurrence !== "none" && (
               <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                   Quantas repetições
                 </label>
                 <div className="flex items-center gap-3">
                   <input
                     type="number"
                     min={1}
                     max={52}
                     value={repeticoes}
                     onChange={e => setRepeticoes(Number(e.target.value) || 1)}
                     className="w-24 bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 outline-none font-bold text-gray-900"
                   />
                   <span className="text-sm text-gray-600">
                     encontro(s) {recurrence === "weekly" ? "semanais" : "quinzenais"}
                   </span>
                 </div>
                 {selectedClient?.maxSessions ? (
                   <button
                     type="button"
                     onClick={() => setRepeticoes(Math.max(1, (selectedClient.maxSessions || 0) - (selectedClient.completedSessions || 0)))}
                     className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                   >
                     Usar o restante do pacote ({Math.max(0, (selectedClient.maxSessions || 0) - (selectedClient.completedSessions || 0))} sessões)
                   </button>
                 ) : null}
               </div>
             )}

             {existingAppointment?.seriesId && (
               <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                 <label className="flex items-start gap-3 cursor-pointer">
                   <input
                     type="checkbox"
                     checked={applyToFuture}
                     onChange={e => setApplyToFuture(e.target.checked)}
                     className="mt-0.5 h-4 w-4 accent-blue-600"
                   />
                   <span className="text-sm text-blue-900 leading-relaxed">
                     <strong>Aplicar às próximas ocorrências</strong> desta repetição.
                     <span className="block text-xs text-blue-700/80 mt-1">
                       A mudança de dia, horário, sala ou profissional vale para os atendimentos
                       futuros da série. Os já realizados permanecem como estão.
                     </span>
                   </span>
                 </label>
               </div>
             )}

             {futureFeedback && (
               <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                 {futureFeedback}
               </p>
             )}
          </div>

          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
             <button type="button" onClick={() => {setBookingType("client"); setSelectedId("");}} className={bookingType === "client" ? "flex-1 bg-white shadow-sm py-2.5 rounded-lg font-bold text-blue-600 text-sm" : "flex-1 py-2.5 text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"}>Individual</button>
             <button type="button" onClick={() => {setBookingType("group"); setSelectedId("");}} className={bookingType === "group" ? "flex-1 bg-white shadow-sm py-2.5 rounded-lg font-bold text-blue-600 text-sm" : "flex-1 py-2.5 text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"}>Grupo</button>
          </div>

          {bookingType === "client" ? (
             <div className="space-y-3">
               <div>
                 <label className="block text-sm font-semibold text-gray-700 mb-2">Buscar paciente (nome, matrícula ou protocolo)</label>
                 <input
                   type="text"
                   value={clientSearch}
                   onChange={e => setClientSearch(e.target.value)}
                   placeholder="Digite para buscar..."
                   className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-2.5 outline-none transition-all text-sm"
                 />
               </div>

               <div className="flex gap-1.5 flex-wrap">
                 {([
                   { v: "TODOS", l: "Todos" },
                   { v: "FILA_ESPERA", l: "Fila de Espera" },
                   { v: "TRIAGEM", l: "Triagem" },
                   { v: "TRIADOS", l: "Triados" },
                   { v: "EM_ATENDIMENTO", l: "Em Atendimento" },
                 ] as const).map(opt => (
                   <button
                     key={opt.v}
                     type="button"
                     onClick={() => setClientStatusFilter(opt.v)}
                     className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", clientStatusFilter === opt.v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                   >
                     {opt.l}
                   </button>
                 ))}
               </div>

               <div>
                 <label className="block text-sm font-semibold text-gray-700 mb-2">Selecione o Paciente</label>
                 <select required value={selectedId} onChange={e => { setSelectedId(e.target.value); setStatusTransition(""); }} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all font-medium text-gray-900">
                   <option value="" disabled>-- Escolher Paciente --</option>
                   {activeClients.map(c => (
                      <option key={c.id} value={c.id}>{c.fullName} — {STATUS_LABELS[c.status] || c.status}</option>
                   ))}
                 </select>
                 {activeClients.length === 0 && <p className="text-xs text-red-500 mt-2">Nenhum paciente encontrado com esse filtro/busca.</p>}
               </div>

               {selectedId && NEXT_STATUS[clients.find(c => c.id === selectedId)?.status || ""] && (
                 <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-3">
                   <label className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                     <input
                       type="checkbox"
                       checked={!!statusTransition}
                       onChange={e => { setStatusTransition(e.target.checked ? NEXT_STATUS[clients.find(c => c.id === selectedId)!.status]!.value : ""); setResponsiblePsicoId(""); }}
                     />
                     {NEXT_STATUS[clients.find(c => c.id === selectedId)!.status]!.label} ao salvar este agendamento
                   </label>
                   {(statusTransition === "EM_ATENDIMENTO" || statusTransition === "TRIAGEM") && (
                     <div>
                       <label className="block text-xs font-semibold text-blue-800 mb-1">{statusTransition === "TRIAGEM" ? "Psicólogo responsável pela triagem" : "Psicólogo responsável pelo atendimento"}</label>
                       <select required value={responsiblePsicoId} onChange={e => setResponsiblePsicoId(e.target.value)} className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 outline-none font-medium text-sm">
                         <option value="">-- Escolher psicólogo --</option>
                         {psicos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                       <p className="text-[11px] text-blue-700 mt-1">Isso também atualiza o psicólogo responsável no perfil do paciente.</p>
                     </div>
                   )}
                 </div>
               )}
             </div>
          ) : (
             <div>
               <label className="block text-sm font-semibold text-gray-700 mb-2">Selecione o Grupo</label>
               <select required value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all font-medium text-gray-900">
                 <option value="" disabled>-- Escolher Grupo --</option>
                 {activeGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length} membros)</option>
                 ))}
               </select>
               {activeGroups.length === 0 && <p className="text-xs text-red-500 mt-2">Você não possui grupos terapêuticos ativos.</p>}
             </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Repeat size={16} className="text-gray-400" /> Repetição</label>
            <select
               value={recurrence}
               onChange={e => setRecurrence(e.target.value as any)}
               disabled={!!existingAppointment}
               className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all font-medium text-gray-900 disabled:opacity-50"
            >
              <option value="none">Não repetir (Ocorrência única)</option>
              <option value="weekly">Semanal (12 ocorrências)</option>
              <option value="biweekly">Quinzenal (12 ocorrências)</option>
            </select>
            {existingAppointment && <p className="text-xs text-gray-500 mt-1">Para alterar o padrão de repetição, remova este agendamento e crie um novo.</p>}
          </div>

          {existingAppointment && (
             <div className="space-y-4">
               {/*
                 Encontros de GRUPO também precisam de cancelamento e
                 reagendamento: o grupo pode não acontecer (profissional
                 afastado, sala indisponível, feriado), e sem isso o encontro
                 ficava marcado como se tivesse ocorrido, com os prontuários
                 pendentes de todos os integrantes cobrando registro.
                 A frequência individual de cada participante continua sendo
                 registrada no prontuário do grupo, não aqui.
               */}
               {(existingAppointment.clientId || existingAppointment.groupId) && (
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <p className="text-sm font-bold text-gray-700 mb-3 text-center">
                      {existingAppointment.groupId ? "Situação do encontro" : "Registro de Frequência"}
                    </p>
                    <div className={cn("flex flex-col gap-2", existingAppointment.groupId && "hidden")}>
                       <button 
                         type="button" 
                         onClick={() => { markAttendance(existingAppointment.id, "COMPARECEU"); onClose(); }}
                         className={`py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'COMPARECEU' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                       >
                         Compareceu
                       </button>
                       <div className="flex gap-2">
                         <button 
                           type="button" 
                           onClick={async () => {
                             await markAttendance(existingAppointment.id, "FALTA_JUSTIFICADA");
                             if (window.confirm("Falta justificada registrada.\n\nDeseja repor esta sessão, acrescentando um encontro ao final da série?")) {
                               const novaData = await reporSessao(existingAppointment.id);
                               window.alert(`Sessão reposta para ${novaData.split("-").reverse().join("/")}.`);
                             }
                             onClose();
                           }}
                           className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'FALTA_JUSTIFICADA' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                         >
                           Falta Justificada
                         </button>
                         <button 
                           type="button" 
                           onClick={async () => {
                             await markAttendance(existingAppointment.id, "FALTA_INJUSTIFICADA");
                             /*
                               Falta não deve encurtar o tratamento: se restavam
                               duas semanas, a última passa a ser uma semana
                               depois. A reposição é oferecida, não automática —
                               a decisão é clínica.
                             */
                             if (window.confirm("Falta registrada.\n\nDeseja repor esta sessão, acrescentando um encontro ao final da série?")) {
                               const novaData = await reporSessao(existingAppointment.id);
                               window.alert(`Sessão reposta para ${novaData.split("-").reverse().join("/")}.`);
                             }
                             onClose();
                           }}
                           className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'FALTA_INJUSTIFICADA' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                         >
                           Falta s/ Justif.
                         </button>
                       </div>
                    </div>

                    {/*
                      CANCELAMENTO E REAGENDAMENTO — vale para atendimento
                      individual E para encontro de grupo.
                      Estava DENTRO do bloco de presença individual, que fica
                      oculto em grupos — por isso o grupo só exibia o título,
                      sem nenhum botão.
                    */}
                    <div className="flex flex-col gap-2">
                       {/*
                         CANCELAMENTO E REAGENDAMENTO.
                         Faltar é diferente de cancelar: quem avisou e desmarcou
                         não pode ser contabilizado como falta. E o registro de
                         QUEM cancelou (profissional ou paciente) é informação de
                         gestão — motivo de cancelamento pelo serviço aponta
                         problema de escala, e não de adesão do paciente.
                       */}
                       <div className="pt-2 mt-1 border-t border-gray-200">
                         <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
                           Cancelamento
                         </p>
                         <div className="flex gap-2">
                           <button
                             type="button"
                             onClick={() => { markAttendance(existingAppointment.id, "CANCELADO_PACIENTE"); onClose(); }}
                             className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'CANCELADO_PACIENTE' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                           >
                             Cancelado pelo paciente
                           </button>
                           <button
                             type="button"
                             onClick={() => { markAttendance(existingAppointment.id, "CANCELADO_PROFISSIONAL"); onClose(); }}
                             className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'CANCELADO_PROFISSIONAL' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                           >
                             Cancelado pelo serviço
                           </button>
                         </div>
                         <button
                           type="button"
                           onClick={() => { markAttendance(existingAppointment.id, "REAGENDADO"); onClose(); }}
                           className={`w-full mt-2 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'REAGENDADO' ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                         >
                           Reagendado
                         </button>
                         <p className="text-[10px] text-gray-500 mt-2 leading-tight">
                           {existingAppointment.groupId
                             ? "O encontro não ocorreu: os prontuários pendentes de todos os integrantes daquele dia são removidos, preservando o que já foi escrito."
                             : "Cancelamento e reagendamento não contam como falta e não consomem sessão do pacote do paciente."} Para marcar a nova data, use o botão de agendar no dia desejado.
                         </p>
                       </div>
                    </div>
                 </div>
               )}
               <div className="flex gap-2 pt-2">
                {existingAppointment.clientId ? (
                   <Link to={`/client/${existingAppointment.clientId}`} className="flex-1 bg-blue-50 text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors">
                      <ExternalLink size={18} /> Prontuário
                   </Link>
                ) : (
                   <Link to={`/groups`} className="flex-1 bg-purple-50 text-purple-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-100 transition-colors">
                      <ExternalLink size={18} /> Grupo
                   </Link>
                )}
             </div>
             </div>
          )}

          {errorMsg && (
             <div className="bg-red-50 text-red-700 text-sm font-bold p-4 rounded-xl border border-red-100">
               {errorMsg}
             </div>
          )}

          <div className="pt-6 mt-auto flex flex-col gap-3">
            <button
               disabled={!selectedId}
              type="submit"
               className="w-full bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 text-white font-semibold text-lg py-4 rounded-xl transition-colors shadow-sm"
            >
              {existingAppointment ? "Salvar Alterações" : "Confirmar Agendamento"}
            </button>
            
            {existingAppointment && (
               <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold text-base py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
               >
                  <Trash2 size={18} /> Remover atendimento
               </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
