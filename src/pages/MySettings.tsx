import { useState, useEffect } from "react";
import { useStore } from "../contexts/StoreContext";
import { Lock } from "lucide-react";
import { cn } from "../lib/utils";
import { roleLabel, GENDER_OPTIONS, signatureTitle } from "../lib/roles";
import { verificarEstado, ativarNotificacoes, desativarNotificacoes, enviarTeste, type EstadoPush } from "../lib/push";
import { Bell, BellOff, Smartphone } from "lucide-react";

export default function MySettings() {
  const { currentUser, changeOwnPassword, updateUser } = useStore();
  const [newPassword, setNewPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Os hooks precisam vir ANTES de qualquer return condicional (Regras dos
  // Hooks). O `if (!currentUser) return null` estava acima deste useState.
  const [errorMsg, setErrorMsg] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  // --- Notificações push ---
  const [estadoPush, setEstadoPush] = useState<EstadoPush | null>(null);
  const [ocupadoPush, setOcupadoPush] = useState(false);
  const [avisoPush, setAvisoPush] = useState("");

  useEffect(() => {
    verificarEstado().then(setEstadoPush).catch(() => setEstadoPush("nao_suportado"));
  }, []);

  const alternarPush = async () => {
    setOcupadoPush(true);
    setAvisoPush("");
    try {
      const novo = estadoPush === "ativado" ? await desativarNotificacoes() : await ativarNotificacoes();
      setEstadoPush(novo);
      if (novo === "ativado") {
        const enviados = await enviarTeste();
        setAvisoPush(enviados > 0
          ? "Pronto. Enviamos uma notificação de teste para este aparelho."
          : "Ativado, mas o teste não chegou. Verifique as permissões do navegador.");
      }
    } catch (err: any) {
      setAvisoPush(err?.message || "Não foi possível alterar as notificações.");
    } finally {
      setOcupadoPush(false);
    }
  };

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
            {/* TÍTULO NOS DOCUMENTOS ---------------------------------------- */}
            <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
               <div>
                  <p className="font-bold text-gray-900">Como seu título aparece nos documentos</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                     Atestados e relatórios são assinados com seu título e CRP. Sem informar,
                     sai a forma neutra.
                  </p>
               </div>
               <select
                  value={currentUser.gender || "NAO_INFORMADO"}
                  onChange={e => updateUser(currentUser.id, { gender: e.target.value as any })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-blue-500"
               >
                  {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
               </select>
               <p className="text-xs text-gray-600">
                  Seus documentos sairão assinados como{" "}
                  <strong>{signatureTitle(currentUser)} {currentUser.name}</strong>
                  {currentUser.crp ? ` — CRP ${currentUser.crp}` : ""}.
               </p>
            </div>

            {/* NOTIFICAÇÕES ------------------------------------------------ */}
            <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
               <div className="flex items-start gap-3">
                  {estadoPush === "ativado"
                    ? <Bell className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                    : <BellOff className="text-gray-400 shrink-0 mt-0.5" size={20} />}
                  <div className="flex-1 min-w-0">
                     <p className="font-bold text-gray-900">Notificações no celular</p>
                     <p className="text-sm text-gray-500 mt-0.5">
                        Avisos de atendimento e de pendências, mesmo com o aplicativo fechado.
                        Por sigilo, a mensagem <strong>nunca mostra o nome do paciente</strong> —
                        ela aparece na tela de bloqueio do aparelho.
                     </p>
                  </div>
               </div>

               {estadoPush === "precisa_instalar_ios" && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                     <Smartphone className="text-blue-600 shrink-0 mt-0.5" size={18} />
                     <p className="text-xs text-blue-900 leading-relaxed">
                        No iPhone, as notificações só funcionam com o aplicativo instalado na tela
                        de início. Toque no botão <strong>Compartilhar</strong> do Safari e escolha
                        <strong> "Adicionar à Tela de Início"</strong>. Depois abra o app por lá e
                        volte aqui. É necessário iOS 16.4 ou mais recente.
                     </p>
                  </div>
               )}

               {estadoPush === "bloqueado" && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                     As notificações foram bloqueadas para este site. Libere nas configurações do
                     navegador (cadeado ao lado do endereço) e tente de novo.
                  </p>
               )}

               {estadoPush === "nao_configurado" && (
                  <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                     Recurso ainda não configurado no servidor. Fale com quem administra o sistema.
                  </p>
               )}

               {estadoPush === "nao_suportado" && (
                  <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                     Este navegador não oferece notificações.
                  </p>
               )}

               {(estadoPush === "ativado" || estadoPush === "desativado") && (
                  <button
                     onClick={alternarPush}
                     disabled={ocupadoPush}
                     className={cn(
                        "w-full font-bold py-3 rounded-xl transition-colors disabled:opacity-60",
                        estadoPush === "ativado"
                           ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                           : "bg-blue-600 hover:bg-blue-700 text-white"
                     )}
                  >
                     {ocupadoPush
                        ? "Aguarde..."
                        : estadoPush === "ativado"
                        ? "Desativar notificações neste aparelho"
                        : "Ativar notificações neste aparelho"}
                  </button>
               )}

               {avisoPush && <p className="text-xs text-gray-600">{avisoPush}</p>}
            </div>

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
