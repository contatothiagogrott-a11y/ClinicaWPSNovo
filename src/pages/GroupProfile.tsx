import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { ChevronLeft, Edit2, Users, FileText, Save, UserPlus, X, Calendar } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function GroupProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { groups, users, clients, currentUser, updateGroup, groupRecords, addGroupRecord, updateClient } = useStore();
  
  const group = groups.find(g => g.id === id);
  const [activeTab, setActiveTab] = useState<"INFO" | "MEMBROS" | "PRONTUARIO">("INFO");
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editData, setEditData] = useState(group);

  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedClientToAdd, setSelectedClientToAdd] = useState("");

  const [isWritingRecord, setIsWritingRecord] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordContent, setRecordContent] = useState("");
  const [recordDate, setRecordDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, string>>({});

  if (!group || !editData) return <div className="p-8 text-center">Grupo não encontrado.</div>;

  const psicos = users.filter(u => u.role === "PSICO");
  const psychologist = users.find(u => u.id === group.psychologistId);

  const handleSaveInfo = () => {
    updateGroup(group.id, editData);
    setIsEditingInfo(false);
  };

  const handleAddMember = () => {
     if (!selectedClientToAdd) return;
     if (!group.memberIds.includes(selectedClientToAdd)) {
        updateGroup(group.id, { memberIds: [...group.memberIds, selectedClientToAdd] });
        updateClient(selectedClientToAdd, { status: "EM_ATENDIMENTO" }, `Inserido no grupo: ${group.name} e movido para Em Atendimento por ${currentUser?.name}`);
     }
     setSelectedClientToAdd("");
     setShowAddMember(false);
  };

  const handleRemoveMember = (clientId: string) => {
     updateGroup(group.id, { memberIds: group.memberIds.filter(mid => mid !== clientId) });
  };

  const handleSaveRecord = () => {
     if (!recordContent.trim() || !recordDate) return;
     addGroupRecord({
        id: editingRecordId || undefined,
        content: recordContent,
        sessionDate: recordDate,
        groupId: group.id,
        authorId: currentUser!.id,
        attendance: group.memberIds.map(clientId => ({ clientId, status: (attendanceDraft[clientId] || "PENDENTE") as any })),
     });
     setRecordContent("");
     setEditingRecordId(null);
     setIsWritingRecord(false);
     setAttendanceDraft({});
  };

  const openNewRecord = () => {
     setRecordDate(format(new Date(), "yyyy-MM-dd"));
     setRecordContent("");
     setEditingRecordId(null);
     setAttendanceDraft({});
     setIsWritingRecord(true);
  };

  const openExistingRecord = (rec: typeof groupRecords[number]) => {
     setRecordDate(rec.sessionDate);
     setRecordContent(rec.content || "");
     setEditingRecordId(rec.id);
     const draft: Record<string, string> = {};
     (rec.attendance || []).forEach(a => { draft[a.clientId] = a.status; });
     setAttendanceDraft(draft);
     setIsWritingRecord(true);
  };

  // Eligibile clients: Not already in group
  const eligibleClients = clients.filter(c => !group.memberIds.includes(c.id) && c.status !== "FINALIZADO");
  const groupMembers = clients.filter(c => group.memberIds.includes(c.id));
  const groupRecs = groupRecords.filter(r => r.groupId === group.id).sort((a,b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());

  const canManageGroup = currentUser?.role === "SUPERVISOR" || currentUser?.role === "ADMIN" || currentUser?.id === group.psychologistId;
  const canViewProntuario = currentUser?.role === "SUPERVISOR" || currentUser?.id === group.psychologistId; // prontuário de grupo é conteúdo clínico restrito

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-3 bg-white hover:bg-gray-50 rounded-full shadow-sm text-gray-500 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{group.name}</h1>
          <p className="text-gray-500">Resp: {psychologist?.name || "Desconhecido"}</p>
        </div>
      </header>

      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-full overflow-x-auto sm:w-max mx-auto sm:mx-0">
        <button onClick={() => setActiveTab("INFO")} className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "INFO" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          <FileText size={18} /> Informações
        </button>
        <button onClick={() => setActiveTab("MEMBROS")} className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "MEMBROS" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          <Users size={18} /> Membros ({group.memberIds.length})
        </button>
        <button onClick={() => setActiveTab("PRONTUARIO")} className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all", activeTab === "PRONTUARIO" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          <Calendar size={18} /> Prontuário Coletivo
        </button>
      </div>

      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 sm:p-8">
        
        {activeTab === "INFO" && (
          <div className="space-y-6">
             <div className="flex items-center justify-between">
               <h2 className="text-xl font-bold text-gray-900">Configurações do Grupo</h2>
               {!isEditingInfo && canManageGroup && (
                 <button onClick={() => setIsEditingInfo(true)} className="text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"><Edit2 size={16} /> Editar</button>
               )}
               {isEditingInfo && (
                 <button onClick={handleSaveInfo} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"><Save size={16} /> Salvar</button>
               )}
             </div>

             <div className="space-y-4 bg-gray-50 p-6 rounded-3xl">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Nome do Grupo</label>
                  {isEditingInfo ? (
                    <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900">{group.name}</div>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Psicólogo Responsável</label>
                  {isEditingInfo ? (
                    <select value={editData.psychologistId} onChange={e => setEditData({...editData, psychologistId: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium">
                      {psicos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900">{psychologist?.name}</div>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Objetivo</label>
                  {isEditingInfo ? (
                    <textarea value={editData.objective} onChange={e => setEditData({...editData, objective: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium min-h-[100px]" />
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900 whitespace-pre-wrap">{group.objective}</div>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Referencial Teórico/Metodológico</label>
                  {isEditingInfo ? (
                    <input value={editData.methodology || ""} onChange={e => setEditData({...editData, methodology: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900 whitespace-pre-wrap">{group.methodology || "-"}</div>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Frequência e Duração Prevista</label>
                  {isEditingInfo ? (
                    <input value={editData.frequency || ""} onChange={e => setEditData({...editData, frequency: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium" />
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900 whitespace-pre-wrap">{group.frequency || "-"}</div>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Critérios de Inclusão/Exclusão</label>
                  {isEditingInfo ? (
                    <textarea value={editData.criteria || ""} onChange={e => setEditData({...editData, criteria: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium min-h-[100px]" />
                  ) : <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 font-medium text-gray-900 whitespace-pre-wrap">{group.criteria || "-"}</div>}
                </div>
             </div>
          </div>
        )}

        {activeTab === "MEMBROS" && (
           <div className="space-y-6">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-gray-900">Membros do Grupo</h2>
                 {canManageGroup && !showAddMember && (
                    <button onClick={() => setShowAddMember(true)} className="bg-white border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
                       <UserPlus size={16} /> Adicionar Paciente
                    </button>
                 )}
              </div>

              {showAddMember && (
                 <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl animate-in zoom-in-95 duration-200 flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                       <label className="block text-xs font-semibold text-blue-800 mb-1 tracking-wider uppercase">Selecionar Paciente</label>
                       <select value={selectedClientToAdd} onChange={e => setSelectedClientToAdd(e.target.value)} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 outline-none font-medium">
                          <option value="">Selecione...</option>
                          {eligibleClients.map(c => <option key={c.id} value={c.id}>{c.fullName} ({c.status})</option>)}
                       </select>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                       <button onClick={handleAddMember} disabled={!selectedClientToAdd} className="flex-1 sm:flex-none justify-center bg-blue-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold transition-colors">Adicionar</button>
                       <button onClick={() => {setShowAddMember(false); setSelectedClientToAdd("");}} className="p-3 text-gray-500 hover:bg-blue-100 rounded-xl"><X size={20}/></button>
                    </div>
                 </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {groupMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                       <div className="flex items-center gap-3" onClick={() => navigate(`/client/${member.id}`)}>
                          <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-bold cursor-pointer">{member.fullName.charAt(0)}</div>
                          <div className="cursor-pointer">
                             <p className="font-bold text-gray-900 group-hover:text-blue-600">{member.fullName}</p>
                             <p className="text-xs text-gray-500">{member.status}</p>
                          </div>
                       </div>
                       {canManageGroup && (
                          <button onClick={() => handleRemoveMember(member.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                             <X size={18} />
                          </button>
                       )}
                    </div>
                 ))}
                 {groupMembers.length === 0 && <p className="text-gray-500 col-span-full text-center py-6">Este grupo não tem membros.</p>}
              </div>
           </div>
        )}

        {activeTab === "PRONTUARIO" && (
           !canViewProntuario ? (
             <div className="p-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
               <h3 className="text-lg font-bold text-gray-900 mb-2">Acesso Restrito</h3>
               <p className="text-gray-500 text-sm">O prontuário de grupo é conteúdo clínico e só pode ser acessado pelo psicólogo responsável pelo grupo ou pelo Supervisor.</p>
             </div>
           ) : (
           <div className="space-y-6">
              <div className="flex items-center justify-between">
                 <div>
                   <h2 className="text-xl font-bold text-gray-900">Registros do Grupo</h2>
                   <p className="text-sm text-gray-500">Apontamentos gerais de cada sessão coletiva.</p>
                 </div>
                 {canViewProntuario && !isWritingRecord && (
                   <button onClick={openNewRecord} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-colors">Registrar Sessão</button>
                 )}
              </div>

              {isWritingRecord && (
                 <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl animate-in zoom-in-95 duration-200">
                    <p className="font-bold text-blue-800 mb-4 flex items-center gap-2"><FileText size={18}/> Novo Prontuário Coletivo</p>
                    <div className="space-y-4">
                       <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1 tracking-wider uppercase">Data da Sessão</label>
                          <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} className="bg-white border border-blue-200 rounded-xl px-4 py-2 outline-none font-medium" />
                       </div>
                       <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1 tracking-wider uppercase">Descrição da Dinâmica</label>
                          <textarea autoFocus value={recordContent} onChange={e => setRecordContent(e.target.value)} className="w-full bg-white border border-blue-200 rounded-xl p-4 min-h-[150px] outline-none font-medium text-gray-700" placeholder="Como foi a sessão coletiva? Quais temas foram abordados?"></textarea>
                       </div>
                       <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-2 tracking-wider uppercase">Presença dos Membros</label>
                          <div className="space-y-2">
                            {groupMembers.map(member => (
                              <div key={member.id} className="flex items-center justify-between bg-white border border-blue-100 rounded-xl px-4 py-2.5">
                                <span className="font-medium text-gray-800 text-sm">{member.fullName}</span>
                                <div className="flex gap-1.5">
                                  {[
                                    { v: "COMPARECEU", l: "Compareceu" },
                                    { v: "FALTA_JUSTIFICADA", l: "Falta Just." },
                                    { v: "FALTA_INJUSTIFICADA", l: "Falta Injust." },
                                  ].map(opt => (
                                    <button key={opt.v} type="button" onClick={() => setAttendanceDraft({...attendanceDraft, [member.id]: opt.v})}
                                      className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors", attendanceDraft[member.id] === opt.v ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100")}>
                                      {opt.l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                       </div>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                       <p className="text-xs text-blue-700 font-medium">✨ Serão gerados registros pendentes individuais para os {group.memberIds.length} membros.</p>
                       <div className="flex gap-2">
                          <button onClick={() => setIsWritingRecord(false)} className="px-5 py-2 text-gray-500 font-bold hover:bg-blue-100 rounded-xl transition-colors">Cancelar</button>
                          <button onClick={handleSaveRecord} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-bold transition-colors">Salvar Prontuário</button>
                       </div>
                    </div>
                 </div>
              )}

              <div className="space-y-4">
                 {groupRecs.map(rec => {
                    const author = users.find(u => u.id === rec.authorId);
                    return (
                       <div key={rec.id} className={cn("p-5 rounded-3xl border", rec.isDraft ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100")}>
                          <div className="flex justify-between items-start mb-3 border-b border-gray-200 pb-3 border-dashed">
                             <div>
                               <p className="font-bold text-gray-900">{format(new Date(rec.sessionDate + 'T12:00:00'), "dd 'de' MMMM, yyyy", { locale: ptBR })}</p>
                               <p className="text-xs text-gray-500">Registrado por: {author?.name || "Desconhecido"}</p>
                             </div>
                             {rec.isDraft && <span className="bg-amber-200 text-amber-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md">Pendente</span>}
                          </div>
                          {rec.isDraft ? (
                             <div className="flex justify-between items-center">
                                <p className="text-amber-700/60 text-sm italic">Prontuário agendado. Aguardando preenchimento após a sessão.</p>
                                {!isWritingRecord && (
                                   <button onClick={() => openExistingRecord(rec)} className="text-amber-700 bg-amber-100/50 hover:bg-amber-100 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                                     Preencher Agora
                                   </button>
                                )}
                             </div>
                          ) : (
                             <div className="space-y-3">
                               <p className="text-gray-700 whitespace-pre-wrap">{rec.content}</p>
                               {(rec.attendance && rec.attendance.length > 0) && (
                                 <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200 border-dashed">
                                   {rec.attendance.map(a => {
                                      const m = clients.find(c => c.id === a.clientId);
                                      const color = a.status === "COMPARECEU" ? "bg-emerald-100 text-emerald-700" : a.status === "FALTA_JUSTIFICADA" ? "bg-amber-100 text-amber-700" : a.status === "FALTA_INJUSTIFICADA" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500";
                                      return <span key={a.clientId} className={cn("text-[11px] px-2 py-0.5 rounded-full font-bold", color)}>{m?.fullName || "?"}</span>;
                                   })}
                                 </div>
                               )}
                               {canViewProntuario && !isWritingRecord && (
                                 <button onClick={() => openExistingRecord(rec)} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Editar</button>
                               )}
                             </div>
                          )}
                       </div>
                    )
                 })}
                 {groupRecs.length === 0 && !isWritingRecord && <p className="text-center text-gray-500 py-8">Nenhum prontuário coletivo registrado.</p>}
              </div>
           </div>
           )
        )}

      </div>
    </div>
  );
}
