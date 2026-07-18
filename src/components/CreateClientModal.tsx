import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { TagInput } from "./TagInput";

export default function CreateClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, addClient, addConfigItem } = useStore();

  const activeAffiliations = config.affiliations.filter(x => x.isActive).map(x => x.name);
  const activeAllocations = config.allocations.filter(x => x.isActive).map(x => x.name);
  const activeTags = config.tags?.filter(x => x.isActive).map(x => x.name) || [];

  const [formData, setFormData] = useState<{
    protocolNumber: string;
    signedAgreement: boolean;
    fullName: string;
    whatsapp: string;
    birthDate: string;
    affiliation: string;
    allocation: string;
    tags: string[];
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelationship: string;
    dependencyType: string;
    dependencySponsor: string;
    dateIncluded: string;
  }>({
    protocolNumber: "",
    signedAgreement: false,
    fullName: "",
    whatsapp: "",
    birthDate: "",
    affiliation: activeAffiliations[0] || "",
    allocation: activeAllocations[0] || "",
    tags: [],
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    dependencyType: "",
    dependencySponsor: "",
    dateIncluded: new Date().toISOString().split("T")[0],
  });

  const toggleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) 
        ? prev.tags.filter(t => t !== tag) 
        : [...prev.tags, tag]
    }));
  };

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.whatsapp) return;

    addClient({
      fullName: formData.fullName,
      whatsapp: formData.whatsapp,
      birthDate: formData.birthDate,
      protocolNumber: formData.protocolNumber || "Pendente",
      signedAgreement: formData.signedAgreement,
      registrationCode: `MAT-${Math.floor(Math.random() * 10000)}`,
      affiliation: formData.affiliation,
      allocation: formData.allocation,
      tags: formData.tags,
      dependencyType: formData.affiliation === "Dependente" ? formData.dependencyType : undefined,
      dependencySponsor: formData.affiliation === "Dependente" ? formData.dependencySponsor : undefined,
      dateIncluded: formData.dateIncluded ? new Date(formData.dateIncluded).toISOString() : new Date().toISOString(),
      status: "FILA_ESPERA",
      maxSessions: 10, // default
      emergencyContactName: formData.emergencyContactName,
      emergencyContactPhone: formData.emergencyContactPhone,
      emergencyContactRelationship: formData.emergencyContactRelationship,
    });
    setFormData({
      protocolNumber: "", signedAgreement: false, dateIncluded: new Date().toISOString().split("T")[0],
      fullName: "", whatsapp: "", birthDate: "",
      affiliation: activeAffiliations[0] || "", allocation: activeAllocations[0] || "",
      tags: [],
      emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
      dependencyType: "", dependencySponsor: ""
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col mb-20 sm:mb-0 animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Novo Paciente</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
               <label className="block text-sm font-semibold text-gray-700 mb-1">Nº Prontuário</label>
               <input type="text" value={formData.protocolNumber} onChange={e => setFormData({...formData, protocolNumber: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all font-mono" placeholder="Ex: 4" />
            </div>
            <div>
               <label className="block text-sm font-semibold text-gray-700 mb-1">Entrou na fila em</label>
               <input type="date" value={formData.dateIncluded} onChange={e => setFormData({...formData, dateIncluded: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col justify-end pb-0">
               <button 
                 type="button" 
                 onClick={() => setFormData({...formData, signedAgreement: !formData.signedAgreement})}
                 className={cn("w-full flex items-center justify-between px-3 h-[48px] border-2 rounded-xl font-bold transition outline-none", formData.signedAgreement ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100")}
               >
                 <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
                   <div className={cn("w-8 h-4 rounded-full flex items-center p-0.5 transition-colors duration-200", formData.signedAgreement ? "bg-emerald-500" : "bg-gray-300")}>
                     <div className={cn("bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200", formData.signedAgreement ? "translate-x-4" : "translate-x-0")} />
                   </div>
                   Regimento Assinado
                 </span>
               </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
            <input required type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" placeholder="Nome do paciente" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp</label>
              <input required type="text" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Data de Nasc.</label>
              <input required type="date" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Vínculo</label>
              <select value={formData.affiliation} onChange={e => setFormData({...formData, affiliation: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all">
                {activeAffiliations.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Local (Unidade)</label>
              <select value={formData.allocation} onChange={e => setFormData({...formData, allocation: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all">
                {activeAllocations.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {formData.affiliation === "Dependente" && (
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Qual o Vínculo? (Ex: Filho)</label>
                <input required={formData.affiliation === "Dependente"} type="text" value={formData.dependencyType} onChange={e => setFormData({...formData, dependencyType: e.target.value})} className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-lg px-3 py-2 outline-none transition-all" placeholder="Ex: Filho, Cônjuge" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">De quem é a filiação (Nome/Matrícula)</label>
                <input required={formData.affiliation === "Dependente"} type="text" value={formData.dependencySponsor} onChange={e => setFormData({...formData, dependencySponsor: e.target.value})} className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-lg px-3 py-2 outline-none transition-all" placeholder="João (MAT-123)" />
              </div>
            </div>
          )}

          {activeTags.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tags de Demanda</label>
              <TagInput 
                value={formData.tags} 
                onChange={t => setFormData({...formData, tags: t})} 
                availableTags={activeTags}
                onCreateTag={(tagName) => addConfigItem("tags", tagName)}
              />
            </div>
          )}
          
          <div className="pt-4 border-t border-gray-100">
             <h3 className="font-bold text-gray-800 mb-4 tracking-tight">Contato de Emergência</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nome</label>
                  <input type="text" value={formData.emergencyContactName} onChange={e => setFormData({...formData, emergencyContactName: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" placeholder="Nome do contato" />
               </div>
               <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Parentesco/Vínculo</label>
                  <input type="text" value={formData.emergencyContactRelationship} onChange={e => setFormData({...formData, emergencyContactRelationship: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" placeholder="Ex: mãe, cônjuge, amigo(a)..." />
               </div>
               <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                  <input type="text" value={formData.emergencyContactPhone} onChange={e => setFormData({...formData, emergencyContactPhone: e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all" placeholder="(11) 99999-9999" />
               </div>
             </div>
          </div>

          <div className="pt-6">
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg py-4 rounded-xl transition-colors shadow-sm">
              Concluir Cadastro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
