import { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Users, Trash2, KeyRound, Edit2, X, Check } from "lucide-react";
import { User, Role } from "../types";
import { cn } from "../lib/utils";

export default function UsersManagement() {
  const { currentUser, users, deleteUser, updateUser, addUser } = useStore();
  
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

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

  const handleUpdatePassword = (userId: string) => {
    if (newPassword.trim()) {
      updateUser(userId, { password: newPassword });
      setEditingPasswordId(null);
      setNewPassword("");
    }
  };

  const handleCreateOrUpdateUser = () => {
     if (formData.name && formData.email) {
        if (formData.role === "PSICO" && !formData.crp.trim()) {
           alert("CRP é obrigatório para Psicólogos.");
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
           crp: formData.role === "PSICO" ? formData.crp : "",
           color: formData.color,
        };

        if (editingUser) {
           updateUser(editingUser.id, userData);
        } else {
           const tempPassword = `Bemvindo${Math.floor(1000 + Math.random() * 9000)}!`;
           addUser({
              ...userData,
              password: tempPassword
           });
           alert(`Usuário criado. Senha temporária (compartilhe com segurança e peça para trocar no primeiro acesso): ${tempPassword}`);
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
     setFormData({
        name: "", email: "", role: "PSICO", title: "", institutionalLink: "", birthDate: "", matricula: "", crp: "", color: "#3b82f6"
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
            <button onClick={() => setIsAdding(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors">
               Novo Usuário
            </button>
         )}
      </div>

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

               {formData.role === "PSICO" && (
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
                     <button onClick={() => deleteUser(u.id)} className="p-2 bg-gray-50 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover Usuário">
                        <Trash2 size={16} />
                     </button>
                  )}
               </div>

               <div className="mb-4">
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">{u.role}</span>
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
                  {editingPasswordId === u.id ? (
                     <div className="flex items-center gap-2">
                        <input 
                           type="text" 
                           autoFocus
                           className="flex-1 bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm outline-none" 
                           placeholder="Nova senha..."
                           value={newPassword}
                           onChange={e => setNewPassword(e.target.value)}
                        />
                        <button onClick={() => handleUpdatePassword(u.id)} className="text-emerald-600 font-bold text-sm hover:underline">Salvar</button>
                        <button onClick={() => setEditingPasswordId(null)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                     </div>
                  ) : (
                     <div className="flex items-center justify-between">
                        <button 
                           onClick={() => setEditingPasswordId(u.id)}
                           className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                        >
                           <KeyRound size={16} className="text-gray-400" /> Redefinir Senha
                        </button>
                     </div>
                  )}
               </div>
            </div>
         ))}
      </div>
    </div>
  );
}
