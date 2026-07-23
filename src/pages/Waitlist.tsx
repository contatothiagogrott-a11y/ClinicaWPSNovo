import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { ClientStatus, Client } from "../types";
import { cn } from "../lib/utils";
import { Plus, ChevronRight, Clock, AlertTriangle, Upload } from "lucide-react";
import CreateClientModal from "../components/CreateClientModal";
import { useClientFilters, FilterBar, FilterPanel, filterClients } from "../components/FilterPanel";
import { format } from "date-fns";

export default function Waitlist() {
  const { clients, currentUser } = useStore();
  const [isModalOpen, setModalOpen] = useState(false);
  const { filters, setFilters, isPanelOpen, setIsPanelOpen } = useClientFilters();
  const [activeTab, setActiveTab] = useState<"FILA_ESPERA" | "TRIAGEM" | "TRIADOS" | "TODOS">("TODOS");

  // Clients that are not yet "EM_ATENDIMENTO"
  let waitlistClients = clients.filter(c => ["FILA_ESPERA", "TRIAGEM", "TRIADOS"].includes(c.status));
  waitlistClients = filterClients(waitlistClients, filters);

  const displayedClients = waitlistClients.filter(c => {
     if (activeTab === "TODOS") return true;
     return c.status === activeTab;
  });

  const groupedByYear = displayedClients.reduce((acc, client) => {
    const year = new Date(client.dateIncluded).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(client);
    return acc;
  }, {} as Record<number, Client[]>);
  
  const years = Object.keys(groupedByYear).map(Number).sort((a, b) => b - a);

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Fila de Triagem</h1>
          <p className="text-gray-500">Pacientes aguardando triagem e alocação final.</p>
        </div>
        {(currentUser?.role === "ADMIN" || currentUser?.role === "SUPERVISOR") && (
          <div className="flex gap-2">
            <Link
              to="/waitlist/import"
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-5 py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm shrink-0"
            >
              <Upload size={20} />
              Importar Planilha
            </Link>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm shrink-0"
            >
              <Plus size={20} />
              Novo Paciente
            </button>
          </div>
        )}
      </header>

      {/* TABS por status — facilita achar quem está em cada etapa do fluxo */}
      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
         {([
            { v: "TODOS", l: "Todos" },
            { v: "FILA_ESPERA", l: "Fila de Espera" },
            { v: "TRIAGEM", l: "Triagem" },
            { v: "TRIADOS", l: "Triados" },
         ] as const).map(tab => {
            const count = waitlistClients.filter(c => tab.v === "TODOS" || c.status === tab.v).length;

            return (
               <button
                 key={tab.v}
                 onClick={() => setActiveTab(tab.v)}
                 className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors",
                    activeTab === tab.v ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
                 )}
               >
                 {tab.l} <span className={cn("ml-1 px-2 py-0.5 rounded-full text-xs", activeTab === tab.v ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600")}>{count}</span>
               </button>
            )
         })}
      </div>

      <FilterBar filters={filters} setFilters={setFilters} setIsPanelOpen={setIsPanelOpen} />
      <FilterPanel open={isPanelOpen} onClose={() => setIsPanelOpen(false)} filters={filters} setFilters={setFilters} />

      <div className="flex-1 overflow-y-auto min-h-0 pb-8">
         {years.length === 0 ? (
            <div className="py-12 text-center text-gray-500">Nenhum paciente encontrado nesta aba.</div>
         ) : (
            years.map(year => (
               <div key={year} className="mb-8 last:mb-0">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                     Inscritos em {year}
                     <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">{groupedByYear[year].length}</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedByYear[year].map(client => (
                      <WaitlistCard key={client.id} client={client} />
                    ))}
                  </div>
               </div>
            ))
         )}
      </div>

      <CreateClientModal open={isModalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

const WaitlistCard: React.FC<{ client: Client }> = ({ client }) => {
  const isUrgent = client.priority === "URGENTE";
  const priorityColor = {
    BAIXA: "bg-green-100 text-green-700",
    MEDIA: "bg-yellow-100 text-yellow-700",
    ALTA: "bg-orange-100 text-orange-700",
    URGENTE: "bg-red-100 text-red-700 font-bold",
  };

  const statusLabel = {
    FILA_ESPERA: "Aguardando",
    TRIAGEM: "Em Triagem",
    TRIADOS: "Triado"
  };

  return (
    <Link 
      to={`/client/${client.id}`}
      className="block bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow group relative overflow-hidden"
    >
      {isUrgent && <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />}
      
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-lg">{client.fullName}</h4>
          <p className="text-sm text-gray-500 mt-1">{client.affiliation} • {client.allocation}</p>
          {client.affiliation === "Dependente" && client.dependencySponsor && (
             <p className="text-xs text-blue-600 mt-1 font-semibold flex items-center gap-1">Servidor: {client.dependencySponsor}</p>
          )}
          {client.tags && client.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
               {client.tags.map(t => <span key={t} className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t}</span>)}
            </div>
          )}
        </div>
        {client.status !== "FILA_ESPERA" && (
          <div className="bg-blue-50 text-blue-700 rounded-full px-3 py-1.5 font-bold shrink-0 ml-4 text-xs whitespace-nowrap">
            Nº {client.protocolNumber}
          </div>
        )}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-50 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold">
           <span className="text-gray-500 font-medium">
             Entrou em: {format(new Date(client.dateIncluded), "dd/MM/yyyy")}
           </span>
           <span className="text-gray-700 bg-gray-100 px-2 py-1 rounded-full">{statusLabel[client.status as keyof typeof statusLabel]}</span>
        </div>
        {(client.priority || isUrgent) && (
          <div className="flex justify-start">
             <span className={cn("text-[10px] px-2 py-1 rounded-full flex items-center gap-1", priorityColor[client.priority || "BAIXA"])}>
                {isUrgent && <AlertTriangle size={12} />}
                {client.priority}
             </span>
          </div>
        )}
      </div>
    </Link>
  );
}
