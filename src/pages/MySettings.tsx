import { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Lock } from "lucide-react";
import { roleLabel } from "../lib/roles";

export default function MySettings() {
  const { currentUser, changeOwnPassword } = useStore();
  const [newPassword, setNewPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Os hooks precisam vir ANTES de qualquer return condicional (Regras dos
  // Hooks). O `if (!currentUser) return null` estava acima deste useState.
  const [errorMsg, setErrorMsg] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const handleSave = async () => {
    if (!newPassword.trim()) return;
    try {
      /**
       * Troca da própria senha passa pela rota dedicada, que EXIGE a senha
       * atual. Antes isso era um PATCH comum em /api/users/:id — ou seja,
       * bastava ter a sessão aberta para trocar a senha, o que transforma um
       * computador desbloqueado em sequestro de conta.
       */
      await changeOwnPassword(currentPassword, newPassword);
      setSuccessMsg("Senha atualizada com sucesso!");
      setErrorMsg("");
      setNewPassword("");
      setCurrentPassword("");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || "Não foi possível atualizar a senha.");
    }
  };

  if (!currentUser) return null;

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold text-gray-900 mb-8">Minhas Configurações</h2>
      
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-6">
         <h3 className="text-xl font-bold text-gray-900 mb-4">Informações do Usuário</h3>
         <div className="space-y-4">
            <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Nome</label>
               <div className="text-gray-900 font-medium">{currentUser.name}</div>
            </div>
            <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Perfil</label>
               <div className="text-gray-900 font-medium">{roleLabel(currentUser.role)}</div>
            </div>
            {currentUser.crp && (
               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">CRP</label>
                  <div className="text-gray-900 font-medium">{currentUser.crp}</div>
               </div>
            )}
            <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Vínculo Institucional</label>
               <div className="bg-gray-50 inline-block px-3 py-1 rounded-lg border border-gray-200 text-gray-700 font-bold text-sm">
                  {currentUser.institutionalLink || "Não informado"}
               </div>
               <p className="text-xs text-gray-400 mt-1">Este vínculo é definido pela administração em "Gerenciar Usuários".</p>
            </div>
         </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Lock className="text-blue-600" size={24} />
            Alterar Senha
         </h3>
         
         <div className="space-y-4">
            <div>
               <label className="block text-sm font-medium text-gray-700">Senha Atual</label>
               <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Confirme a sua senha atual"
               />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
               <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo de 10 caracteres, com letra e número"
               />
            </div>
            {successMsg && <div className="text-green-600 text-sm font-bold bg-green-50 p-2 rounded-lg">{successMsg}</div>}
            {errorMsg && <div className="text-red-600 text-sm font-bold bg-red-50 p-2 rounded-lg">{errorMsg}</div>}
            <button
               onClick={handleSave}
               disabled={!newPassword.trim() || !currentPassword.trim()}
               className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
               Salvar Senha
            </button>
         </div>
      </div>
    </div>
  );
}
