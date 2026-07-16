import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { Client } from "../types";
import { cn } from "../lib/utils";
import { Search, MapPin, User, ChevronRight, Phone } from "lucide-react";
import { useClientFilters, FilterBar, FilterPanel, filterClients } from "../components/FilterPanel";

export default function ActiveClients() {
  const { clients, currentUser, groups } = useStore();
  const [showOnlyMine, setShowOnlyMine] = useState(currentUser?.role === "PSICO");
  const [modalityFilter, setModalityFilter] = useState<"TODOS" | "INDIVIDUAL" | "GRUPAL">("TODOS");
  const { filters, setFilters, isPanelOpen, setIsPanelOpen } = useClientFilters();

  let activeClients = clients.filter(c => c.status === "EM_ATENDIMENTO");
  
  if (showOnlyMine && currentUser) {
    activeClients = activeClients.filter(c => c.assignedPsicoId === currentUser.id);
  }

  if (modalityFilter === "INDIVIDUAL") {
    activeClients = activeClients.filter(c => !groups.some(g => g.memberIds.includes(c.id)));
  } else if (modalityFilter === "GRUPAL") {
    activeClients = activeClients.filter(c => groups.some(g => g.memberIds.includes(c.id)));
  }

  activeClients = filterClients(activeClients, filters);

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 sm:p-0">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Em Atendimento</h1>
          <p className="text-gray-500">Pacientes ativos atualmente na clínica.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-2xl">
            <button onClick={() => setModalityFilter("TODOS")} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", modalityFilter === "TODOS" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}>Todos</button>
            <button onClick={() => setModalityFilter("INDIVIDUAL")} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", modalityFilter === "INDIVIDUAL" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}>Individual</button>
            <button onClick={() => setModalityFilter("GRUPAL")} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", modalityFilter === "GRUPAL" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}>Grupal</button>
          </div>

          {currentUser?.role === "PSICO" && (
             <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                <button 
                  onClick={() => setShowOnlyMine(false)} 
                  className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", !showOnlyMine ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50")}
                >
                  Clínica
                </button>
                <button 
                  onClick={() => setShowOnlyMine(true)} 
                  className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", showOnlyMine ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50")}
                >
                  Meus Clientes
                </button>
             </div>
          )}
        </div>
      </header>

      <FilterBar filters={filters} setFilters={setFilters} setIsPanelOpen={setIsPanelOpen} />
      <FilterPanel open={isPanelOpen} onClose={() => setIsPanelOpen(false)} filters={filters} setFilters={setFilters} />

      <div className="flex-1 overflow-y-auto">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeClients.map(client => (
              <ActiveCard key={client.id} client={client} />
            ))}
            {activeClients.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">Nenhum paciente encontrado.</div>
            )}
         </div>
      </div>
    </div>
  );
}

const ActiveCard: React.FC<{ client: Client }> = ({ client }) => {
  const navigate = useNavigate();
  const { groups } = useStore();

  const clientGroups = groups.filter(g => g.memberIds.includes(client.id));

  const formatPhone = (phone: string) => {
    return phone.replace(/\D/g, "");
  };

  const preventProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div 
      onClick={() => navigate(`/client/${client.id}`)}
      className="block cursor-pointer bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all group relative"
    >
       <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
              {client.fullName}
            </h3>
            <p className="text-sm font-medium text-gray-500">Mat: {client.registrationCode}</p>
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                 {client.tags.map(t => <span key={t} className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t}</span>)}
              </div>
            )}
          </div>
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold shrink-0 ml-4">
            {client.completedSessions}
          </div>
       </div>

       <div className="mt-6 space-y-3">
         <div className="flex items-center gap-3 text-sm text-gray-600 font-medium bg-gray-50 p-3 rounded-2xl">
           <MapPin size={18} className="text-gray-400" />
           {client.defaultRoom ? `${client.defaultRoom} às ${client.defaultTime}` : "Sem sala definida"}
         </div>
         {clientGroups.length > 0 ? (
           clientGroups.map(g => (
             <div key={g.id} className="flex items-center gap-3 text-sm text-blue-700 font-medium bg-blue-50 p-3 rounded-2xl">
               <User size={18} className="text-blue-400" />
               Grupo: {g.name}
             </div>
           ))
         ) : (
           <div className="flex items-center gap-3 text-sm text-gray-600 font-medium bg-gray-50 p-3 rounded-2xl">
             <User size={18} className="text-gray-400" />
             {client.assignedPsicoName || "Sem psicólogo (Individual)"}
           </div>
         )}
       </div>

       <div className="mt-6 flex items-center gap-2">
         {client.whatsapp && (
           <a 
              href={`https://wa.me/55${formatPhone(client.whatsapp)}`} 
              target="_blank" 
              rel="noreferrer"
              onClick={preventProp}
              className="flex-1 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-colors"
           >
             <Phone size={16} /> Entrar em contato
           </a>
         )}
       </div>
    </div>
  );
}
