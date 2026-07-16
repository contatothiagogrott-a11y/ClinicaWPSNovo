import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { format, startOfToday, isSameDay, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, MapPin, User as UserIcon, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import AgendaModal from "../components/AgendaModal";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { Appointment } from "../types";

export default function Agenda() {
  const navigate = useNavigate();
  const { config, appointments, clients, currentUser, users, groups } = useStore();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [modalData, setModalData] = useState<{ time: string, endTime?: string, roomId: string, date: string } | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const rooms = config.rooms.filter(r => r.isActive).map(r => r.name);
  
  const [filterMode, setFilterMode] = useState<"GERAL" | "MEUS">("GERAL");
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  let filteredAppointments = appointments;
  if (filterMode === "MEUS" && currentUser?.role === "PSICO") {
     filteredAppointments = filteredAppointments.filter(a => a.psicoId === currentUser.id);
  }

  // To show dots on the calendar
  const roomAppointments = selectedRoom ? filteredAppointments.filter(a => a.roomId === selectedRoom) : [];
  
  const daysWithAppointments = useMemo(() => {
    const days: Date[] = [];
    roomAppointments.forEach(a => {
       days.push(parse(a.date, 'yyyy-MM-dd', new Date()));
    });
    return days;
  }, [roomAppointments]);

  const dayAppointments = roomAppointments.filter(a => a.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));

  // Generate 30 min intervals from 08:00 to 20:00
  const hours = Array.from({ length: 25 }, (_, i) => {
    const h = Math.floor(i / 2) + 8;
    const m = i % 2 === 0 ? "00" : "30";
    return `${h.toString().padStart(2, "0")}:${m}`;
  });

  const handleCreateAppointment = (timeStr: string) => {
    if (!selectedRoom) return;
    const [h, m] = timeStr.split(":").map(Number);
    const endH = (h + 1).toString().padStart(2, "0");
    const endM = m.toString().padStart(2, "0");
    setModalData({ time: timeStr, endTime: `${endH}:${endM}`, roomId: selectedRoom, date: dateStr });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
             {selectedRoom ? "Agenda da Sala" : "Agenda & Salas"}
          </h1>
          <p className="text-gray-500">
             {selectedRoom ? selectedRoom : "Grade de ambientes disponíveis e ocupados."}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
           {currentUser?.role === "PSICO" && (
             <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
                <button 
                   onClick={() => setFilterMode("GERAL")}
                   className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", filterMode === "GERAL" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                >
                   Visão Geral
                </button>
                <button 
                   onClick={() => setFilterMode("MEUS")}
                   className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", filterMode === "MEUS" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                >
                   Meus Atendimentos
                </button>
             </div>
           )}
        </div>
      </header>

      {!selectedRoom ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
            {rooms.map(room => {
               // Contagem de ocupação hoje
               const apptsHoje = filteredAppointments.filter(a => a.date === dateStr && a.roomId === room);
               
               return (
                  <button 
                     key={room}
                     onClick={() => setSelectedRoom(room)}
                     className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left flex flex-col h-full group"
                  >
                     <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <MapPin size={24} />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-2">{room}</h3>
                     <p className="text-gray-500 text-sm mb-6 flex-1">
                        Gerencie a agenda, bloqueios e agendamentos deste ambiente.
                     </p>
                     <div className="mt-auto w-full">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                           <span>Ocupação Hoje</span>
                           <span className={apptsHoje.length > 0 ? "text-blue-600" : ""}>{apptsHoje.length} agendamentos</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                           <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (apptsHoje.length / 10) * 100)}%` }} />
                        </div>
                     </div>
                  </button>
               )
            })}
         </div>
      ) : (
         <div className="flex flex-col md:flex-row h-full bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
            {/* Sidebar Calendar */}
            <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50 flex flex-col h-full shrink-0">
               <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex items-center">
                  <button onClick={() => setSelectedRoom(null)} className="font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 px-4 py-2 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                     <ChevronLeft size={20} /> Voltar
                  </button>
                  <h3 className="font-bold text-gray-900 border-l border-gray-200 pl-4">{selectedRoom}</h3>
               </div>
               
               <div className="p-4 flex-1 overflow-y-auto w-full flex justify-center">
                  <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-100 w-max shrink-0">
                    <DayPicker 
                       mode="single"
                       selected={selectedDate}
                       onSelect={(d) => d && setSelectedDate(d)}
                       locale={ptBR}
                       modifiers={{ hasAppt: daysWithAppointments }}
                       modifiersClassNames={{
                          hasAppt: "font-bold underline decoration-blue-500 decoration-2 underline-offset-4"
                       }}
                       classNames={{
                          head_cell: "text-gray-500 font-bold uppercase text-[10px] pb-2",
                          cell: "p-0 text-center text-sm p-1",
                          day: "h-10 w-10 mx-auto rounded-full hover:bg-gray-100 transition-colors text-gray-900 font-medium font-sans flex items-center justify-center",
                          day_selected: "bg-blue-600 text-white hover:bg-blue-700 font-bold",
                          day_today: "bg-blue-50 text-blue-600 font-bold",
                          nav_button: "h-8 w-8 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-500 transition-colors"
                       }}
                    />
                  </div>
               </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-white relative">
               <div className="max-w-2xl mx-auto flex flex-col gap-8 pb-12">
                 <div className="flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md py-4 z-30 border-b border-gray-100 -mt-8 mb-4">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 capitalize">
                      {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h2>
                    <button 
                      onClick={() => handleCreateAppointment("12:00")}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors shadow-sm flex items-center gap-1"
                    >
                      <Plus size={16} /> Novo
                    </button>
                 </div>

                 {/* Custom Timeline rendering */}
                 <div className="relative">
                   <div className="absolute top-0 bottom-0 left-[3rem] w-px bg-gray-100 -z-10" />
                   
                   {/* Grid Background */}
                   {hours.map(h => {
                      return (
                        <div key={h} className="group flex gap-4 h-[5rem] relative">
                          <div className="w-[3rem] shrink-0 text-right pr-2 text-xs font-bold text-gray-400 -mt-2">
                             {h}
                          </div>
                          
                          <div className="flex-1 relative border-b border-gray-100 border-dashed">
                             <div className="absolute inset-0 top-1 bottom-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                               <button 
                                 onClick={() => handleCreateAppointment(h)}
                                 className="w-full h-full border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-2xl flex items-center justify-center text-blue-500 font-bold text-sm bg-gray-50/50 hover:bg-blue-50/50 transition-colors"
                               >
                                  <Plus size={16} className="mr-1" /> Agendar {h}
                               </button>
                             </div>
                          </div>
                        </div>
                      )
                   })}

                   {/* Absolute Appointments Overlay */}
                   {dayAppointments.map(appt => {
                     const client = appt.clientId ? clients.find(c => c.id === appt.clientId) : null;
                     const group = appt.groupId ? groups.find(g => g.id === appt.groupId) : null;
                     const isGroup = !!group;
                     
                     const [startH, startM] = appt.time.split(":").map(Number);
                     const startOffsetMinutes = (startH * 60 + startM) - (8 * 60);
                     const topRem = (startOffsetMinutes / 60) * 5;
                     
                     let heightStr = "4.5rem"; // default
                     if (appt.endTime) {
                        const [endH, endM] = appt.endTime.split(":").map(Number);
                        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                        const durationRem = (durationMinutes / 60) * 5;
                        heightStr = `calc(${durationRem}rem - 0.5rem)`;
                     }

                     return (
                       <button 
                         key={appt.id} 
                         onClick={() => setEditAppt(appt)}
                         className={cn("absolute left-[4rem] right-4 z-30 p-2 sm:px-3 sm:py-2 rounded-xl border shadow-sm flex flex-col text-left backdrop-blur-md overflow-hidden hover:brightness-95 transition-all text-left", isGroup ? "bg-purple-100/90 border-purple-200 text-purple-900" : "bg-blue-100/90 border-blue-200 text-blue-900")} 
                         style={{ top: `${topRem}rem`, height: heightStr }}
                       >
                          <div className="flex justify-between w-full items-start gap-2 h-full overflow-hidden">
                             <div className="flex flex-col min-w-0 flex-1 h-full">
                                <h4 className="font-bold text-sm leading-tight whitespace-normal break-words line-clamp-2">
                                   {client ? client.fullName : group ? `Grupo: ${group.name}` : "Reservado"}
                                </h4>
                                <div className="flex items-center gap-1 mt-0.5 text-xs font-semibold opacity-75 truncate w-full">
                                   <UserIcon size={12} className="shrink-0" />
                                   <span className="truncate">{users.find(u => u.id === appt.psicoId)?.name || "Psicólogo"}</span>
                                   {group && <span className="shrink-0 ml-1">({group.memberIds.length} pac.)</span>}
                                </div>
                             </div>
                             
                             <div className="flex flex-col items-end shrink-0 gap-1">
                               <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap", isGroup ? "bg-purple-200" : "bg-blue-200")}>
                                  {appt.time} - {appt.endTime || "..."}
                               </span>
                               {appt.attendance && appt.attendance !== "PENDENTE" && (
                                  <span className={cn("text-[9px] uppercase font-bold px-1 py-0.5 rounded", 
                                     appt.attendance === "COMPARECEU" ? "bg-green-100 text-green-700" : 
                                     appt.attendance === "FALTA_JUSTIFICADA" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
                                  )}>
                                     {appt.attendance === "COMPARECEU" ? "Presente" : appt.attendance === "FALTA_JUSTIFICADA" ? "F. Just." : "Falta"}
                                  </span>
                               )}
                             </div>
                          </div>
                       </button>
                     );
                   })}
                 </div>
               </div>
            </div>
         </div>
      )}

      {(modalData || editAppt) && (
        <AgendaModal 
           open={!!(modalData || editAppt)} 
           onClose={() => {
              setModalData(null);
              setEditAppt(null);
           }} 
           initialData={modalData || { 
             date: editAppt!.date, 
             time: editAppt!.time, 
             endTime: editAppt!.endTime, 
             roomId: editAppt!.roomId 
           }}
           existingAppointment={editAppt || undefined}
        />
      )}
    </div>
  );
}
