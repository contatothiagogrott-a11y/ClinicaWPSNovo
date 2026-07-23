import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { ChevronLeft, Edit2, Clock, FileText, UserCircle, Save, Phone, X, FileDown, ShieldAlert, Siren, Download, Lock } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ClinicalDocumentForm from "../components/ClinicalDocumentForm";
import { ANAMNESE_RISCO_SECTIONS, URGENCIA_SECTIONS } from "../lib/clinicalFormSchemas";
import { buildAnamneseRiscoDocDefinition } from "../lib/pdfAnamneseRisco";
import { buildUrgenciaDocDefinition } from "../lib/pdfUrgencia";
import { buildProntuarioDocDefinition } from "../lib/pdfProntuario";
import { buildAtestadoDocDefinition } from "../lib/pdfAtestado";
import AtestadoModal from "../components/AtestadoModal";
import { openPdfInNewTab, downloadPdf } from "../lib/pdfGenerator";

import { TagInput } from "../components/TagInput";

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, users, sessions, currentUser, updateClient, reactivateClient, config, addConfigItem, clinicalDocuments, addClinicalDocument, updateClinicalDocument, instruments } = useStore();
  const client = clients.find(c => c.id === id);

  const [activeTab, setActiveTab] = useState<"INFO" | "PRONTUARIO" | "HISTORICO" | "INSTRUMENTOS" | "DOCUMENTOS">("INFO");
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [editData, setEditData] = useState(client);
  const [openAnamneseForm, setOpenAnamneseForm] = useState<{ id?: string; data?: any } | null>(null);
  const [openUrgenciaForm, setOpenUrgenciaForm] = useState<{ id?: string; data?: any } | null>(null);
  const [openAtestado, setOpenAtestado] = useState<{ id?: string } | null>(null);

  if (!client || !editData) return <div className="p-8 text-center">Paciente não encontrado.</div>;

  const formatPhone = (phone: string) => phone.replace(/\D/g, "");
  const clientDocs = clinicalDocuments.filter(d => d.clientId === client.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const assignedPsico = users.find(u => u.id === client.assignedPsicoId);

  const [showExportPrompt, setShowExportPrompt] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());

  const handleExportProntuario = () => {
    if (!client.instruments || client.instruments.length === 0) {
      const docDef = buildProntuarioDocDefinition(client, sessions, assignedPsico);
      openPdfInNewTab(docDef);
      return;
    }
    setSelectedTestIds(new Set(client.instruments.map(a => a.id)));
    setShowExportPrompt(true);
  };

  const finalizeExportProntuario = (includeTests: boolean) => {
    const includedApps = includeTests ? (client.instruments || []).filter(a => selectedTestIds.has(a.id)) : undefined;
    const docDef = buildProntuarioDocDefinition(client, sessions, assignedPsico, includedApps, instruments);
    openPdfInNewTab(docDef);
    setShowExportPrompt(false);
  };

  const handleSaveInfo = () => {
    updateClient(client.id, editData, "Informações do paciente atualizadas.");
    setIsEditingInfo(false);
  };

  const handleReactivate = (newStatus: any) => {
     reactivateClient(client.id, newStatus);
     setIsReactivating(false);
  };

  const psicos = users.filter(u => u.role === "PSICO");

  // Auth Checks
  const canViewProntuario = currentUser?.role === "SUPERVISOR" || (currentUser?.role === "PSICO" && client.assignedPsicoId === currentUser?.id);
  const canEditStatus = (currentUser?.role === "SUPERVISOR" || currentUser?.role === "ADMIN" || currentUser?.role === "PSICO") && client.status !== "FINALIZADO";

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto space-y-6">
      {/* Reactivate Banner */}
      {client.status === "FINALIZADO" && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-amber-900 font-bold text-lg">Caso Finalizado</h3>
            <p className="text-amber-700/80 font-medium text-sm">Este paciente recebeu alta ou foi desligado. Você pode reativar o caso se necessário.</p>
          </div>
          {isReactivating ? (
            <div className="flex items-center gap-2">
               <button onClick={() => handleReactivate("FILA_ESPERA")} className="bg-white border border-amber-200 text-amber-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors">Voltar para Fila</button>
               <button onClick={() => handleReactivate("TRIAGEM")} className="bg-white border border-amber-200 text-amber-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors">Reenviar à Triagem</button>
               <button onClick={() => handleReactivate("EM_ATENDIMENTO")} className="bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors">Reativar Atendimento</button>
               <button onClick={() => setIsReactivating(false)} className="text-gray-500 hover:text-gray-700 p-2"><X size={20}/></button>
            </div>
          ) : (
            <button onClick={() => setIsReactivating(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors">
              Reativar Caso
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-3 bg-white hover:bg-gray-50 rounded-full flex-shrink-0 shadow-sm text-gray-500 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{client.fullName}</h1>
          <p className="text-gray-500 text-sm font-medium mt-1">Matrícula: {client.registrationCode} <span className="mx-2">•</span> Prontuário n.º: <strong className="text-gray-800">{client.protocolNumber}</strong> <span className="mx-2">•</span> Entrou em: {format(new Date(client.dateIncluded), "dd/MM/yyyy")}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={cn("text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider", client.signedAgreement ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              {client.signedAgreement ? "Termo de Compromisso Assinado ✓" : "Termo de Compromisso Pendente !"}
            </span>
            {client.tags && client.tags.map(t => <span key={t} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">{t}</span>)}
          </div>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-full overflow-x-auto sm:w-max mx-auto sm:mx-0">
        <button 
          onClick={() => setActiveTab("INFO")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "INFO" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
        >
          <UserCircle size={18} /> Informações
        </button>
        <button 
          onClick={() => setActiveTab("PRONTUARIO")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "PRONTUARIO" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
        >
          <FileText size={18} /> Prontuário
        </button>
        {canViewProntuario && (
          <button 
            onClick={() => setActiveTab("INSTRUMENTOS")}
            className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all leading-tight whitespace-nowrap", activeTab === "INSTRUMENTOS" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
          >
            <Edit2 size={18} /> Instrumentos
          </button>
        )}
        <button 
          onClick={() => setActiveTab("HISTORICO")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "HISTORICO" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
        >
          <Clock size={18} /> Histórico
        </button>
        <button 
          onClick={() => setActiveTab("DOCUMENTOS")}
          className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap", activeTab === "DOCUMENTOS" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
        >
          <FileDown size={18} /> Documentos
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 sm:p-8">
        
        {/* INFO TAB */}
        {activeTab === "INFO" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Ficha do Paciente</h2>
              {!isEditingInfo && canEditStatus && (
                <button onClick={() => setIsEditingInfo(true)} className="text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                  <Edit2 size={16} /> Editar
                </button>
              )}
              {isEditingInfo && (
                <button onClick={handleSaveInfo} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                  <Save size={16} /> Salvar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Fluxo / Status */}
              <div className="space-y-4 bg-gray-50 p-6 rounded-3xl">
                <h3 className="font-bold text-gray-700">Controle de Fluxo</h3>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Fase Atual</label>
                  {isEditingInfo ? (
                    <select value={editData.status} onChange={e => setEditData({...editData, status: e.target.value as any})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium">
                      <option value="FILA_ESPERA">Fila de Espera</option>
                      <option value="TRIAGEM">Triagem</option>
                      <option value="TRIADOS">Triados</option>
                      <option value="EM_ATENDIMENTO">Em Atendimento</option>
                      <option value="FINALIZADO">Finalizado / Alta</option>
                    </select>
                  ) : (
                    <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.status}</div>
                  )}
                </div>

                {isEditingInfo && (
                   <div className="mb-2">
                      <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Termos de Compromisso</label>
                      <button 
                         type="button" 
                         onClick={() => setEditData({...editData, signedAgreement: !editData.signedAgreement})}
                         className={cn("w-full flex items-center justify-between p-4 border rounded-xl font-bold transition outline-none", editData.signedAgreement ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}
                      >
                         <span className="flex items-center gap-3">
                           <div className={cn("w-10 h-6 rounded-full flex items-center p-1 transition-colors duration-200", editData.signedAgreement ? "bg-emerald-500" : "bg-gray-300")}>
                             <div className={cn("bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200", editData.signedAgreement ? "translate-x-4" : "translate-x-0")} />
                           </div>
                           Termo de Compromisso Assinado
                         </span>
                         <span className="text-sm">{editData.signedAgreement ? "✓ Sim" : "Pendente"}</span>
                      </button>
                   </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Matrícula</label>
                    {isEditingInfo ? (
                      <input type="text" value={editData.registrationCode || ""} onChange={e => setEditData({...editData, registrationCode: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                    ) : (
                      <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.registrationCode || "Sem matrícula"}</div>
                    )}
                  </div>
                  <div>
                     <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Prontuário</label>
                     {isEditingInfo ? (
                        <input type="text" value={editData.protocolNumber || ""} onChange={e => setEditData({...editData, protocolNumber: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium text-gray-900" />
                     ) : (
                        <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900">{client.protocolNumber || "Pendente"}</div>
                     )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Entrou na fila em</label>
                    {isEditingInfo ? (
                      <input type="date" value={editData.dateIncluded ? editData.dateIncluded.split("T")[0] : ""} onChange={e => setEditData({...editData, dateIncluded: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                    ) : (
                      <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.dateIncluded ? format(new Date(client.dateIncluded), "dd/MM/yyyy") : "—"}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Setor</label>
                    {isEditingInfo ? (
                      <input type="text" value={editData.sector || ""} onChange={e => setEditData({...editData, sector: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                    ) : (
                      <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.sector || "—"}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Turno de Trabalho</label>
                    {isEditingInfo ? (
                      <input type="text" value={editData.workShift || ""} onChange={e => setEditData({...editData, workShift: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" placeholder="Ex: Matutino" />
                    ) : (
                      <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.workShift || "—"}</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Prioridade</label>
                  {isEditingInfo ? (
                    <select value={editData.priority || ""} onChange={e => setEditData({...editData, priority: e.target.value as any})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium">
                      <option value="">Sem Prioridade</option>
                      <option value="BAIXA">Baixa</option>
                      <option value="MEDIA">Média</option>
                      <option value="ALTA">Alta</option>
                      <option value="URGENTE">Urgente</option>
                    </select>
                  ) : (
                    <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.priority || "Não definida"}</div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Psicólogo Responsável</label>
                  {isEditingInfo ? (
                    <select 
                      value={editData.assignedPsicoId || ""} 
                      onChange={e => {
                        const pid = e.target.value;
                        const pname = psicos.find(p => p.id === pid)?.name;
                        setEditData({...editData, assignedPsicoId: pid, assignedPsicoName: pname});
                      }} 
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium"
                    >
                      <option value="">Não Atribuído</option>
                      {psicos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.assignedPsicoName || "Não Atribuído"}</div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Sala Padrão</label>
                  {isEditingInfo ? (
                    <select value={editData.defaultRoom || ""} onChange={e => setEditData({...editData, defaultRoom: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium">
                      <option value="">Não definida</option>
                      {config.rooms.filter(r => r.isActive).map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.defaultRoom || "Não definida"}</div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Horário Padrão</label>
                  {isEditingInfo ? (
                    <input type="text" value={editData.defaultTime || ""} onChange={e => setEditData({...editData, defaultTime: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" placeholder="Ex: 14:00" />
                  ) : (
                    <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium">{client.defaultTime || "Não definido"}</div>
                  )}
                </div>
              </div>

              {/* Contato Info */}
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Contato</label>
                    <div className="bg-gray-50 px-4 py-3 rounded-xl text-gray-900 font-medium flex justify-between items-center">
                       {client.whatsapp}
                       {client.whatsapp && (
                          <a href={`https://wa.me/55${formatPhone(client.whatsapp)}`} target="_blank" rel="noreferrer" className="text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors">
                              <Phone size={14} /> WhatsApp
                          </a>
                       )}
                    </div>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Vínculo</label>
                    {isEditingInfo ? (
                      <select value={editData.affiliation || ""} onChange={e => setEditData({...editData, affiliation: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium mb-3">
                         {config.affiliations.filter(a => a.isActive).map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    ) : (
                      <div className="bg-gray-50 px-4 py-3 rounded-xl text-gray-900 font-medium mb-3">{client.affiliation}</div>
                    )}
                    
                    {(isEditingInfo ? editData.affiliation : client.affiliation) === "Dependente" && (
                       <div className="space-y-3 bg-gray-50 p-4 border border-gray-200 rounded-xl">
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Qual o Vínculo? (Ex: Filho)</label>
                             {isEditingInfo ? (
                                <input type="text" value={editData.dependencyType || ""} onChange={e => setEditData({...editData, dependencyType: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Ex: Filho" />
                             ) : (
                                <div className="text-sm font-medium text-gray-900">{client.dependencyType || "-"}</div>
                             )}
                          </div>
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">De quem é a filiação (Nome/Matrícula)</label>
                             {isEditingInfo ? (
                                <input type="text" value={editData.dependencySponsor || ""} onChange={e => setEditData({...editData, dependencySponsor: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="João (MAT-123)" />
                             ) : (
                                <div className="text-sm font-medium text-gray-900">{client.dependencySponsor || "-"}</div>
                             )}
                          </div>
                       </div>
                    )}
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Local (Unidade)</label>
                    {isEditingInfo ? (
                      <select value={editData.allocation || ""} onChange={e => setEditData({...editData, allocation: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium">
                         {config.allocations.filter(a => a.isActive).map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    ) : (
                      <div className="bg-gray-50 px-4 py-3 rounded-xl text-gray-900 font-medium">{client.allocation}</div>
                    )}
                 </div>
                 <div className="pt-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-2 tracking-wider uppercase">Tags de Demanda</label>
                    {isEditingInfo ? (
                      <TagInput 
                        value={editData.tags || []} 
                        onChange={newTags => setEditData({...editData, tags: newTags})} 
                        availableTags={config.tags?.filter(t => t.isActive).map(t => t.name) || []}
                        onCreateTag={(tagName) => addConfigItem("tags", tagName)}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {client.tags && client.tags.length > 0 ? (
                          client.tags.map(t => <span key={t} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border border-gray-200">{t}</span>)
                        ) : (
                          <span className="text-sm font-medium text-gray-500">Nenhuma tag cadastrada</span>
                        )}
                      </div>
                    )}
                 </div>
                 <div className="pt-4">
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Contato de Emergência</label>
                    {isEditingInfo ? (
                      <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-red-800 mb-1">Nome</label>
                            <input type="text" value={editData.emergencyContactName || ""} onChange={e => setEditData({...editData, emergencyContactName: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 outline-none text-sm font-medium" placeholder="Nome do contato" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-red-800 mb-1">Parentesco/Vínculo</label>
                            <input type="text" value={editData.emergencyContactRelationship || ""} onChange={e => setEditData({...editData, emergencyContactRelationship: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 outline-none text-sm font-medium" placeholder="Ex: mãe, cônjuge, amigo(a)..." />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-red-800 mb-1">Telefone</label>
                          <input type="text" value={editData.emergencyContactPhone || ""} onChange={e => setEditData({...editData, emergencyContactPhone: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 outline-none text-sm font-medium" placeholder="(11) 99999-9999" />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 px-4 py-3 rounded-xl font-medium text-red-900 border border-red-100 flex justify-between items-center">
                        <div>
                          {client.emergencyContactName} {client.emergencyContactRelationship && `(${client.emergencyContactRelationship})`} • {client.emergencyContactPhone}
                        </div>
                        {client.emergencyContactPhone && (
                           <a href={`https://wa.me/55${formatPhone(client.emergencyContactPhone)}`} target="_blank" rel="noreferrer" className="text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors">
                              <Phone size={14} /> WhatsApp
                           </a>
                        )}
                      </div>
                    )}
                 </div>

                 <div className="pt-4">
                    <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Dados de Admissão (fila de espera)</label>
                    {isEditingInfo ? (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <input type="checkbox" checked={!!editData.whatsappAuthorized} onChange={e => setEditData({...editData, whatsappAuthorized: e.target.checked})} />
                            Autoriza contato via WhatsApp
                          </label>
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <input type="checkbox" checked={!!editData.previouslyAttended} onChange={e => setEditData({...editData, previouslyAttended: e.target.checked})} />
                            Já foi atendido anteriormente
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Cidade e bairro de residência</label>
                          <input type="text" value={editData.residenceCityNeighborhood || ""} onChange={e => setEditData({...editData, residenceCityNeighborhood: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Como acha que o setor pode ajudar</label>
                          <textarea value={editData.helpRequest || ""} onChange={e => setEditData({...editData, helpRequest: e.target.value})} rows={2} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Medicamentos em uso</label>
                          <input type="text" value={editData.medications || ""} onChange={e => setEditData({...editData, medications: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Contato feito por</label>
                            <input type="text" value={editData.contactMadeByName || ""} onChange={e => setEditData({...editData, contactMadeByName: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Seu nome" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Data do contato</label>
                            <input type="date" value={editData.contactDate ? editData.contactDate.split("T")[0] : ""} onChange={e => setEditData({...editData, contactDate: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Observações do contato</label>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {["Não retornou resposta", "Respondeu", "Desistiu", "Desligou-se", "Outro"].map(tag => (
                              <button key={tag} type="button" onClick={() => setEditData({...editData, contactStatus: tag})}
                                className={cn("text-[11px] px-2 py-1 rounded-full font-bold transition-colors", editData.contactStatus === tag ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                                {tag}
                              </button>
                            ))}
                          </div>
                          <textarea value={editData.contactObservations || ""} onChange={e => setEditData({...editData, contactObservations: e.target.value})} rows={2} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" placeholder="Preenchimento livre..." />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 text-sm text-gray-700 space-y-1.5">
                        <p><strong>WhatsApp autorizado:</strong> {client.whatsappAuthorized === true ? "Sim" : client.whatsappAuthorized === false ? "Não" : "—"} <span className="mx-2">•</span> <strong>Já atendido antes:</strong> {client.previouslyAttended === true ? "Sim" : client.previouslyAttended === false ? "Não" : "—"}</p>
                        {client.residenceCityNeighborhood && <p><strong>Cidade/bairro:</strong> {client.residenceCityNeighborhood}</p>}
                        {client.helpRequest && <p><strong>Como o setor pode ajudar:</strong> {client.helpRequest}</p>}
                        {client.medications && <p><strong>Medicamentos:</strong> {client.medications}</p>}
                        {(client.contactMadeByName || client.contactDate) && (
                          <p><strong>Contato feito por:</strong> {client.contactMadeByName || "—"} {client.contactDate && `em ${format(new Date(client.contactDate), "dd/MM/yyyy")}`} {client.contactStatus && `— ${client.contactStatus}`}</p>
                        )}
                        {client.contactObservations && <p><strong>Obs.:</strong> {client.contactObservations}</p>}
                      </div>
                    )}
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* HISTORICO TAB */}
        {activeTab === "HISTORICO" && (
           <div className="space-y-6 animate-in fade-in duration-300">
             <h2 className="text-xl font-bold text-gray-900">Histórico de Fluxo</h2>
             <div className="space-y-4">
               {client.history.map(log => (
                 <div key={log.id} className="flex gap-4">
                   <div className="flex flex-col items-center">
                     <div className="w-3 h-3 bg-blue-400 rounded-full mt-1.5 ring-4 ring-blue-50"></div>
                     <div className="w-0.5 min-h-[40px] bg-gray-100 flex-1 my-1"></div>
                   </div>
                   <div className="pb-4">
                     <p className="text-xs font-bold text-blue-600 mb-0.5">{format(new Date(log.date), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}</p>
                     <p className="text-sm font-bold text-gray-900">{log.action}</p>
                     {log.details && <p className="text-sm text-gray-500 mt-1">{log.details}</p>}
                     <p className="text-xs text-gray-400 mt-2">Por: {log.actorName}</p>
                   </div>
                 </div>
               ))}
               {client.history.length === 0 && <p className="text-gray-500">Nenhum registro encontrado.</p>}
             </div>
           </div>
        )}

        {/* PRONTUARIO TAB */}
        {activeTab === "PRONTUARIO" && (
           <div className="animate-in fade-in duration-300">
             {!canViewProntuario ? (
               <div className="p-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Acesso Restrito</h3>
                 <p className="text-gray-500 max-w-md mx-auto">Você não tem permissão para visualizar o prontuário deste paciente. Apenas o supervisor geral ou o psicólogo responsável têm acesso a estas informações sensíveis.</p>
               </div>
             ) : (
                <ProntuarioView clientId={client.id} />
             )}
           </div>
        )}

        {/* INSTRUMENTOS TAB */}
        {activeTab === "INSTRUMENTOS" && (
           <div className="animate-in fade-in duration-300">
             {!canViewProntuario ? (
               <div className="p-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Acesso Restrito</h3>
               </div>
             ) : (
                <InstrumentosView clientId={client.id} />
             )}
           </div>
        )}

        {activeTab === "DOCUMENTOS" && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button onClick={() => setOpenAnamneseForm({})} className="bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-2xl p-5 text-left transition-colors">
                <ShieldAlert className="text-blue-600 mb-2" size={22} />
                <h4 className="font-bold text-blue-900">Nova Anamnese + Avaliação de Risco</h4>
                <p className="text-xs text-blue-700 mt-1">Formulário unificado de triagem e classificação de risco.</p>
              </button>
              <button onClick={() => setOpenUrgenciaForm({})} className="bg-red-50 hover:bg-red-100 border border-red-100 rounded-2xl p-5 text-left transition-colors">
                <Siren className="text-red-600 mb-2" size={22} />
                <h4 className="font-bold text-red-900">Novo Atendimento de Urgência</h4>
                <p className="text-xs text-red-700 mt-1">Para atendimentos pontuais de crise (não é anamnese nem atendimento contínuo).</p>
              </button>
              <button onClick={() => setOpenAtestado({})} className="bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded-2xl p-5 text-left transition-colors">
                <FileText className="text-amber-600 mb-2" size={22} />
                <h4 className="font-bold text-amber-900">Emissão de Atestado</h4>
                <p className="text-xs text-amber-700 mt-1">Gera o texto-base a partir dos dados do paciente, editável antes de emitir.</p>
              </button>
              <button onClick={handleExportProntuario} className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-2xl p-5 text-left transition-colors">
                <FileDown className="text-emerald-600 mb-2" size={22} />
                <h4 className="font-bold text-emerald-900">Exportar Prontuário (PDF)</h4>
                <p className="text-xs text-emerald-700 mt-1">Compila as evoluções registradas, pronto para assinar.</p>
              </button>
            </div>

            <div>
              <h3 className="font-bold text-gray-800 mb-3">Documentos Gerados</h3>
              {clientDocs.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                  Nenhum documento gerado ainda para este paciente.
                </div>
              ) : (
                <div className="space-y-2">
                  {clientDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {doc.type === "ANAMNESE_RISCO" ? "Anamnese + Avaliação de Risco" : doc.type === "URGENCIA" ? "Atendimento de Urgência" : "Atestado"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(doc.createdAt).toLocaleDateString("pt-BR")} às {new Date(doc.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — por {doc.authorName}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            if (doc.type === "ANAMNESE_RISCO") setOpenAnamneseForm({ id: doc.id, data: doc.data });
                            else if (doc.type === "URGENCIA") setOpenUrgenciaForm({ id: doc.id, data: doc.data });
                            else setOpenAtestado({ id: doc.id });
                          }}
                          className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            const author = users.find(u => u.id === doc.authorId);
                            const docDef = doc.type === "ANAMNESE_RISCO"
                              ? buildAnamneseRiscoDocDefinition(client, doc, author)
                              : doc.type === "URGENCIA"
                              ? buildUrgenciaDocDefinition(client, doc, author)
                              : buildAtestadoDocDefinition(client, doc, author);
                            openPdfInNewTab(docDef);
                          }}
                          className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Ver / Baixar PDF"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {showExportPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 animate-in zoom-in-95 duration-300">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Incluir testes na exportação?</h2>
            <p className="text-sm text-gray-500 mb-4">Este paciente tem {client.instruments?.length} teste(s)/instrumento(s) aplicado(s). Deseja incluí-los no PDF do prontuário?</p>

            {(client.instruments?.length || 0) > 1 && (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {client.instruments!.map(app => {
                  const inst = instruments.find(i => i.id === app.instrumentId);
                  return (
                    <label key={app.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedTestIds.has(app.id)}
                        onChange={e => {
                          const next = new Set(selectedTestIds);
                          if (e.target.checked) next.add(app.id); else next.delete(app.id);
                          setSelectedTestIds(next);
                        }}
                      />
                      {inst?.name || "Instrumento"}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => finalizeExportProntuario(false)} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-2.5 rounded-xl transition-colors text-sm">
                Não incluir
              </button>
              <button onClick={() => finalizeExportProntuario(true)} disabled={selectedTestIds.size === 0} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
                Incluir Selecionados
              </button>
            </div>
          </div>
        </div>
      )}

      {openAtestado && (
        <AtestadoModal
          open
          onClose={() => setOpenAtestado(null)}
          client={client}
          existingDoc={openAtestado.id ? clientDocs.find(d => d.id === openAtestado.id) : undefined}
        />
      )}

      {openAnamneseForm && (
        <ClinicalDocumentForm
          open
          onClose={() => setOpenAnamneseForm(null)}
          title="Anamnese + Avaliação de Risco"
          subtitle={client.fullName}
          sections={ANAMNESE_RISCO_SECTIONS}
          initialData={openAnamneseForm.data}
          onSave={async (data) => {
            if (openAnamneseForm.id) {
              await updateClinicalDocument(openAnamneseForm.id, data);
            } else {
              await addClinicalDocument(client.id, "ANAMNESE_RISCO", data);
            }
          }}
        />
      )}

      {openUrgenciaForm && (
        <ClinicalDocumentForm
          open
          onClose={() => setOpenUrgenciaForm(null)}
          title="Atendimento de Urgência"
          subtitle={client.fullName}
          sections={URGENCIA_SECTIONS}
          initialData={openUrgenciaForm.data}
          onSave={async (data) => {
            if (openUrgenciaForm.id) {
              await updateClinicalDocument(openUrgenciaForm.id, data);
            } else {
              await addClinicalDocument(client.id, "URGENCIA", data);
            }
          }}
        />
      )}
    </div>
  );
}

function InstrumentosView({ clientId }: { clientId: string }) {
  const { clients, instruments, applyInstrument, addInstrumentApplicationEntry, updateInstrumentApplication, currentUser, users } = useStore();
  const client = clients.find(c => c.id === clientId);

  const [showApply, setShowApply] = useState(false);
  const [selectedInstId, setSelectedInstId] = useState("");
  const [purposeText, setPurposeText] = useState("");
  const [applyDate, setApplyDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [firstDescription, setFirstDescription] = useState("");

  const [addingEntryFor, setAddingEntryFor] = useState<string | null>(null);
  const [newEntryDate, setNewEntryDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newEntryDescription, setNewEntryDescription] = useState("");

  const [editingEntry, setEditingEntry] = useState<{ appId: string; entryId: string } | null>(null);
  const [editEntryText, setEditEntryText] = useState("");

  if (!client) return null;

  const validInstruments = instruments.filter(i => i.sheetCount > 0);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstId || !applyDate) return;
    applyInstrument(clientId, selectedInstId, purposeText, applyDate, firstDescription);
    setShowApply(false);
    setSelectedInstId("");
    setPurposeText("");
    setFirstDescription("");
    setApplyDate(new Date().toISOString().split("T")[0]);
  };

  const handleAddEntry = (applicationId: string) => {
    if (!newEntryDate) return;
    addInstrumentApplicationEntry(applicationId, newEntryDate, newEntryDescription);
    setAddingEntryFor(null);
    setNewEntryDate(new Date().toISOString().split("T")[0]);
    setNewEntryDescription("");
  };

  const handleSaveEntryEdit = () => {
    if (!editingEntry) return;
    updateInstrumentApplication(editingEntry.appId, { entry: { id: editingEntry.entryId, description: editEntryText } });
    setEditingEntry(null);
    setEditEntryText("");
  };

  const clientInstruments = [...(client.instruments || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-8">
       <div className="flex items-center justify-between">
         <div>
            <h2 className="text-xl font-bold text-gray-900">Testes e Instrumentos</h2>
            <p className="text-sm text-gray-500">Histórico de avaliação psicológica.</p>
         </div>
         <button onClick={() => setShowApply(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
           <PlusIcon size={16} /> Aplicar Instrumento
         </button>
       </div>

       {showApply && (
          <form onSubmit={handleApply} className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl animate-in zoom-in-95 duration-200">
             <div className="text-blue-800 font-bold mb-4">Registro de Aplicação</div>
             <div className="space-y-4">
                <div>
                   <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">Instrumento / Teste</label>
                   {validInstruments.length === 0 ? (
                      <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium">Não há instrumentos com saldo disponível no inventário para serem aplicados. Peça ao supervisor para adicionar estoque no Inventário de Testes.</p>
                   ) : (
                      <select required value={selectedInstId} onChange={e => setSelectedInstId(e.target.value)} className="w-full bg-white border border-blue-200 focus:border-blue-500 rounded-xl px-4 py-3 outline-none font-medium text-gray-900">
                         <option value="">Selecione o instrumento...</option>
                         {validInstruments.map(i => (
                            <option key={i.id} value={i.id}>{i.name} (Estoque: {i.sheetCount})</option>
                         ))}
                      </select>
                   )}
                </div>
                {selectedInstId && (
                   <>
                     <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">Data da Aplicação</label>
                        <input type="date" required value={applyDate} onChange={e => setApplyDate(e.target.value)} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 outline-none font-medium text-gray-900" />
                        <p className="text-[11px] text-blue-700 mt-1">Pode ser retroativa — não precisa ser a data de hoje.</p>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">Finalidade da Aplicação</label>
                        <input type="text" value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 outline-none font-medium text-gray-900" placeholder="Ex: Triagem inicial, acompanhamento de tratamento, avaliação de retorno..." />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">Síntese dos Resultados e Interpretação (Opcional)</label>
                        <textarea
                           value={firstDescription}
                           onChange={e => setFirstDescription(e.target.value)}
                           className="w-full bg-white border border-blue-200 rounded-2xl p-4 min-h-[120px] outline-none focus:ring-2 focus:ring-blue-500 resize-y font-medium text-gray-700"
                           placeholder="Descreva brevemente os escores, percentis ou interpretação clínica gerada por este instrumento nesta data..."
                        />
                        <p className="text-[11px] text-blue-700 mt-1">Se o mesmo teste for aplicado em outros dias, você poderá adicionar mais datas/descrições depois, sem consumir outra unidade do estoque.</p>
                     </div>
                   </>
                )}
             </div>
             
             <div className="flex items-center justify-end gap-3 mt-6">
                <button type="button" onClick={() => { setShowApply(false); setSelectedInstId(""); setPurposeText(""); setFirstDescription(""); }} className="px-5 py-2.5 text-blue-700 font-bold hover:bg-blue-100 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={!selectedInstId} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">Salvar e Consumir do Estoque</button>
             </div>
          </form>
       )}

       {clientInstruments.length === 0 && !showApply ? (
         <div className="text-center py-10 bg-gray-50 border border-gray-100 border-dashed rounded-3xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum teste aplicado</h3>
            <p className="text-gray-500 font-medium">O histórico de testagem deste paciente está vazio.</p>
         </div>
       ) : (
          <div className="space-y-4">
             {clientInstruments.map(app => {
                const inst = instruments.find(i => i.id === app.instrumentId);
                const psicoName = users.find(u => u.id === app.psychoId)?.name || "Desconhecido";
                const canEditThis = app.psychoId === currentUser?.id;

                return (
                   <div key={app.id} className="bg-white border border-gray-200 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center shrink-0">
                               <FileText size={20} />
                            </div>
                            <div className="flex flex-col">
                               <h4 className="font-bold text-gray-900 text-lg leading-tight">{inst?.name || "Instrumento Removido"}</h4>
                               <p className="text-xs text-gray-400 font-bold mt-0.5 uppercase tracking-wider">Aplicado por {psicoName}</p>
                            </div>
                         </div>
                         {canEditThis && addingEntryFor !== app.id && (
                            <button onClick={() => { setAddingEntryFor(app.id); setNewEntryDate(new Date().toISOString().split("T")[0]); setNewEntryDescription(""); }} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                               <PlusIcon size={14} /> Nova Data
                            </button>
                         )}
                      </div>

                      {app.purpose && (
                        <p className="text-xs text-gray-500 mb-4"><strong className="text-gray-700">Finalidade:</strong> {app.purpose}</p>
                      )}

                      <div className="space-y-3">
                        {app.entries.map(entry => {
                           const isEditingThis = editingEntry?.appId === app.id && editingEntry?.entryId === entry.id;
                           return (
                              <div key={entry.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                 <div className="flex items-center justify-between mb-2">
                                    <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">{format(new Date(entry.date), "dd/MM/yyyy")}</span>
                                    {canEditThis && !isEditingThis && (
                                       <button onClick={() => { setEditingEntry({ appId: app.id, entryId: entry.id }); setEditEntryText(entry.description || ""); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Editar">
                                          <Edit2 size={14} />
                                       </button>
                                    )}
                                 </div>
                                 {isEditingThis ? (
                                    <div className="space-y-2">
                                       <textarea autoFocus value={editEntryText} onChange={e => setEditEntryText(e.target.value)} className="w-full bg-white border border-gray-300 rounded-xl p-3 min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500 resize-y font-medium text-gray-700 text-sm" />
                                       <div className="flex justify-end gap-2">
                                          <button onClick={() => setEditingEntry(null)} className="px-3 py-1.5 text-xs text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                          <button onClick={handleSaveEntryEdit} className="bg-blue-600 text-white px-4 py-1.5 text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">Salvar</button>
                                       </div>
                                    </div>
                                 ) : (
                                    entry.description ? (
                                       <p className="text-gray-700 font-medium text-sm whitespace-pre-wrap">{entry.description}</p>
                                    ) : (
                                       <p className="text-gray-400 text-sm italic">Nenhum resultado textual inserido para esta data.</p>
                                    )
                                 )}
                              </div>
                           );
                        })}
                      </div>

                      {addingEntryFor === app.id && (
                         <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                            <div>
                               <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1">Data desta nova aplicação</label>
                               <input type="date" value={newEntryDate} onChange={e => setNewEntryDate(e.target.value)} className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 outline-none font-medium text-sm" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1">Descrição / Resultados</label>
                               <textarea value={newEntryDescription} onChange={e => setNewEntryDescription(e.target.value)} className="w-full bg-white border border-emerald-200 rounded-xl p-3 min-h-[80px] outline-none font-medium text-sm resize-y" />
                            </div>
                            <p className="text-[11px] text-emerald-700">Isso não consome outra unidade do estoque — é o mesmo teste, em mais um dia.</p>
                            <div className="flex justify-end gap-2">
                               <button onClick={() => setAddingEntryFor(null)} className="px-4 py-2 text-xs text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                               <button onClick={() => handleAddEntry(app.id)} className="bg-emerald-600 text-white px-5 py-2 text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">Adicionar Data</button>
                            </div>
                         </div>
                      )}
                   </div>
                );
             })}
          </div>
       )}
    </div>
  );
}

function ProntuarioView({ clientId }: { clientId: string }) {
   const { sessions, addSession, updateSession, updatePrivateSessionNotes, currentUser, groups } = useStore();
   const [writingSessionId, setWritingSessionId] = useState<string | null>(null);
   const [isWritingNew, setIsWritingNew] = useState(false);
   const [notes, setNotes] = useState("");
   const [privateNotesDraft, setPrivateNotesDraft] = useState("");
   const [attendance, setAttendance] = useState<"PRESENTE" | "FALTA_JUSTIFICADA" | "FALTA_NAO_JUSTIFICADA">("PRESENTE");
   
   const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
   const [editNotes, setEditNotes] = useState("");

   const [editingPrivateId, setEditingPrivateId] = useState<string | null>(null);
   const [editPrivateNotes, setEditPrivateNotes] = useState("");

   const [viewingVersionsId, setViewingVersionsId] = useState<string | null>(null);

   const clientSessions = sessions.filter(s => s.clientId === clientId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

   const handleSave = () => {
     if(!notes.trim()) return;
     addSession({
       id: writingSessionId || undefined,
       clientId,
       psicoId: currentUser!.id,
       date: writingSessionId ? sessions.find(s => s.id === writingSessionId)!.date : new Date().toISOString(),
       notes,
       privateNotes: privateNotesDraft,
       isDraft: false,
       attendance
     } as any);
     setIsWritingNew(false);
     setWritingSessionId(null);
     setNotes("");
     setPrivateNotesDraft("");
     setAttendance("PRESENTE");
   };

   const handleEditDraft = (s: any) => {
      setWritingSessionId(s.id);
      setIsWritingNew(false);
      setNotes(s.notes || "");
      setPrivateNotesDraft(s.privateNotes || "");
      setAttendance("PRESENTE");
   };

   const handleAttendanceChange = (val: "PRESENTE" | "FALTA_JUSTIFICADA" | "FALTA_NAO_JUSTIFICADA") => {
      setAttendance(val);
      if (val !== "PRESENTE" && !notes.trim()) {
         setNotes("Paciente não compareceu à sessão.");
      }
   };

   const isWritingAny = isWritingNew || writingSessionId !== null;

   const handleInlineSave = (id: string) => {
     updateSession(id, editNotes);
     setEditingRecordId(null);
     setEditNotes("");
   };

   const handleSavePrivateNotes = (id: string) => {
     updatePrivateSessionNotes(id, editPrivateNotes);
     setEditingPrivateId(null);
     setEditPrivateNotes("");
   };


   return (
     <div className="space-y-8">
       <div className="flex items-center justify-between">
         <h2 className="text-xl font-bold text-gray-900">Evolução de Sessões</h2>
         {!isWritingAny && (
           <button onClick={() => setIsWritingNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
             <PlusIcon size={16} /> Nova Sessão Avulsa
           </button>
         )}
       </div>

       {isWritingAny && (
         <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl animate-in zoom-in-95 duration-200">
           <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
               <div className="text-blue-800 font-bold">
                  {isWritingNew ? "Registrando Nova Sessão" : "Preenchendo Prontuário Pendente"}
               </div>
               <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-blue-100 shadow-sm">
                  {(["PRESENTE", "FALTA_JUSTIFICADA", "FALTA_NAO_JUSTIFICADA"] as const).map(att => (
                     <button
                        key={att}
                        onClick={() => handleAttendanceChange(att)}
                        className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", attendance === att ? "bg-blue-100 text-blue-800 shadow-sm" : "text-gray-500 hover:bg-gray-50")}
                     >
                        {att === "PRESENTE" ? "Compareceu" : att === "FALTA_JUSTIFICADA" ? "Falta Justificada" : "Falta Injustificada"}
                     </button>
                  ))}
               </div>
           </div>
           <textarea 
             autoFocus
             value={notes}
             onChange={e => setNotes(e.target.value)}
             className="w-full bg-white border border-blue-100 rounded-2xl p-4 min-h-[200px] outline-none focus:ring-2 focus:ring-blue-500 resize-y mb-4 font-medium text-gray-700"
             placeholder="Escreva os apontamentos e evolução clínica da sessão..."
           />
           <div className="mb-4">
             <label className="flex items-center gap-2 text-xs font-bold text-amber-700 uppercase tracking-wide mb-1.5">
               <Lock size={12} /> Anotação Privada (só você vê — rascunho antes de formalizar o prontuário conforme o CFP)
             </label>
             <textarea
               value={privateNotesDraft}
               onChange={e => setPrivateNotesDraft(e.target.value)}
               className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 min-h-[100px] outline-none focus:ring-2 focus:ring-amber-400 resize-y font-medium text-gray-700 text-sm"
               placeholder="Impressões clínicas pessoais, hipóteses, lembretes... isso nunca aparece para outras pessoas, nem Supervisor ou Administrativo."
             />
           </div>
           <div className="flex items-center justify-end gap-3">
             <button onClick={() => { setIsWritingNew(false); setWritingSessionId(null); setNotes(""); setPrivateNotesDraft(""); setAttendance("PRESENTE"); }} className="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
             <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors">Salvar Registro</button>
           </div>
         </div>
       )}

       <div className="space-y-6">
         {clientSessions.map((s, i) => {
           const group = s.groupId ? groups.find(g => g.id === s.groupId) : null;
           const isEditingThis = editingRecordId === s.id;

           return (
             <div key={s.id} className={cn("p-6 rounded-3xl border", s.isDraft ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100")}>
               <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 border-dashed">
                 <div className="flex items-center gap-3 flex-wrap">
                   <h4 className={cn("font-bold", s.isDraft ? "text-amber-900" : "text-gray-900")}>
                      Sessão {clientSessions.length - i}
                   </h4>
                   {group && <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-md">Grupo: {group.name}</span>}
                   {s.attendance && s.attendance !== "PRESENTE" && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-md">{s.attendance === "FALTA_JUSTIFICADA" ? "Falta Justificada" : "Falta Injustificada"}</span>}
                   {s.isDraft && <span className="bg-amber-200 text-amber-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md">Pendente</span>}
                 </div>
                 <div className="flex items-center gap-2">
                    <p className={cn("text-sm font-bold", s.isDraft ? "text-amber-600/60" : "text-gray-500")}>
                       {format(new Date(s.date), "dd/MM/yyyy HH:mm")}
                    </p>
                    {(!s.isDraft && s.psicoId === currentUser?.id && !isEditingThis) && (
                       <button onClick={() => { setEditingRecordId(s.id); setEditNotes(s.notes); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Editar Prontuário">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                       </button>
                    )}
                 </div>
               </div>
               
               {s.isDraft ? (
                  <div className="flex justify-between items-center">
                     <p className="text-amber-700/60 text-sm italic">Sessão agendada. Aguardando preenchimento do prontuário após a realização.</p>
                     {!isWritingAny && (
                        <button onClick={() => handleEditDraft(s)} className="text-amber-700 bg-amber-100/50 hover:bg-amber-100 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                          Preencher Agora
                        </button>
                     )}
                  </div>
               ) : (
                  <>
                     {isEditingThis ? (
                        <div className="space-y-4">
                           <textarea 
                              autoFocus
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              className="w-full bg-white border border-gray-300 rounded-xl p-4 min-h-[150px] outline-none focus:ring-2 focus:ring-blue-500 resize-y font-medium text-gray-700"
                           />
                           <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                              <button onClick={() => setEditingRecordId(null)} className="px-4 py-2 text-sm text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                              <button onClick={() => handleInlineSave(s.id)} className="bg-blue-600 text-white px-5 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors">Salvar Edição</button>
                           </div>
                        </div>
                     ) : (
                        <div className="text-gray-700 whitespace-pre-wrap">{s.notes}</div>
                     )}

                     {!isEditingThis && s.psicoId === currentUser?.id && (
                        <div className="mt-4 pt-4 border-t border-amber-200 border-dashed">
                           <div className="flex items-center justify-between mb-2">
                              <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 uppercase tracking-wide">
                                 <Lock size={12} /> Anotação Privada (só você vê)
                              </span>
                              {editingPrivateId !== s.id && (
                                 <button onClick={() => { setEditingPrivateId(s.id); setEditPrivateNotes(s.privateNotes || ""); }} className="text-xs text-amber-700 hover:bg-amber-100 px-2 py-1 rounded-lg font-bold transition-colors">
                                    {s.privateNotes ? "Editar" : "Adicionar"}
                                 </button>
                              )}
                           </div>
                           {editingPrivateId === s.id ? (
                              <div className="space-y-2">
                                 <textarea
                                    autoFocus
                                    value={editPrivateNotes}
                                    onChange={e => setEditPrivateNotes(e.target.value)}
                                    className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 min-h-[100px] outline-none focus:ring-2 focus:ring-amber-400 resize-y font-medium text-gray-700 text-sm"
                                 />
                                 <div className="flex justify-end gap-2">
                                    <button onClick={() => setEditingPrivateId(null)} className="px-3 py-1.5 text-xs text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                                    <button onClick={() => handleSavePrivateNotes(s.id)} className="bg-amber-600 text-white px-4 py-1.5 text-xs font-bold rounded-lg hover:bg-amber-700 transition-colors">Salvar</button>
                                 </div>
                              </div>
                           ) : (
                              s.privateNotes ? (
                                 <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-xl p-3 whitespace-pre-wrap">{s.privateNotes}</p>
                              ) : (
                                 <p className="text-xs text-gray-400 italic">Nenhuma anotação privada para esta sessão.</p>
                              )
                           )}
                        </div>
                     )}
                     
                     {!isEditingThis && s.updatedAt && s.updatedAt !== s.createdAt && (
                        <div className="mt-4 pt-4 border-t border-gray-200 border-dashed flex items-center justify-between text-xs text-gray-400 font-medium">
                           <span>Editado em: {format(new Date(s.updatedAt), "dd/MM/yyyy HH:mm")}</span>
                           {s.versions && s.versions.length > 0 && (
                              <button onClick={() => setViewingVersionsId(s.id)} className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                 Ver Histórico ({s.versions.length})
                              </button>
                           )}
                        </div>
                     )}
                  </>
               )}
             </div>
           );
         })}
         {clientSessions.length === 0 && !isWritingAny && (
           <p className="text-gray-500 text-center py-10">Nenhum registro de sessão encontrado para este paciente.</p>
         )}
       </div>

       {/* VERSIONS MODAL */}
       {viewViewingVersionsModal(viewingVersionsId, sessions, () => setViewingVersionsId(null))}

     </div>
   );
}

function viewViewingVersionsModal(recordId: string | null, sessions: any[], onClose: () => void) {
   if (!recordId) return null;
   const session = sessions.find(s => s.id === recordId);
   if (!session || !session.versions) return null;

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
         <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
               <h3 className="font-bold text-gray-900 text-lg">Histórico de Alterações</h3>
               <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                 <X size={20} />
               </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50">
               <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative">
                  <span className="absolute top-0 right-4 -translate-y-1/2 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Versão Atual</span>
                  <p className="text-gray-700 whitespace-pre-wrap text-sm">{session.notes}</p>
               </div>
               
               {session.versions.slice().reverse().map((v: any, i: number) => (
                  <div key={v.id} className="bg-gray-100 p-5 rounded-2xl border border-gray-200 relative">
                     <span className="absolute top-0 right-4 -translate-y-1/2 bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Versão de {format(new Date(v.savedAt), "dd/MM/yyyy HH:mm")}</span>
                     <p className="text-gray-500 whitespace-pre-wrap text-sm line-through decoration-gray-300">{v.oldContent}</p>
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}

function PlusIcon({size}: {size: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
}
