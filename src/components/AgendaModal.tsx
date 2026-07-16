import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { X, Clock, Trash2, Repeat, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Appointment } from "../types";
import { Link } from "react-router-dom";

export default function AgendaModal({ open, onClose, initialData, existingAppointment }: { open: boolean, onClose: () => void, initialData: { date: string, time: string, endTime?: string, roomId: string }, existingAppointment?: Appointment }) {
  const { clients, users, groups, currentUser, addAppointment, updateAppointment, deleteAppointment, appointments, markAttendance, config } = useStore();

  const activeRooms = config.rooms.filter(r => r.isActive).map(r => r.name);
  const [roomId, setRoomId] = useState(initialData.roomId || activeRooms[0] || "");

  let activeClients = clients.filter(c => c.status === "EM_ATENDIMENTO");
  if(currentUser?.role === "PSICO") {
    activeClients = activeClients.filter(c => c.assignedPsicoId === currentUser.id);
  }
  
  const activeGroups = groups.filter(g => g.isActive && (currentUser?.role !== "PSICO" || g.psychologistId === currentUser.id));

  const [bookingType, setBookingType] = useState<"client" | "group">(existingAppointment?.groupId ? "group" : "client");
  const [selectedId, setSelectedId] = useState(existingAppointment?.clientId || existingAppointment?.groupId || "");
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "biweekly">(existingAppointment?.recurrence || "none");

  const defaultEndTime = () => {
    if (initialData.endTime) return initialData.endTime;
    const [h, m] = initialData.time.split(":").map(Number);
    const endH = (h + 1).toString().padStart(2, "0");
    const endM = m.toString().padStart(2, "0");
    return `${endH}:${endM}`;
  };
  
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

    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();

    const conflict = appointments.find(a => {
      if (existingAppointment && a.id === existingAppointment.id) return false;
      if (a.date !== initialData.date || a.roomId !== roomId) return false;

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
    
    const baseAppt = {
      time: startTime,
      endTime: endTime,
      roomId: roomId,
      clientId: bookingType === "client" ? selectedId : undefined,
      groupId: bookingType === "group" ? selectedId : undefined,
      psicoId: existingAppointment?.psicoId || currentUser?.id || "",
      recurrence,
      seriesId
    };

    if (existingAppointment) {
       updateAppointment(existingAppointment.id, { ...baseAppt, date: initialData.date });
    } else {
       const instances = recurrence === "none" ? 1 : 12; // Generate 12 occurrences for recurring
       for (let i = 0; i < instances; i++) {
          const d = new Date(`${initialData.date}T12:00:00`);
          if (recurrence === "weekly") d.setDate(d.getDate() + (i * 7));
          else if (recurrence === "biweekly") d.setDate(d.getDate() + (i * 14));
          const dateStr = d.toISOString().split("T")[0];
          
          addAppointment({ ...baseAppt, date: dateStr });
       }
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

  const parsedDate = new Date(`${initialData.date}T12:00:00`); 

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

             <div className="flex gap-4 pt-4 border-t border-gray-200">
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
          </div>

          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
             <button type="button" onClick={() => {setBookingType("client"); setSelectedId("");}} className={bookingType === "client" ? "flex-1 bg-white shadow-sm py-2.5 rounded-lg font-bold text-blue-600 text-sm" : "flex-1 py-2.5 text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"}>Individual</button>
             <button type="button" onClick={() => {setBookingType("group"); setSelectedId("");}} className={bookingType === "group" ? "flex-1 bg-white shadow-sm py-2.5 rounded-lg font-bold text-blue-600 text-sm" : "flex-1 py-2.5 text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"}>Grupo</button>
          </div>

          {bookingType === "client" ? (
             <div>
               <label className="block text-sm font-semibold text-gray-700 mb-2">Selecione o Paciente</label>
               <select required value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all font-medium text-gray-900">
                 <option value="" disabled>-- Escolher Paciente --</option>
                 {activeClients.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                 ))}
               </select>
               {activeClients.length === 0 && <p className="text-xs text-red-500 mt-2">Você não possui pacientes em atendimento.</p>}
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
               {existingAppointment.clientId && (
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <p className="text-sm font-bold text-gray-700 mb-3 text-center">Registro de Frequência</p>
                    <div className="flex flex-col gap-2">
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
                           onClick={() => { markAttendance(existingAppointment.id, "FALTA_JUSTIFICADA"); onClose(); }}
                           className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'FALTA_JUSTIFICADA' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                         >
                           Falta Justificada
                         </button>
                         <button 
                           type="button" 
                           onClick={() => { markAttendance(existingAppointment.id, "FALTA_INJUSTIFICADA"); onClose(); }}
                           className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${existingAppointment.attendance === 'FALTA_INJUSTIFICADA' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                         >
                           Falta s/ Justif.
                         </button>
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
