import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Plus, Package, Edit2, FileText, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { cn } from "../lib/utils";

export default function Inventory() {
  const { instruments, instrumentLogs, currentUser, addInstrument, adjustInstrumentStock } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCount, setNewCount] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addInstrument(newName.trim(), newCount);
    setNewName("");
    setNewCount(0);
    setShowAdd(false);
  };

  const handleSaveAdjust = (id: string) => {
    if (!editReason.trim()) {
       alert("É obrigatório informar o motivo do ajuste manual de estoque.");
       return;
    }
    adjustInstrumentStock(id, editCount, editReason);
    setEditingId(null);
    setEditReason("");
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold text-gray-900 mb-2">Inventário de Testes</h1>
           <p className="text-gray-500">Controle de estoque de folhas de aplicação e instrumentos.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-sm">
           <Plus size={20}/> Novo Instrumento
        </button>
      </header>

      {showAdd && (
         <form onSubmit={handleCreate} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
               <label className="block text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Nome do Instrumento / Folha</label>
               <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Folha de Aplicação - Palográfico" required className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition" />
            </div>
            <div className="w-full sm:w-32">
               <label className="block text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Qtd Inicial</label>
               <input type="number" min={0} value={newCount} onChange={e => setNewCount(parseInt(e.target.value) || 0)} required className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition" />
            </div>
            <div className="w-full sm:w-auto flex gap-2">
               <button type="submit" className="w-full sm:w-auto bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition">Adicionar</button>
            </div>
         </form>
      )}

      <div className="space-y-4">
         {instruments.length === 0 ? (
            <div className="text-center py-20 bg-white border border-gray-100 border-dashed rounded-3xl">
               <Package size={48} className="mx-auto text-gray-300 mb-4" />
               <p className="text-gray-500 font-medium">Nenhum instrumento cadastrado.</p>
            </div>
         ) : (
            instruments.map(inst => {
               const logs = instrumentLogs.filter(l => l.instrumentId === inst.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
               const isExpanded = expandedId === inst.id;
               const isEditing = editingId === inst.id;
               
               return (
                  <div key={inst.id} className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden transition-all">
                     <div className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex-1 flex gap-4 items-center cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inst.id)}>
                           <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                              <FileText size={24} />
                           </div>
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 leading-tight">{inst.name}</h3>
                              <p className="text-sm text-gray-500">ID: {inst.id}</p>
                           </div>
                        </div>

                        <div className="flex items-center gap-6 w-full sm:w-auto bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-2xl">
                           <div className="text-center">
                              <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Folhas</p>
                              {isEditing ? (
                                 <input type="number" min={0} value={editCount} onChange={e => setEditCount(parseInt(e.target.value)||0)} className="w-20 text-center text-xl font-black text-gray-900 border-b-2 border-blue-500 bg-transparent outline-none" autoFocus />
                              ) : (
                                 <p className={cn("text-3xl font-black", inst.sheetCount <= 10 ? "text-red-600" : "text-gray-900")}>{inst.sheetCount}</p>
                              )}
                           </div>
                           
                           {isEditing ? (
                              <div className="flex flex-col gap-2 relative">
                                 <input type="text" placeholder="Motivo do ajuste..." value={editReason} onChange={e => setEditReason(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 w-32 outline-none" />
                                 <div className="flex gap-2">
                                    <button onClick={() => handleSaveAdjust(inst.id)} className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200"><Check size={16}/></button>
                                    <button onClick={() => setEditingId(null)} className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-300"><X size={16}/></button>
                                 </div>
                              </div>
                           ) : (
                              <button onClick={() => { setEditingId(inst.id); setEditCount(inst.sheetCount); }} className="w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:bg-gray-50 transition shadow-sm" title="Ajuste Manual Rápido">
                                 <Edit2 size={18} />
                              </button>
                           )}
                           
                           <button onClick={() => setExpandedId(isExpanded ? null : inst.id)} className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition shrink-0 ml-auto sm:ml-0">
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                           </button>
                        </div>
                     </div>

                     {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-6">
                           <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Histórico de Movimentação</h4>
                           {logs.length === 0 ? (
                              <p className="text-sm text-gray-500">Sem movimentações recentes.</p>
                           ) : (
                              <div className="space-y-4">
                                 {logs.map(log => (
                                    <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 gap-2">
                                       <div className="flex items-center gap-3">
                                          <div className={cn("w-2 h-2 rounded-full", log.type === "CONSUMPTION" ? "bg-red-500" : log.type === "ADJUSTMENT" ? "bg-amber-500" : "bg-emerald-500")} />
                                          <div>
                                             <p className="text-sm font-bold text-gray-900 leading-tight">
                                                {log.type === "CONSUMPTION" ? "Aplicação" : log.type === "ADJUSTMENT" ? "Ajuste Manual" : "Cadastro Inicial"}
                                             </p>
                                             <p className="text-xs text-gray-500 mt-0.5">
                                                {new Date(log.date).toLocaleDateString("pt-BR", {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})}
                                             </p>
                                          </div>
                                       </div>
                                       
                                       <div className="flex items-center gap-8 text-sm">
                                          <div className="flex flex-col">
                                             <span className="text-gray-500 text-[10px] tracking-wider uppercase font-bold">Protocolo/Motivo</span>
                                             <span className="font-medium text-gray-900">{log.protocolNumber || log.reason || "-"}</span>
                                          </div>
                                          <div className="flex flex-col text-right">
                                             <span className="text-gray-500 text-[10px] tracking-wider uppercase font-bold">Variação</span>
                                             <span className={cn("font-bold text-lg", log.amount > 0 ? "text-emerald-600" : "text-red-600")}>{log.amount > 0 ? `+${log.amount}` : log.amount}</span>
                                          </div>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     )}
                  </div>
               );
            })
         )}
      </div>
    </div>
  );
}
