import { useState, useMemo } from "react";
import { useStore } from "../contexts/StoreContext";
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, User as UserIcon, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";

export default function Atendimentos() {
  const { sessions, appointments, clients, users } = useStore();
  const [startDate, setStartDate] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(20);
  const [page, setPage] = useState(1);

  // Derive "atendimentos" from sessions since sessions track attendance and session numbers
  const atendimentos = useMemo(() => {
     let list = sessions.filter(s => s.clientId); // individual sessions only for now
     
     if (startDate) {
        const start = startOfDay(parseISO(startDate));
        list = list.filter(s => !isBefore(parseISO(s.date), start));
     }
     if (endDate) {
        const end = endOfDay(parseISO(endDate));
        list = list.filter(s => !isAfter(parseISO(s.date), end));
     }
     
     // Sort by date descending
     list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
     
     return list;
  }, [sessions, startDate, endDate]);

  const totalPages = Math.ceil(atendimentos.length / pageSize);
  const currentData = atendimentos.slice((page - 1) * pageSize, page * pageSize);

  const getAttendanceBadge = (attendance?: string) => {
     if (attendance === "PRESENTE") return <span className="bg-green-100 text-green-700 font-bold px-2 py-1 rounded-md text-xs">Compareceu</span>;
     if (attendance === "FALTA_JUSTIFICADA") return <span className="bg-orange-100 text-orange-700 font-bold px-2 py-1 rounded-md text-xs">Falta Justif.</span>;
     if (attendance === "FALTA_NAO_JUSTIFICADA") return <span className="bg-red-100 text-red-700 font-bold px-2 py-1 rounded-md text-xs">Falta Injustif.</span>;
     return <span className="bg-gray-100 text-gray-700 font-bold px-2 py-1 rounded-md text-xs">Pendente</span>;
  };

  const getSessionNumberBadge = (num?: number) => {
     if (!num) return null;
     if (num > 20) return <span className="text-red-600 bg-red-50 font-bold px-2 py-1 rounded-md text-xs">Sessão {num}</span>;
     if (num > 10) return <span className="text-orange-600 bg-orange-50 font-bold px-2 py-1 rounded-md text-xs">Sessão {num}</span>;
     return <span className="text-blue-600 bg-blue-50 font-bold px-2 py-1 rounded-md text-xs">Sessão {num}</span>;
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Registro de Atendimentos</h1>
        <p className="text-gray-500">Histórico e frequência de pacientes.</p>
      </header>
      
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm mb-6 flex flex-col sm:flex-row items-end gap-4">
         <div className="flex-1 w-full">
           <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">De</label>
           <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setPage(1);}} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-medium" />
         </div>
         <div className="flex-1 w-full">
           <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Até</label>
           <input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setPage(1);}} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-medium" />
         </div>
         <div className="w-full sm:w-32">
           <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Itens</label>
           <select value={pageSize} onChange={e => {setPageSize(Number(e.target.value) as any); setPage(1);}} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-medium">
             <option value={10}>10 p/ pág</option>
             <option value={20}>20 p/ pág</option>
             <option value={50}>50 p/ pág</option>
           </select>
         </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pb-12 space-y-4">
         {currentData.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-3xl border border-gray-100 border-dashed">
               <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
               <p className="font-medium text-lg">Nenhum atendimento encontrado no período.</p>
            </div>
         ) : (
            currentData.map(session => {
               const client = clients.find(c => c.id === session.clientId);
               const psycho = users.find(u => u.id === session.psicoId);
               
               return (
                  <div key={session.id} className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-200 transition-colors">
                     <div className="flex flex-col gap-1">
                        <Link to={`/client/${client?.id}`} className="font-bold text-gray-900 text-lg hover:text-blue-600 transition-colors">
                           {client?.fullName || "Paciente Desconhecido"}
                        </Link>
                        <div className="flex items-center gap-3 text-sm text-gray-500 font-medium">
                           <span className="flex items-center gap-1"><Calendar size={14}/> {format(parseISO(session.date), "dd/MM/yyyy 'às' HH:mm")}</span>
                           <span className="flex items-center gap-1"><UserIcon size={14}/> {psycho?.name || "Psicólogo"}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-2 flex-wrap">
                        {getSessionNumberBadge(session.sessionNumber)}
                        {getAttendanceBadge(session.attendance)}
                     </div>
                  </div>
               )
            })
         )}
         
         {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
               <button 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                  className="px-4 py-2 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors"
               >
                  Anterior
               </button>
               <span className="font-bold text-sm text-gray-500 px-2">Página {page} de {totalPages}</span>
               <button 
                  disabled={page === totalPages} 
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors"
               >
                  Próxima
               </button>
            </div>
         )}
      </div>
    </div>
  );
}
