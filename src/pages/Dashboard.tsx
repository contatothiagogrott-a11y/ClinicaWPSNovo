import { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { AlertCircle, Users, Activity, CheckCircle, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const { currentUser, clients, sessions, appointments, users } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());

  if (!currentUser) return null;

  // KPIs
  const myClients = clients.filter(c => c.assignedPsicoId === currentUser.id);
  const filaEspera = clients.filter(c => c.status === "FILA_ESPERA" || c.status === "TRIAGEM" || c.status === "TRIADOS");
  const emAtendimento = clients.filter(c => c.status === "EM_ATENDIMENTO");

  // pending notes (3 days older draft sessions)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const pendingDrafts = sessions.filter(s => s.isDraft && new Date(s.date) < threeDaysAgo);
  const pendingClientsIds = new Set(pendingDrafts.map(d => d.clientId));
  const pendingNotes = myClients.filter(c => pendingClientsIds.has(c.id));
  const almostExceeding = emAtendimento.filter(c => c.completedSessions > 0 && c.completedSessions >= c.maxSessions - 2);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  
  const myAppointmentsToday = appointments
    .filter(a => a.date === dateStr && (currentUser.role === "PSICO" ? a.psicoId === currentUser.id : true))
    .sort((a,b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Olá, {currentUser.name.split(" ")[0]}</h1>
        <p className="text-gray-500">Resumo de suas atividades.</p>
      </header>

      {/* Alertas */}
      {(currentUser.role === "PSICO" || currentUser.role === "SUPERVISOR") && pendingNotes.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-amber-800 font-bold mb-1">Atenção aos Prontuários</h3>
            <p className="text-amber-700 text-sm">Existem pacientes com sessões realizadas recentemente sem evolução registrada no prontuário. Registre-as o quanto antes.</p>
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

      {(currentUser.role === "ADMIN" || currentUser.role === "SUPERVISOR") && almostExceeding.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-bold mb-1">Limite Previsto Atingido</h3>
            <p className="text-red-700 text-sm">Os pacientes abaixo ultrapassaram (ou estão próximos) do número limite de atendimentos. Necessitam de nova avaliação.</p>
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

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {(currentUser.role === "ADMIN" || currentUser.role === "SUPERVISOR") && (
          <Link to="/waitlist" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Fila de Espera</p>
              <h4 className="text-4xl font-bold text-gray-900">{filaEspera.length}</h4>
            </div>
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <Clock size={28} />
            </div>
          </Link>
        )}

        {(currentUser.role === "ADMIN" || currentUser.role === "SUPERVISOR") && (
          <Link to="/active" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Total em Atendimento</p>
              <h4 className="text-4xl font-bold text-gray-900">{emAtendimento.length}</h4>
            </div>
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
              <Activity size={28} />
            </div>
          </Link>
        )}

        {(currentUser.role === "PSICO") && (
          <Link to="/active" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-600 transition-colors">Meus Pacientes</p>
              <h4 className="text-4xl font-bold text-gray-900">{myClients.length}</h4>
            </div>
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
              <Users size={28} />
            </div>
          </Link>
        )}
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <CalendarIcon size={20} />
               </div>
               <div>
                  <h2 className="text-xl font-bold text-gray-900">Agenda {currentUser.role !== "PSICO" ? "Geral" : "Diária"}</h2>
                  <p className="text-sm text-gray-500 capitalize">{format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
               </div>
            </div>
            <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-200">
               <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronLeft size={20} className="text-gray-600"/></button>
               <span className="px-4 font-semibold text-sm text-gray-700 min-w-[100px] text-center">
                 {format(selectedDate, "dd/MM/yyyy")}
               </span>
               <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronRight size={20} className="text-gray-600"/></button>
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
