import React, { useState } from "react";
import { X, Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { cn } from "../lib/utils";

export interface FilterState {
  search: string;
  tags: string[];
  priority: string[]; // URGENTE, ALTA, MEDIA, BAIXA
  allocation: string;
  affiliation: string;
  order: "asc" | "desc"; // desc = newest first
}

export function useClientFilters() {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    tags: [],
    priority: [],
    allocation: "",
    affiliation: "",
    order: "asc", 
  });

  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return { filters, setFilters, isPanelOpen, setIsPanelOpen };
}

export function FilterBar({ filters, setFilters, setIsPanelOpen }: any) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por nome ou matrícula..." 
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-full pl-12 pr-4 py-3 outline-none transition-colors text-sm font-medium shadow-sm"
        />
      </div>
      <button 
        onClick={() => setIsPanelOpen(true)}
        className="bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 text-gray-600 px-4 py-3 rounded-full flex items-center justify-center gap-2 transition-colors shadow-sm"
      >
        <SlidersHorizontal size={20} />
        <span className="hidden sm:inline font-bold text-sm">Filtros</span>
      </button>
    </div>
  );
}

export function FilterPanel({ open, onClose, filters, setFilters }: any) {
  const { config } = useStore();
  const activeTags = config.tags?.filter(x => x.isActive).map(x => x.name) || [];
  const activeAllocations = config.allocations.filter(x => x.isActive).map(x => x.name);
  const activeAffiliations = config.affiliations.filter(x => x.isActive).map(x => x.name);

  if (!open) return null;

  const toggleTag = (tag: string) => {
    setFilters((prev: any) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t: string) => t !== tag) : [...prev.tags, tag]
    }));
  };

  const togglePriority = (p: string) => {
    setFilters((prev: any) => ({
      ...prev,
      priority: prev.priority.includes(p) ? prev.priority.filter((x: string) => x !== p) : [...prev.priority, p]
    }));
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <SlidersHorizontal size={20}/>
            Filtros Avançados
          </h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {activeTags.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Tags de Demanda</h3>
              <div className="flex flex-wrap gap-2">
                {activeTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-bold transition-colors border", filters.tags.includes(tag) ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100")}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Nível de Risco</h3>
            <div className="flex flex-wrap gap-2">
              {['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'].map(p => (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-bold transition-colors border", filters.priority.includes(p) ? "bg-red-100 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100")}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Vínculo</h3>
            <select value={filters.affiliation} onChange={e => setFilters({...filters, affiliation: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 outline-none font-medium text-gray-700 transition-colors">
              <option value="">Todos os Vínculos</option>
              {activeAffiliations.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Alocação</h3>
            <select value={filters.allocation} onChange={e => setFilters({...filters, allocation: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 outline-none font-medium text-gray-700 transition-colors">
              <option value="">Todas as Alocações</option>
              {activeAllocations.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Ordem Cronológica</h3>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setFilters({...filters, order: 'desc'})} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", filters.order === 'desc' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Mais recentes</button>
              <button onClick={() => setFilters({...filters, order: 'asc'})} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", filters.order === 'asc' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Mais antigos</button>
            </div>
          </div>

        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <button 
            onClick={() => setFilters({ search: "", tags: [], priority: [], allocation: "", affiliation: "", order: "asc" })}
            className="w-full font-bold text-gray-500 hover:text-gray-900 text-sm py-2 transition-colors"
          >
            Limpar Filtros
          </button>
        </div>
      </div>
    </div>
  );
}

export function filterClients(clients: import('../types').Client[], filters: FilterState) {
  let result = [...clients];

  if (filters.search.trim() !== "") {
    const s = filters.search.toLowerCase();
    result = result.filter(c => 
      c.fullName.toLowerCase().includes(s) || 
      c.registrationCode.toLowerCase().includes(s) ||
      (c.protocolNumber && c.protocolNumber.toLowerCase().includes(s)) ||
      c.id.toLowerCase().includes(s)
    );
  }

  if (filters.tags.length > 0) {
    result = result.filter(c => c.tags && filters.tags.some(t => c.tags!.includes(t)));
  }

  if (filters.priority.length > 0) {
    result = result.filter(c => c.priority && filters.priority.includes(c.priority));
  }

  if (filters.affiliation) {
    result = result.filter(c => c.affiliation === filters.affiliation);
  }

  if (filters.allocation) {
    result = result.filter(c => c.allocation === filters.allocation);
  }

  const priorityScore: Record<string, number> = { URGENTE: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
  
  result.sort((a, b) => {
    // If priority filters applied, might still want to sort by priority first, or just use date?
    // User requested "Ordem Cronológica", let's prioritize Date if we are filtering, but standard sorting uses Priority then Date.
    // Let's just sort purely by date Included if filters.order is used to override, but if no filters, standard?
    // Just sort by priority, then date Included based on order.
    const pA = a.priority ? priorityScore[a.priority] : 0;
    const pB = b.priority ? priorityScore[b.priority] : 0;
    
    if (pA !== pB) return pB - pA; // Priority always desc
    
    const tA = new Date(a.dateIncluded).getTime();
    const tB = new Date(b.dateIncluded).getTime();
    
    return filters.order === "asc" ? tA - tB : tB - tA;
  });

  return result;
}
