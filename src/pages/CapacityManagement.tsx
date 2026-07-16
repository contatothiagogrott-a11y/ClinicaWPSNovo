import { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Users, AlertCircle, CheckCircle2, TrendingUp, Settings } from "lucide-react";
import { cn } from "../lib/utils";

export default function CapacityManagement() {
  const { users, clients, updateUser } = useStore();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  const [capacityForm, setCapacityForm] = useState({
     urgente: 0,
     alta: 0,
     media: 0,
     baixa: 0
  });

  const psicos = users.filter(u => u.role === "PSICO");

  // Calculate current loads
  const getPsychoLoad = (psicoId: string) => {
     const myClients = clients.filter(c => c.assignedPsicoId === psicoId && c.status === "EM_ATENDIMENTO");
     const counts = {
        urgente: myClients.filter(c => c.priority === "URGENTE").length,
        alta: myClients.filter(c => c.priority === "ALTA").length,
        media: myClients.filter(c => c.priority === "MEDIA").length,
        baixa: myClients.filter(c => c.priority === "BAIXA" || !c.priority).length
     };
     return counts;
  };

  const openEdit = (user: any) => {
     setEditingUserId(user.id);
     setCapacityForm(user.capacity || { urgente: 1, alta: 2, media: 3, baixa: 4 });
  };

  const saveCapacity = (userId: string) => {
     updateUser(userId, { capacity: capacityForm });
     setEditingUserId(null);
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Quadro Clínico e Capacidade</h1>
        <p className="text-gray-500">Gestão do limite de pacientes por nível de severidade para cada psicólogo.</p>
      </header>
      
      <div className="flex-1 overflow-y-auto pb-12 space-y-6">
         {psicos.map(psico => {
            const load = getPsychoLoad(psico.id);
            const cap = psico.capacity || { urgente: 1, alta: 2, media: 3, baixa: 4 };
            const isEditing = editingUserId === psico.id;
            
            const isOverUrg = load.urgente > cap.urgente;
            const isOverAlt = load.alta > cap.alta;
            const isOverMed = load.media > cap.media;
            const isOverBai = load.baixa > cap.baixa;
            
            return (
               <div key={psico.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                           {psico.name.charAt(0)}
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-gray-900">{psico.name}</h2>
                           <p className="text-sm text-gray-500">CRP: {psico.crp || "Não informado"}</p>
                        </div>
                     </div>
                     {!isEditing && (
                        <button onClick={() => openEdit(psico)} className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 font-semibold text-sm transition-colors">
                           <Settings size={16} /> Configurar Limites
                        </button>
                     )}
                  </div>
                  
                  {isEditing ? (
                     <div className="bg-gray-50 p-4 rounded-2xl flex flex-col gap-4 border border-gray-200">
                        <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider">Ajustar Capacidade Máxima</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                           <div>
                              <label className="block text-xs font-bold text-red-600 mb-1">Grave (Urgente)</label>
                              <input type="number" min="0" value={capacityForm.urgente} onChange={e => setCapacityForm({...capacityForm, urgente: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 font-bold" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-orange-600 mb-1">Elevado (Alta)</label>
                              <input type="number" min="0" value={capacityForm.alta} onChange={e => setCapacityForm({...capacityForm, alta: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 font-bold" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-amber-600 mb-1">Moderado (Média)</label>
                              <input type="number" min="0" value={capacityForm.media} onChange={e => setCapacityForm({...capacityForm, media: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 font-bold" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-blue-600 mb-1">Baixo (Baixa)</label>
                              <input type="number" min="0" value={capacityForm.baixa} onChange={e => setCapacityForm({...capacityForm, baixa: Number(e.target.value)})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 font-bold" />
                           </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setEditingUserId(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                           <button onClick={() => saveCapacity(psico.id)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">Salvar Limites</button>
                        </div>
                     </div>
                  ) : (
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Grave */}
                        <div className={cn("p-4 rounded-2xl border", isOverUrg ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100")}>
                           <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-red-700">Grave</span>
                              {isOverUrg ? <AlertCircle size={16} className="text-red-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                           </div>
                           <div className="flex items-end gap-2">
                              <span className={cn("text-3xl font-black", isOverUrg ? "text-red-700" : "text-gray-900")}>{load.urgente}</span>
                              <span className="text-gray-500 font-bold mb-1">/ {cap.urgente}</span>
                           </div>
                        </div>
                        
                        {/* Elevado */}
                        <div className={cn("p-4 rounded-2xl border", isOverAlt ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-100")}>
                           <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-orange-700">Elevado</span>
                              {isOverAlt ? <AlertCircle size={16} className="text-orange-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                           </div>
                           <div className="flex items-end gap-2">
                              <span className={cn("text-3xl font-black", isOverAlt ? "text-orange-700" : "text-gray-900")}>{load.alta}</span>
                              <span className="text-gray-500 font-bold mb-1">/ {cap.alta}</span>
                           </div>
                        </div>
                        
                        {/* Moderado */}
                        <div className={cn("p-4 rounded-2xl border", isOverMed ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100")}>
                           <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Moderado</span>
                              {isOverMed ? <AlertCircle size={16} className="text-amber-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                           </div>
                           <div className="flex items-end gap-2">
                              <span className={cn("text-3xl font-black", isOverMed ? "text-amber-700" : "text-gray-900")}>{load.media}</span>
                              <span className="text-gray-500 font-bold mb-1">/ {cap.media}</span>
                           </div>
                        </div>
                        
                        {/* Baixo */}
                        <div className={cn("p-4 rounded-2xl border", isOverBai ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100")}>
                           <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Baixo</span>
                              {isOverBai ? <AlertCircle size={16} className="text-blue-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                           </div>
                           <div className="flex items-end gap-2">
                              <span className={cn("text-3xl font-black", isOverBai ? "text-blue-700" : "text-gray-900")}>{load.baixa}</span>
                              <span className="text-gray-500 font-bold mb-1">/ {cap.baixa}</span>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            );
         })}
      </div>
    </div>
  );
}
