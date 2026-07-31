import React, { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { APP_NAME } from "../lib/branding";

/**
 * Tela bloqueante de troca da senha provisória.
 *
 * Enquanto o usuário não trocar a senha criada por um gestor, a API recusa
 * qualquer escrita (HTTP 423) e o bootstrap não é liberado.
 *
 * Por que isso importa em prontuário: a assinatura do registro clínico só tem
 * valor se a credencial for conhecida exclusivamente pelo titular. Se o
 * Supervisor sabe a senha do psicólogo, qualquer evolução registrada em nome
 * dele perde o não-repúdio — e a instituição perde a capacidade de dizer,
 * diante do CRP ou de um processo, quem de fato escreveu aquilo.
 */
export default function ChangePasswordGate() {
  const { changeOwnPassword, currentUser, setCurrentUser } = useStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setIsSubmitting(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
    } catch (err: any) {
      setError(err?.message || "Não foi possível trocar a senha.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <span className="bg-indigo-900 text-white p-3 rounded-2xl shadow-lg shadow-indigo-500/30">
            <KeyRound size={32} />
          </span>
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-gray-900">
          Defina a sua senha pessoal
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">{APP_NAME}</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-gray-100 rounded-3xl sm:px-10">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex gap-3">
            <ShieldCheck className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-amber-900 leading-relaxed">
              Você está usando uma <strong>senha provisória</strong>, conhecida por quem criou o seu
              acesso. Para que os registros feitos em seu nome tenham validade, a senha precisa ser
              só sua. Escolha uma nova senha para continuar.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Senha atual (provisória)</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                autoComplete="current-password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                autoComplete="new-password"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Mínimo de 10 caracteres, com ao menos uma letra e um número.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirme a nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white bg-indigo-900 hover:bg-indigo-800 disabled:opacity-60 font-bold transition-colors"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
              Salvar nova senha
            </button>
          </form>

          <button
            onClick={() => setCurrentUser(null)}
            className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Sair {currentUser?.name ? `(${currentUser.name})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
