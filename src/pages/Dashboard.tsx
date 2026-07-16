import { useMemo, useState } from "react";
import { useStore } from "../contexts/StoreContext";
import {
  AlertCircle, Users, Activity, CheckCircle, Clock, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, TrendingUp, Package, DoorOpen, ClipboardList,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { format, addDays, subDays, differenceInCalendarDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  FILA_ESPERA: "#f59e0b",
  TRIAGEM: "#f97316",
  TRIADOS: "#8b5cf6",
  EM_ATENDIMENTO: "#10b981",
  FINALIZADO: "#94a3b8",
};

const STATUS_LABELS: Record<string, string> = {
  FILA_ESPERA: "Fila de Espera",
  TRIAGEM: "Triagem",
  TRIADOS: "Triados",
  EM_ATENDIMENTO: "Em Atendimento",
  FINALIZADO: "Finalizado",
};

function durationHours(time: string, endTime?: string) {
  const [h1, m1] = time.split(":").map(Number);
  if (!endTime) return 1;
  const [h2, m2] = endTime.split(":").map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? diff / 60 : 1;
}

export default function Dashboard() {
  const { currentUser, clients, sessions, appointments, users, instruments } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());

  if (!currentUser) return null;

  const isPsico = currentUser.role === "PSICO";
  const isGestor = currentUser.role === "SUPERVISOR" || currentUser.role === "ADMIN";

  // ---------------------------------------------------------------------
  // Dados comuns
  // ---------------------------------------------------------------------
  const myClients = clients.filter(c => c.assignedPsicoId === currentUser.id);
  const filaEspera = clients.filter(c => ["FILA_ESPERA", "TRIAGEM", "TRIADOS"].includes(c.status));
  const emAtendimento = clients.filter(c => c.status === "EM_ATENDIMENTO");

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const pendingDrafts = sessions.filter(s => s.isDraft && new Date(s.date) < threeDaysAgo);
  const pendingClientsIds = new Set(pendingDrafts.map(d => d.clientId));
  const pendingNotes = (isPsico ? myClients : clients).filter(c => pendingClientsIds.has(c.id));
  const almostExceeding = emAtendimento.filter(c => c.completedSessions > 0 && c.completedSessions >= c.maxSessions - 2);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const myAppointmentsToday = appointments
    .filter(a => a.date === dateStr && (isPsico ? a.psicoId === currentUser.id : true))
    .sort((a, b) => a.time.localeCompare(b.time));

  // Taxa de comparecimento (últimos 30 dias), escopo conforme papel
  const thirtyDaysAgo = subDays(new Date(), 30);
  const scopeAppointments = isPsico ? appointments.filter(a => a.psicoId === currentUser.id) : appointments;
  const recentAppts = scopeAppointments.filter(a => {
    try { return parseISO(a.date) >= thirtyDaysAgo; } catch { return false; }
  });
  const withAttendance = recentAppts.filter(a => a.attendance && a.attendance !== "PENDENTE");
  const attended = withAttendance.filter(a => a.attendance === "COMPARECEU");
  const attendanceRate = withAttendance.length > 0 ? Math.round((attended.length / withAttendance.length) * 100) : null;

  // ---------------------------------------------------------------------
  // Somente Psicólogo: agenda da semana (mini-tira de 7 dias)
  // ---------------------------------------------------------------------
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i)), []);
  const apptsByDay = (d: Date) => appointments.filter(a => a.date === format(d, "yyyy-MM-dd") && (isPsico ? a.psicoId === currentUser.id : true));

  // ---------------------------------------------------------------------
  // Somente Gestor: ocupação da equipe, fila com tempo de espera, status pizza
  // ---------------------------------------------------------------------
  const psicos = users.filter(u => u.role === "PSICO");
  const teamOccupancy = psicos.map(p => {
    const active = clients.filter(c => c.assignedPsicoId === p.id && c.status === "EM_ATENDIMENTO").length;
    const cap = p.capacity as { urgente?: number; alta?: number; media?: number; baixa?: number } | undefined;
    const capTotal = cap ? (cap.urgente || 0) + (cap.alta || 0) + (cap.media || 0) + (cap.baixa || 0) : 0;
    const pending = clients.filter(c => c.assignedPsicoId === p.id && pendingClientsIds.has(c.id)).length;
    return { id: p.id, name: p.name, active, capTotal, pending, color: p.color || "#3b82f6" };
  });

  const avgWaitDays = (() => {
    if (filaEspera.length === 0) return 0;
    const total = filaEspera.reduce((acc, c) => acc + Math.max(0, differenceInCalendarDays(new Date(), new Date(c.dateIncluded))), 0);
    return Math.round(total / filaEspera.length);
  })();

  const statusPieData = Object.keys(STATUS_LABELS).map(key => ({
    name: STATUS_LABELS[key],
    value: clients.filter(c => c.status === key).length,
    color: STATUS_COLORS[key],
  })).filter(d => d.value > 0);

  // ---------------------------------------------------------------------
  // Somente Admin: ocupação de salas (semana atual) e estoque baixo
  // ---------------------------------------------------------------------
  const weekInterval = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) };
  const roomHours: Record<string, number> = {};
  appointments.forEach(a => {
    try {
      const d = parseISO(a.date);
      if (isWithinInterval(d, weekInterval)) {
        roomHours[a.roomId] = (roomHours[a.roomId] || 0) + durationHours(a.time, a.endTime);
      }
    } catch { /* ignora datas inválidas */ }
  });
  const roomChartData = Object.entries(roomHours).map(([room, hours]) => ({ room, hours: Math.round(hours * 10) / 10 }));
  const lowStockInstruments = instruments.filter(i => i.sheetCount <= 10);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Olá, {currentUser.name.split(" ")[0]}</h1>
        <p className="text-gray-500">
          {isPsico ? "Resumo dos seus atendimentos." : currentUser.role === "SUPERVISOR" ? "Visão geral da equipe e do fluxo clínico." : "Visão operacional da clínica."}
        </p>
      </header>

      {/* Alertas */}
      {pendingNotes.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-amber-800 font-bold mb-1">Atenção aos Prontuários</h3>
            <p className="text-amber-700 text-sm">Pacientes com sessões realizadas sem evolução registrada no prontuário.</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              {pendingNotes.map(c => (
                <Link key={c.id} to={`/client/${c.id}`} className="text-xs bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full font-medium hover:bg-amber-200 transition-colors">
                  {c.fullName}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {isGestor && almostExceeding.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-bold mb-1">Limite Previsto Atingido</h3>
            <p className="text-red-700 text-sm">Pacientes que ultrapassaram (ou estão próximos) do número limite de atendimentos.</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              {almostExceeding.map(c => (
                <Link key={c.id} to={`/client/${c.id}`} className="text-xs bg-red-100 text-red-800 px-3 py-1.5 rounded-full font-medium hover:bg-red-200 transition-colors">
                  {c.fullName} ({c.completedSessions}/{c.maxSessions})
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentUser.role === "ADMIN" && lowStockInstruments.length > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-2xl flex items-start gap-4">
          <Package className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-orange-800 font-bold mb-1">Estoque baixo</h3>
            <p className="text-orange-700 text-sm">
              {lowStockInstruments.map(i => `${i.name} (${i.sheetCount} un.)`).join(", ")} — considere repor.
            </p>
          </div>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {isGestor && (
          <Link to="/waitlist" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Fila de Espera</p>
              <h4 className="text-4xl font-bold text-gray-900">{filaEspera.length}</h4>
              <p className="text-xs text-gray-400 mt-1">Espera média: {avgWaitDays} dias</p>
            </div>
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
              <Clock size={28} />
            </div>
          </Link>
        )}

        {isGestor && (
          <Link to="/active" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Em Atendimento</p>
              <h4 className="text-4xl font-bold text-gray-900">{emAtendimento.length}</h4>
            </div>
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
              <Activity size={28} />
            </div>
          </Link>
        )}

        {isPsico && (
          <Link to="/active" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Meus Pacientes</p>
              <h4 className="text-4xl font-bold text-gray-900">{myClients.length}</h4>
            </div>
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center shrink-0">
              <Users size={28} />
            </div>
          </Link>
        )}

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Comparecimento (30 dias)</p>
            <h4 className="text-4xl font-bold text-gray-900">{attendanceRate !== null ? `${attendanceRate}%` : "—"}</h4>
            <p className="text-xs text-gray-400 mt-1">{withAttendance.length} atendimentos com presença registrada</p>
          </div>
          <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center shrink-0">
            <TrendingUp size={28} />
          </div>
        </div>

        {currentUser.role === "ADMIN" && (
          <Link to="/inventory" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Materiais em Baixa</p>
              <h4 className="text-4xl font-bold text-gray-900">{lowStockInstruments.length}</h4>
            </div>
            <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center shrink-0">
              <Package size={28} />
            </div>
          </Link>
        )}
      </div>

      {/* PAINEL DO PSICÓLOGO: mini semana + prontuários pendentes por status */}
      {isPsico && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Minha Semana</h2>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(d => {
              const dayAppts = apptsByDay(d);
              const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "rounded-2xl p-3 text-center border transition-colors",
                    isToday ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-gray-50 hover:bg-gray-100",
                    format(selectedDate, "yyyy-MM-dd") === format(d, "yyyy-MM-dd") && "ring-2 ring-blue-500"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase text-gray-400">{format(d, "EEE", { locale: ptBR })}</p>
                  <p className="text-lg font-black text-gray-800">{format(d, "d")}</p>
                  <p className="text-[11px] font-semibold text-blue-600 mt-1">{dayAppts.length} sessão{dayAppts.length !== 1 ? "ões" : ""}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PAINEL DO GESTOR: ocupação da equipe + status dos casos */}
      {isGestor && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2"><Users size={20} className="text-blue-600" /> Ocupação da Equipe</h2>
            <div className="space-y-4">
              {teamOccupancy.map(p => {
                const pct = p.capTotal > 0 ? Math.min(100, Math.round((p.active / p.capTotal) * 100)) : 0;
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm font-semibold text-gray-700 mb-1">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                        {p.pending > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{p.pending} prontuário{p.pending > 1 ? "s" : ""} atrasado{p.pending > 1 ? "s" : ""}</span>}
                      </span>
                      <span>{p.active}/{p.capTotal || "—"}</span>
                    </div>
                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {teamOccupancy.length === 0 && <p className="text-sm text-gray-400">Nenhum psicólogo cadastrado ainda.</p>}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2"><ClipboardList size={20} className="text-blue-600" /> Casos por Status</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {statusPieData.map(d => (
                <span key={d.name} className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} /> {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DO ADMIN: ocupação de salas */}
      {currentUser.role === "ADMIN" && roomChartData.length > 0 && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2"><DoorOpen size={20} className="text-blue-600" /> Ocupação de Salas (semana atual)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomChartData}>
                <XAxis dataKey="room" tick={{ fontSize: 12 }} />
                <YAxis unit="h" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => [`${v}h`, "Horas ocupadas"]} />
                <Bar dataKey="hours" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Agenda do dia selecionado (comum a todos) */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Agenda {!isPsico ? "Geral" : "Diária"}</h2>
              <p className="text-sm text-gray-500 capitalize">{format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
            </div>
          </div>
          <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-200">
            <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronLeft size={20} className="text-gray-600" /></button>
            <span className="px-4 font-semibold text-sm text-gray-700 min-w-[100px] text-center">
              {format(selectedDate, "dd/MM/yyyy")}
            </span>
            <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronRight size={20} className="text-gray-600" /></button>
          </div>
        </div>

        {myAppointmentsToday.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 border border-gray-200 border-dashed rounded-2xl">
            <p className="text-gray-500 font-medium">Nenhum atendimento marcado para este dia.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myAppointmentsToday.map(appt => {
              const isGroup = !!appt.groupId;
              const title = isGroup ? "Sessão de Grupo" : clients.find(c => c.id === appt.clientId)?.fullName || "Paciente Removido";
              const psycho = users.find(u => u.id === appt.psicoId);

              return (
                <div key={appt.id} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:bg-gray-100 transition-colors">
                  <div className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-center shrink-0 w-24">
                    <span className="block font-black text-gray-900 text-lg">{appt.time}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{title}</h4>
                    <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-medium">
                      <span className="text-gray-600 bg-gray-200/50 px-2 rounded-md">{appt.roomId}</span>
                      <div className="flex items-center gap-1.5 px-2 rounded-md bg-white border border-gray-200">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: psycho?.color || '#3b82f6' }} />
                        <span className="text-gray-700">{psycho?.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {appt.clientId && (
                      <Link to={`/client/${appt.clientId}`} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap text-center">
                        Prontuário
                      </Link>
                    )}
                    {appt.groupId && (
                      <Link to={`/groups`} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap text-center">
                        Grupo
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
