import React, { useState } from "react";
import { X, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { clinicians } from "../lib/roles";
import type { Client } from "../types";

/**
 * Transferência do profissional responsável pelo paciente.
 *
 * REGRA (item 4): somente Supervisor e Administrativo. O bloqueio real está na
 * API — esta tela só existe para quem tem a permissão, mas mesmo que alguém
 * force a chamada, o servidor recusa (403).
 *
 * A justificativa é obrigatória (mínimo de 10 caracteres) e vai para a trilha
 * de auditoria. Motivo: a troca de terapeuta é um evento clínico relevante,
 * que interrompe vínculo e precisa ser sustentável perante o CRP e perante o
 * próprio paciente. "Quem transferiu, quando e por quê" não pode depender da
 * memória de ninguém.
 *
 * Os agendamentos futuros seguem automaticamente com o paciente (o histórico
 * de atendimentos passados permanece com quem os realizou — registro não se
 * reescreve).
 */
export default function TransferPsicoModal({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client: Client;
}) {
  const { users, transferClient } = useStore();
  const [targetId, setTargetId] = useState(client.assignedPsicoId || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const professionals = clinicians(users);
  const currentName = client.assignedPsicoName || "Não atribuído";
  const targetName = professionals.find((p) => p.id === targetId)?.name || "Não atribuído";
  const isSameProfessional = (client.assignedPsicoId || "") === targetId;

  const handleSubmit = async () => {
    setError("");
    if (isSameProfessional) {
      setError("Escolha um profissional diferente do atual.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Descreva a justificativa com pelo menos 10 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await transferClient(client.id, targetId || null, reason.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || "Não foi possível concluir a transferência.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ArrowRightLeft size={20} className="text-blue-600" /> Transferir paciente
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{client.fullName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-amber-900 leading-relaxed">
              A troca de profissional responsável fica registrada na trilha de auditoria com autor,
              data e justificativa. Os <strong>agendamentos futuros</strong> passam para o novo
              profissional; o histórico de atendimentos já realizados permanece vinculado a quem os
              conduziu.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
                Responsável atual
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-medium text-gray-700">
                {currentName}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
                Novo responsável
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none font-medium focus:border-blue-500"
              >
                <option value="">Não atribuído</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.crp ? ` — CRP ${p.crp}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Justificativa da transferência <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-3 outline-none text-sm transition-colors"
              placeholder="Ex.: redistribuição de carga do quadro clínico; afastamento do profissional; solicitação do paciente."
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Registre o motivo administrativo. <strong>Não</strong> inclua conteúdo clínico aqui —
              a trilha de auditoria é visível a Supervisor e Administrativo.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {saving ? "Transferindo..." : `Transferir para ${targetName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
