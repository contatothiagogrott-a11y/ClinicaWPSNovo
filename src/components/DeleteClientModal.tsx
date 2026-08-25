import React, { useState } from "react";
import { X, Trash2, ShieldAlert } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import type { Client } from "../types";

/**
 * Exclusão definitiva de cadastro — privativa do Supervisor.
 *
 * ⚠️ Contraria a orientação geral de guarda do CFP (Res. nº 001/2009 e Lei
 * nº 13.787/2018). Existe a pedido da coordenação do setor, para situações
 * específicas: cadastros criados por engano, testes e duplicatas.
 *
 * As salvaguardas são deliberadamente incômodas. Num sistema de prontuário, a
 * exclusão é irreversível — um clique errado não pode bastar. Por isso exige
 * digitar o nome completo do paciente e uma justificativa, e o servidor recusa
 * a operação se houver qualquer registro clínico escrito.
 */
export default function DeleteClientModal({
  client,
  onClose,
  onDeleted,
}: {
  client: Client;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { excluirPaciente } = useStore();
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  const normalizar = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  const nomeConfere = normalizar(nome) === normalizar(client.fullName);
  const motivoOk = motivo.trim().length >= 15;

  const confirmar = async () => {
    setErro("");
    setExcluindo(true);
    try {
      await excluirPaciente(client.id, nome, motivo.trim());
      onDeleted();
    } catch (err: any) {
      setErro(err?.message || "Não foi possível excluir o cadastro.");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
            <Trash2 size={20} /> Excluir cadastro
          </h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
            <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-red-900 leading-relaxed space-y-2">
              <p>
                <strong>Esta ação é irreversível.</strong> O cadastro, os agendamentos e a trilha
                de auditoria deste paciente serão apagados definitivamente.
              </p>
              <p>
                A guarda de prontuário é obrigatória por até 20 anos (Lei nº 13.787/2018). Use a
                exclusão apenas para cadastros criados por engano, testes ou duplicatas. Para
                encerrar um acompanhamento real, use <strong>Finalizado</strong> ou{" "}
                <strong>Cancelado</strong>.
              </p>
              <p>
                Se houver qualquer prontuário escrito ou documento emitido, o sistema recusará a
                exclusão.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Digite o nome completo do paciente para confirmar
            </label>
            <p className="text-sm font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-2 select-none">
              {client.fullName}
            </p>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              autoComplete="off"
              className={`w-full border rounded-xl px-4 py-3 outline-none font-medium transition-colors ${
                nome && !nomeConfere ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:bg-white"
              }`}
              placeholder="Digite exatamente como acima"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Motivo da exclusão <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 focus:border-red-400 focus:bg-white rounded-xl px-4 py-3 outline-none text-sm transition-colors"
              placeholder="Ex.: cadastro criado em duplicidade durante a importação da planilha de fevereiro."
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Fica registrado permanentemente, com seu nome e a data — inclusive depois que o
              cadastro deixar de existir.
            </p>
          </div>

          {erro && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-semibold">
              {erro}
            </p>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!nomeConfere || !motivoOk || excluindo}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {excluindo ? "Excluindo..." : "Excluir definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
