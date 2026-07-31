import { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Users, Trash2, KeyRound, Edit2, X, Check } from "lucide-react";
import { User, Role } from "../types";
import { cn } from "../lib/utils";
import { requiresCrp, roleLabel } from "../lib/roles";

// Paleta de cores distintas para sugerir automaticamente a cada novo usuário
// (evita que todo mundo fique com a mesma cor padrão na agenda até alguém
// lembrar de trocar manualmente).
const COLOR_PALETTE = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ec4899", "#eab308", "#14b8a6", "#ef4444", "#6366f1", "#84cc16"];

export default function UsersManagement() {
  const { currentUser, users, deleteUser, addUser, updateUser, resetUserPassword } = useStore();

  /**
   * Senha provisória gerada pelo SERVIDOR e exibida uma única vez.
   * Ninguém digita a senha de outra pessoa: isso destruiria o não-repúdio da
   * assinatura do prontuário (não haveria como sustentar quem escreveu o quê).
   */
  const [temporaryCredential, setTemporaryCredential] = useState<{ name: string; password: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");

  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
     name: string;
     email: string;
     role: Role;
     title: string;
     institutionalLink: string;
     birthDate: string;
     matricula: string;
     crp: string;
     color: string;
  }>({
     name: "", email: "", role: "PSICO", title: "", institutionalLink: "", birthDate: "", matricula: "", crp: "", color: "#3b82f6"
  });

  if (currentUser?.role !== "SUPERVISOR") {
    return <div className="p-8 text-center font-bold text-red-600">Acesso negado.</div>;
  }

  const handleResetPassword = async (user: User) => {
    setActionError("");
    try {
      const password = await resetUserPassword(user.id);
      setTemporaryCredential({ name: user.name, password });
    } catch (err: any) {
      setActionError(err?.message || "Não foi possível redefinir a senha.");
    }
  };

  const handleDeleteUser = async (user: User) => {
    setActionError("");
    try {
      await deleteUser(user.id);
    } catch (err: any) {
      // Ex.: profissional ainda responsável por pacientes (bloqueado na API).
      setActionError(err?.message || "Não foi possível remover o usuário.");
    }
  };

  const handleCreateOrUpdateUser = async () => {
     setFormError("");
     if (formData.name && formData.email) {
        // CRP obrigatório para Psicólogo E Supervisor: o Supervisor passou a
        // atender e a assinar documentos, e todo documento psicológico exige
        // nome e CRP do profissional (Resolução CFP nº 06/2019).
        if (requiresCrp(formData.role) && !formData.crp.trim()) {
           setFormError(`CRP é obrigatório para o perfil ${roleLabel(formData.role)}.`);
           return;
        }
        if (requiresCrp(formData.role) && !/^\d{2}\/\d{4,6}$/.test(formData.crp.trim())) {
           setFormError("Informe o CRP no formato 00/00000.");
           return;
        }

        const userData = {
           name: formData.name,
           email: formData.email,
           role: formData.role,
           title: formData.title,
           institutionalLink: formData.institutionalLink,
           birthDate: formData.birthDate,
           matricula: formData.matricula,
           crp: requiresCrp(formData.role) ? formData.crp.trim() : "",
           color: formData.color,
        };

        try {
           if (editingUser) {
              await updateUser(editingUser.id, userData as any);
           } else {
              const password = await addUser(userData as any);
              setTemporaryCredential({ name: formData.name, password });
           }
        } catch (err: any) {
           setFormError(err?.message || "Não foi possível salvar o usuário.");
           return;
        }

        setIsAdding(false);
        setEditingUser(null);
        resetForm();
     }
  };

  const startEdit = (user: User) => {
     setEditingUser(user);
     setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        title: user.title || "",
        institutionalLink: user.institutionalLink || "",
        birthDate: user.birthDate || "",
        matricula: user.matricula || "",
        crp: user.crp || "",
        color: user.color || "#3b82f6"
     });
     setIsAdding(true);
  };

  const resetForm = () => {
     const nextColor = COLOR_PALETTE[users.length % COLOR_PALETTE.length];
     setFormData({
        name: "", email: "", role: "PSICO", title: "", institutionalLink: "", birthDate: "", matricula: "", crp: "", color: nextColor
     });
  };

  const cancelEdit = () => {
     setIsAdding(false);
     setEditingUser(null);
     resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" /> Gerenciamento de Equipe
         </h2>
         {!isAdding && (
            <button onClick={() => { resetForm(); setIsAdding(true); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors">
               Novo Usuário
            </button>
         )}
      </div>

      {actionError && (
         <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl px-5 py-4">
            {actionError}
         </div>
      )}

      {/* Senha provisória — exibida UMA única vez, nunca reexibível */}
      {temporaryCredential && (
         <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
               <h3 className="text-xl font-bold text-gray-900">Senha provisória gerada</h3>
               <p className="text-sm text-gray-600">
                  Entregue esta senha a <strong>{temporaryCredential.name}</strong> por um canal
                  seguro. Ela é exibida <strong>uma única vez</strong> e o sistema exigirá a troca
                  no primeiro acesso.
               </p>
               <div className="bg-gray-900 text-emerald-300 font-mono text-lg tracking-wider rounded-2xl px-5 py-4 text-center select-all break-all">
                  {temporaryCredential.password}
               </div>
               <p className="text-[11px] text-gray-500">
                  Evite enviar por canais que guardem histórico permanente. Enquanto a troca não
                  acontecer, o usuário não consegue registrar nada no sistema.
               </p>
               <button
                  onClick={() => setTemporaryCredential(null)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
               >
                  Já anotei, fechar
               </button>
            </div>
         </div>
      )}

      {isAdding && (
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold text-xl text-gray-900">{editingUser ? "Editar Usuário" : "Cadastrar Novo Usuário"}</h3>
               <button onClick={cancelEdit} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
               <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Nome Completo</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors" />
               </div>
               
               <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Email</label>
                  <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors" />
               </div>

               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Perfil de Acesso</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors font-semibold">
                     <option value="PSICO">Psicólogo</option>
                     <option value="ADMIN">Administrativo</option>
                     <option value="SUPERVISOR">Supervisor</option>
                  </select>
               </div>

               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Título (Opcional)</label>
                  <input type="text" placeholder="Ex: Dr., Me., Esp." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors" />
               </div>

               <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Vínculo Institucional</label>
                  <input type="text" placeholder="Ex: Unifebe, Estagiário..." value={formData.institutionalLink} onChange={e => setFormData({...formData, institutionalLink: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors" />
               </div>

               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Data de Nascimento</label>
                  <input type="date" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors font-medium text-gray-700" />
               </div>

               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Matrícula Interna</label>
                  <input type="text" value={formData.matricula} onChange={e => setFormData({...formData, matricula: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors" />
               </div>

               {requiresCrp(formData.role) && (
                  <div className="sm:col-span-1">
                     <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase flex items-center gap-1">CRP <span className="text-red-500">*</span></label>
                     <input type="text" required placeholder="00/00000" value={formData.crp} onChange={e => setFormData({...formData, crp: e.target.value})} className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 outline-none transition-colors font-mono" />
                  </div>
               )}

               <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Cor de Agenda</label>
                  <div className="flex items-center gap-3">
                     <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="h-10 w-12 rounded bg-gray-50 border border-gray-200 p-1 cursor-pointer" />
                     <span className="text-sm font-mono text-gray-500">{formData.color}</span>
                  </div>
               </div>
            </div>

            {formError && (
               <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
                  {formError}
               </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
               <button onClick={cancelEdit} className="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
               <button onClick={handleCreateOrUpdateUser} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                  <Check size={18} /> {editingUser ? "Salvar Alterações" : "Cadastrar Usuário"}
               </button>
            </div>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {users.map(u => (
            <div key={u.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col relative group">
               <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                  <button onClick={() => startEdit(u)} className="p-2 bg-gray-50 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar Usuário">
                     <Edit2 size={16} />
                  </button>
                  {u.id !== currentUser.id && (
                     <button onClick={() => handleDeleteUser(u)} className="p-2 bg-gray-50 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover Usuário">
                        <Trash2 size={16} />
                     </button>
                  )}
               </div>

               <div className="mb-4">
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">{roleLabel(u.role)}</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-2 truncate flex items-center gap-2" title={u.name}>
                     {u.title && <span className="text-sm font-medium text-gray-400">{u.title}</span>}
                     {u.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 truncate">{u.email}</p>
               </div>

               <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                  {u.crp && (
                     <div className="bg-gray-50 p-2 rounded-lg">
                        <span className="block text-gray-400 font-bold uppercase tracking-wider text-[9px]">CRP</span>
                        <span className="font-mono text-gray-700 font-medium">{u.crp}</span>
                     </div>
                  )}
                  {u.matricula && (
                     <div className="bg-gray-50 p-2 rounded-lg">
                        <span className="block text-gray-400 font-bold uppercase tracking-wider text-[9px]">Matrícula</span>
                        <span className="font-mono text-gray-700 font-medium">{u.matricula}</span>
                     </div>
                  )}
                  {u.institutionalLink && (
                     <div className="bg-gray-50 p-2 rounded-lg col-span-2">
                        <span className="block text-gray-400 font-bold uppercase tracking-wider text-[9px]">Vínculo</span>
                        <span className="text-gray-700 font-medium truncate flex">{u.institutionalLink}</span>
                     </div>
                  )}
               </div>
               
               <div className="mt-auto pt-4 border-t border-gray-100 space-y-3">
                  <button
                     onClick={() => handleResetPassword(u)}
                     className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                     title="Gera uma senha provisória; o usuário será obrigado a trocá-la no primeiro acesso."
                  >
                     <KeyRound size={16} className="text-gray-400" /> Gerar senha provisória
                  </button>
                  {u.mustChangePassword && (
                     <p className="text-[11px] font-bold text-amber-600">
                        Senha provisória pendente de troca
                     </p>
                  )}
               </div>
            </div>
         ))}
      </div>
    </div>
  );
}
