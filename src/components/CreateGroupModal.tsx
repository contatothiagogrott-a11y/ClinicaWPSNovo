import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export default function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addGroup, users } = useStore();

  const [formData, setFormData] = useState({
    name: "",
    objective: "",
    methodology: "",
    frequency: "",
    criteria: "",
    psychologistId: "",
  });

  if (!open) return null;

  const psicos = users.filter(u => u.role === "PSICO");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.objective || !formData.psychologistId) return;

    addGroup({
      name: formData.name,
      objective: formData.objective,
      methodology: formData.methodology,
      frequency: formData.frequency,
      criteria: formData.criteria,
      psychologistId: formData.psychologistId,
      isActive: true,
    });
    
    setFormData({ name: "", objective: "", methodology: "", frequency: "", criteria: "", psychologistId: "" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-t-[2rem] sm:rounded-3xl shadow-xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900">Novo Grupo</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <form id="create-group-form" onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nome do Grupo</label>
              <input 
                required 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" 
                placeholder="Ex: Terapia Cognitiva em Grupo" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Psicólogo Responsável</label>
              <select required value={formData.psychologistId} onChange={e => setFormData({...formData, psychologistId: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all">
                <option value="">Selecione...</option>
                {psicos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Objetivo</label>
              <textarea 
                required 
                value={formData.objective} 
                onChange={e => setFormData({...formData, objective: e.target.value})} 
                className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all resize-y min-h-[100px]" 
                placeholder="Qual o foco principal do grupo?" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Referencial Teórico/Metodológico</label>
              <input 
                value={formData.methodology} 
                onChange={e => setFormData({...formData, methodology: e.target.value})} 
                className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" 
                placeholder="Ex: TCC, Psicanálise, Rodas de Conversa" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Frequência e Duração Prevista</label>
              <input 
                value={formData.frequency} 
                onChange={e => setFormData({...formData, frequency: e.target.value})} 
                className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" 
                placeholder="Ex: Semanal, 12 encontros" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Critérios de Inclusão/Exclusão</label>
              <textarea 
                value={formData.criteria} 
                onChange={e => setFormData({...formData, criteria: e.target.value})} 
                className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all resize-y min-h-[100px]" 
                placeholder="Ex: Somente para pais de adolescentes; até 10 participantes." 
              />
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-[2rem] sm:rounded-b-3xl">
          <button 
            type="submit" 
            form="create-group-form"
            className={cn("w-full py-4 rounded-xl font-bold text-lg transition-all", 
              (formData.name && formData.objective && formData.psychologistId) 
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20" 
                : "bg-gray-200 text-gray-400 cursor-not-allowed")}
          >
            Criar Grupo
          </button>
        </div>
      </div>
    </div>
  );
}
