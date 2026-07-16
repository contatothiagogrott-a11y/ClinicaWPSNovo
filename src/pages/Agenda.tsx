import { useMemo, useState, useCallback } from "react";
import { useStore } from "../contexts/StoreContext";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { format, parse, startOfWeek as dfStartOfWeek, getDay, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, LayoutGrid, Columns3 } from "lucide-react";
import { cn } from "../lib/utils";
import AgendaModal from "../components/AgendaModal";
import { Appointment } from "../types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => dfStartOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "pt-BR": ptBR },
});

// Definido fora do componente para não recriar o componente a cada render
// (isso faria o calendário perder estado interno de arraste/scroll).
const DnDCalendar = withDragAndDrop(Calendar as any) as any;

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  appt: Appointment;
}

const messages = {
  today: "Hoje",
  previous: "Anterior",
  next: "Próximo",
  month: "Mês",
  week: "Semana",
  day: "Dia",
  agenda: "Lista",
  date: "Data",
  time: "Hora",
  event: "Evento",
  noEventsInRange: "Nenhum agendamento neste período.",
  showMore: (total: number) => `+${total} mais`,
};

export default function AgendaPage() {
  const { config, appointments, clients, currentUser, users, groups, updateAppointment } = useStore();
  const activeRooms = config.rooms.filter(r => r.isActive).map(r => r.name);

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"geral" | "porSala">("geral");
  const [scopeFilter, setScopeFilter] = useState<"GERAL" | "MEUS">("GERAL");
  const [roomFilter, setRoomFilter] = useState<string>("");

  const [modalData, setModalData] = useState<{ time: string; endTime?: string; roomId: string; date: string } | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);

  let filteredAppointments = appointments;
  if (scopeFilter === "MEUS" && currentUser?.role === "PSICO") {
    filteredAppointments = filteredAppointments.filter(a => a.psicoId === currentUser.id);
  }
  if (viewMode === "geral" && roomFilter) {
    filteredAppointments = filteredAppointments.filter(a => a.roomId === roomFilter);
  }

  const events: CalEvent[] = useMemo(() => filteredAppointments.map(a => {
    const client = a.clientId ? clients.find(c => c.id === a.clientId) : null;
    const group = a.groupId ? groups.find(g => g.id === a.groupId) : null;
    const title = client ? client.fullName : group ? `Grupo: ${group.name}` : "Reservado";
    const start = new Date(`${a.date}T${a.time}:00`);
    const end = a.endTime ? new Date(`${a.date}T${a.endTime}:00`) : addHours(start, 1);
    return { id: a.id, title, start, end, resourceId: a.roomId, appt: a };
  }), [filteredAppointments, clients, groups]);

  const resources = useMemo(
    () => (viewMode === "porSala" ? activeRooms.map(r => ({ resourceId: r, resourceTitle: r })) : undefined),
    [viewMode, activeRooms]
  );

  const canEdit = useCallback((appt: Appointment) => {
    if (!currentUser) return false;
    if (currentUser.role === "PSICO") return appt.psicoId === currentUser.id;
    return true;
  }, [currentUser]);

  const eventPropGetter = useCallback((event: CalEvent) => {
    const psico = users.find(u => u.id === event.appt.psicoId);
    const isGroup = !!event.appt.groupId;
    const color = psico?.color || (isGroup ? "#8b5cf6" : "#3b82f6");
    const noShow = event.appt.attendance === "FALTA_INJUSTIFICADA" || event.appt.attendance === "FALTA_JUSTIFICADA";
    return {
      style: {
        backgroundColor: `${color}22`,
        borderLeft: `4px solid ${color}`,
        color: "#1f2937",
        opacity: noShow ? 0.55 : 1,
        borderRadius: 8,
      },
    };
  }, [users]);

  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date; resourceId?: string }) => {
    const roomId = slotInfo.resourceId || roomFilter || activeRooms[0];
    if (!roomId) {
      alert("Cadastre pelo menos uma sala ativa em Configurações antes de agendar.");
      return;
    }
    setModalData({
      date: format(slotInfo.start, "yyyy-MM-dd"),
      time: format(slotInfo.start, "HH:mm"),
      endTime: format(slotInfo.end, "HH:mm"),
      roomId,
    });
  }, [roomFilter, activeRooms]);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setEditAppt(event.appt);
  }, []);

  const handleEventDrop = useCallback(({ event, start, end, resourceId }: { event: CalEvent; start: Date; end: Date; resourceId?: string }) => {
    if (!canEdit(event.appt)) {
      alert("Você só pode mover os seus próprios atendimentos.");
      return;
    }
    updateAppointment(event.appt.id, {
      date: format(start, "yyyy-MM-dd"),
      time: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      ...(resourceId ? { roomId: resourceId } : {}),
    });
  }, [canEdit, updateAppointment]);

  const handleEventResize = useCallback(({ event, start, end }: { event: CalEvent; start: Date; end: Date }) => {
    if (!canEdit(event.appt)) {
      alert("Você só pode redimensionar os seus próprios atendimentos.");
      return;
    }
    updateAppointment(event.appt.id, { time: format(start, "HH:mm"), endTime: format(end, "HH:mm") });
  }, [canEdit, updateAppointment]);

  const handleNovo = () => {
    const now = new Date();
    const roundedMinutes = now.getMinutes() < 30 ? 30 : 0;
    const startHour = roundedMinutes === 0 ? now.getHours() + 1 : now.getHours();
    const start = new Date(now);
    start.setHours(startHour, roundedMinutes, 0, 0);
    const end = addHours(start, 1);
    const roomId = roomFilter || activeRooms[0];
    if (!roomId) {
      alert("Cadastre pelo menos uma sala ativa em Configurações antes de agendar.");
      return;
    }
    setModalData({ date: format(start, "yyyy-MM-dd"), time: format(start, "HH:mm"), endTime: format(end, "HH:mm"), roomId });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Agenda</h1>
          <p className="text-gray-500">Arraste para reagendar, redimensione para ajustar a duração, clique para editar.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role === "PSICO" && (
            <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
              <button onClick={() => setScopeFilter("GERAL")} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", scopeFilter === "GERAL" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>Visão Geral</button>
              <button onClick={() => setScopeFilter("MEUS")} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", scopeFilter === "MEUS" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>Meus Atendimentos</button>
            </div>
          )}

          <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
            <button onClick={() => setViewMode("geral")} className={cn("px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5", viewMode === "geral" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <LayoutGrid size={16} /> Geral
            </button>
            <button onClick={() => { setViewMode("porSala"); setView(Views.DAY); }} className={cn("px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5", viewMode === "porSala" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <Columns3 size={16} /> Por Sala
            </button>
          </div>

          {viewMode === "geral" && (
            <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} className="bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-3 py-2.5 outline-none transition-all font-semibold text-sm text-gray-700">
              <option value="">Todas as salas</option>
              {activeRooms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <button onClick={handleNovo} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-1.5">
            <Plus size={16} /> Novo
          </button>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-6 min-h-[650px]">
        <DnDCalendar
          localizer={localizer}
          culture="pt-BR"
          messages={messages}
          events={events}
          view={viewMode === "porSala" ? Views.DAY : view}
          onView={(v: View) => setView(v)}
          date={date}
          onNavigate={(d: Date) => setDate(d)}
          views={viewMode === "porSala" ? [Views.DAY] : [Views.MONTH, Views.WEEK, Views.DAY]}
          resources={resources}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          step={30}
          timeslots={2}
          min={new Date(1970, 1, 1, 7, 0)}
          max={new Date(1970, 1, 1, 20, 30)}
          selectable
          resizable
          popup
          style={{ height: "100%" }}
          eventPropGetter={eventPropGetter}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          draggableAccessor={(e: CalEvent) => canEdit(e.appt)}
          resizableAccessor={(e: CalEvent) => canEdit(e.appt)}
        />
      </div>

      {(modalData || editAppt) && (
        <AgendaModal
          open={!!(modalData || editAppt)}
          onClose={() => { setModalData(null); setEditAppt(null); }}
          initialData={modalData || {
            date: editAppt!.date,
            time: editAppt!.time,
            endTime: editAppt!.endTime,
            roomId: editAppt!.roomId,
          }}
          existingAppointment={editAppt || undefined}
        />
      )}
    </div>
  );
}
