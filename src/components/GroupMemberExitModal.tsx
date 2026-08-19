import React, { useState } from "react";
import { X, LogOut, AlertTriangle } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { todayDateOnly } from "../lib/datetime";
import type { Client, Group } from "../types";

/**
 * Desligamento de integrante do grupo.
 *
 * O vínculo NÃO é apagado: registra-se a saída com data, desfecho e
 * justificativa. A pessoa permanece na história do grupo, e os prontuários
 * dos encontros de que participou continuam existindo — são registro do que
 * aconteceu (Resolução CFP nº 001/2009).
 *
 * O desfecho usa terminologia clínica em vez de administrativa: "alta do
 * processo grupal" e "abandono" descrevem percursos diferentes e orientam
 * condutas diferentes. "Saiu do grupo" não informa nada.
 */
const DESFECHOS: Array<{ value: string; label: string; ajuda: string }> = [
  {
    value: "ALTA_GRUPAL",
    label: "Alta do processo grupal",
    ajuda: "Objetivos terapêuticos alcançados; encerramento planejado com devolutiva.",
  },
  {
    value: "ENCAMINHAMENTO",
    label: "Encaminhamento para outra modalidade",
    ajuda: "A demanda do participante é melhor atendida em outro formato (individual, rede externa).",
  },
  {
    value: "ABANDONO",
    label: "Abandono do processo",
    ajuda: "Interrupção sem devolutiva nem contato de encerramento.",
  },
  {
    value: "DESISTENCIA",
    label: "Desistência manifestada",
    ajuda: "O participante comunicou a decisão de interromper.",
  },
  {
    value: "INCOMPATIBILIDADE",
    label: "Incompatibilidade com o grupo",
    ajuda: "Critérios de inclusão ou objetivos do grupo não correspondem à demanda.",
  },
  {
    value: "IMPEDIMENTO",
    label: "Impedimento externo",
    ajuda: "Afastamento, mudança de lotação, incompatibilidade de agenda.",
  },
  { value: "ENCERRAMENTO_GRUPO", label: "Encerramento do grupo", ajuda: "O grupo foi finalizado." },
  { value: "OUTRO", label: "Outro motivo", ajuda: "Descreva na justificativa." },
];

export default function GroupMemberExitModal({
  group,
  client,
  onClose,
}: {
  group: Group;
  client: Client;
  onClose: () => void;
}) {
  const { desligarIntegrante } = useStore();
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const [exitedAt, setExitedAt] = useState(todayDateOnly());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const desfechoEscolhido = DESFECHOS.find(d => d.value === outcome);

  const confirmar = async () => {
    setErro("");
    if (!outcome) return setErro("Selecione o desfecho do vínculo.");
    if (reason.trim().length < 10) return setErro("Descreva a justificativa clínica com pelo menos 10 caracteres.");

    setSalvando(true);
    try {
      await desligarIntegrante(group.id, client.id, { exitOutcome: outcome, exitReason: reason.trim(), exitedAt });
      onClose();
    } catch (err: any) {
      setErro(err?.message || "Não foi possível registrar o desligamento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <LogOut size={20} className="text-purple-600" /> Desligar integrante
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{client.fullName} · {group.name}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="text-blue-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-blue-900 leading-relaxed">
              O vínculo não é apagado: fica registrado que a pessoa participou, de quando até
              quando e com qual desfecho. Os prontuários dos encontros de que ela participou
              <strong> permanecem</strong>. Apenas os registros de encontros futuros, ainda em
              branco, são removidos.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Data do desligamento
            </label>
            <input
              type="date"
              value={exitedAt}
              onChange={e => setExitedAt(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 outline-none font-medium transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Desfecho do vínculo <span className="text-red-500">*</span>
            </label>
            <select
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 outline-none font-medium transition-colors"
            >
              <option value="">Selecione...</option>
              {DESFECHOS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {desfechoEscolhido && (
              <p className="text-[11px] text-gray-500 mt-1.5">{desfechoEscolhido.ajuda}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Justificativa clínica <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              className="w-full bg-gray-50 border border-gray-200 focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 outline-none text-sm transition-colors"
              placeholder="Ex.: Participante alcançou os objetivos propostos, com melhora do manejo de ansiedade em contexto laboral. Encerramento planejado com devolutiva no encontro de 12/08."
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Compõe o prontuário do paciente. Registre apenas o necessário ao acompanhamento.
            </p>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{erro}</p>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {salvando ? "Registrando..." : "Registrar desligamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
