import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { X, CalendarOff, RotateCcw, AlertTriangle } from "lucide-react";
import { clinicians } from "../lib/roles";
import { formatDateBR, todayDateOnly } from "../lib/datetime";
import { cn } from "../lib/utils";

/**
 * SUSPENSÃO DE ATENDIMENTOS POR PERÍODO
 * =====================================
 *
 * Férias, licença ou afastamento — do paciente ou do profissional.
 *
 * Por que é um PERÍODO e não um dia solto: quem sai de férias não desmarca um
 * atendimento, para de atender por três semanas. Marcar dia a dia é trabalhoso,
 * dá margem a esquecer um, e não deixa no prontuário o registro do intervalo —
 * que é justamente a informação que falta quando alguém lê o documento meses
 * depois e encontra um vão sem explicação.
 *
 * O que a suspensão faz, de uma vez:
 *  1. marca os atendimentos PENDENTES do período como suspensos;
 *  2. libera as salas e horários para outro agendamento;
 *  3. grava UMA entrada no prontuário de cada paciente atingido, com o
 *     período e o motivo;
 *  4. não consome sessão do pacote de ninguém.
 *
 * Atendimentos que já têm desfecho (realizados, faltas, cancelamentos) não são
 * tocados: suspender um período não reescreve o que já aconteceu dentro dele.
 */
export default function SuspensaoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { users, clients, currentUser, suspensoes, criarSuspensao, desfazerSuspensao } = useStore();

  const [scope, setScope] = useState<"PROFISSIONAL" | "PACIENTE">("PROFISSIONAL");
  const [psicoId, setPsicoId] = useState(currentUser?.id || "");
  const [clientId, setClientId] = useState("");
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [startDate, setStartDate] = useState(todayDateOnly());
  const [endDate, setEndDate] = useState(todayDateOnly());
  const [reason, setReason] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  if (!open) return null;

  const psicos = clinicians(users).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const ehGestao = currentUser?.role === "SUPERVISOR" || currentUser?.role === "ADMIN";

  /**
   * Quem o usuário pode suspender.
   * O psicólogo lança a própria agenda e os pacientes de quem é responsável;
   * suspender a agenda de um colega é decisão de escala, e fica com a gestão.
   */
  const psicosDisponiveis = ehGestao ? psicos : psicos.filter(p => p.id === currentUser?.id);
  const pacientesDisponiveis = clients
    .filter(c => c.status !== "FINALIZADO" && c.status !== "CANCELADO")
    .filter(c => ehGestao || c.assignedPsicoId === currentUser?.id)
    .filter(c =>
      !buscaPaciente.trim() ||
      c.fullName.toLowerCase().includes(buscaPaciente.trim().toLowerCase())
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"))
    .slice(0, 60);

  const ativas = suspensoes.filter(s => !s.revokedAt);

  const nomeDoAlvo = (s: typeof suspensoes[number]) =>
    s.scope === "PROFISSIONAL"
      ? s.psicoName || "profissional"
      : clients.find(c => c.id === s.clientId)?.fullName || "paciente";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setResultado("");

    if (scope === "PROFISSIONAL" && !psicoId) { setErro("Escolha o profissional."); return; }
    if (scope === "PACIENTE" && !clientId) { setErro("Escolha o paciente."); return; }
    if (!startDate || !endDate) { setErro("Informe as duas datas."); return; }
    if (endDate < startDate) { setErro("A data de término não pode ser anterior à de início."); return; }
    if (!reason.trim()) { setErro("Informe o motivo. Ele fica registrado no prontuário."); return; }

    setSalvando(true);
    try {
      const r = await criarSuspensao({
        scope,
        psicoId: scope === "PROFISSIONAL" ? psicoId : undefined,
        clientId: scope === "PACIENTE" ? clientId : undefined,
        startDate, endDate, reason: reason.trim(),
      });
      setResultado(
        `${r.agendamentosAfetados} atendimento(s) suspenso(s), em ${r.pacientesAtingidos} prontuário(s).`
      );
      setReason("");
    } catch (err: any) {
      setErro(err?.message || "Não foi possível lançar a suspensão.");
    } finally {
      setSalvando(false);
    }
  };

  const handleDesfazer = async (id: string) => {
    if (!confirm(
      "Desfazer esta suspensão?\n\nOs atendimentos do período voltam a ficar pendentes e as entradas que ela criou saem dos prontuários.\n\nEvoluções escritas por profissionais são preservadas."
    )) return;
    setErro(""); setResultado("");
    try {
      const r = await desfazerSuspensao(id);
      setResultado(
        `${r.agendamentosRevertidos} atendimento(s) voltaram a pendente; ${r.registrosRemovidos} registro(s) removidos.`
      );
    } catch (err: any) {
      setErro(err?.message || "Não foi possível desfazer.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 text-amber-700 p-2.5 rounded-xl"><CalendarOff size={20} /></div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg leading-tight">Suspender atendimentos</h3>
              <p className="text-xs text-gray-500">Férias, licença ou afastamento — não é cancelamento</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                Quem vai se afastar
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["PROFISSIONAL", "O profissional", "A agenda dele para no período"],
                  ["PACIENTE", "O paciente", "Só os atendimentos dele"],
                ] as const).map(([v, titulo, ajuda]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScope(v)}
                    className={cn(
                      "text-left p-3 rounded-xl border transition-colors",
                      scope === v
                        ? "bg-amber-50 border-amber-400 ring-1 ring-amber-400"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <span className={cn("block font-bold text-sm", scope === v ? "text-amber-800" : "text-gray-700")}>
                      {titulo}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5 leading-tight">{ajuda}</span>
                  </button>
                ))}
              </div>
            </div>

            {scope === "PROFISSIONAL" ? (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Profissional</label>
                <select
                  value={psicoId}
                  onChange={e => setPsicoId(e.target.value)}
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 outline-none font-medium text-sm"
                >
                  <option value="">— escolha —</option>
                  {psicosDisponiveis.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.crp ? ` — CRP ${p.crp}` : ""}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Atinge os atendimentos individuais e os encontros de grupo que esta pessoa conduz.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Paciente</label>
                <input
                  value={buscaPaciente}
                  onChange={e => setBuscaPaciente(e.target.value)}
                  placeholder="Buscar por nome…"
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2 outline-none text-sm mb-2"
                />
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  size={5}
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 outline-none text-sm"
                >
                  {pacientesDisponiveis.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Atinge só os atendimentos <strong>individuais</strong>. Encontros de grupo continuam
                  acontecendo para os demais integrantes — a ausência da pessoa é registrada como falta
                  naquele encontro.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">De</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 outline-none font-bold text-gray-900" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Até</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 outline-none font-bold text-gray-900" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                Motivo <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="Férias regulamentares, licença, viagem…"
                className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-2.5 outline-none text-sm resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Fica registrado no prontuário dos pacientes atingidos. É guardado criptografado e
                não aparece na trilha de auditoria.
              </p>
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                {erro}
              </div>
            )}
            {resultado && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl px-4 py-3 text-sm font-medium">
                {resultado}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-amber-900 leading-relaxed">
                Os horários do período ficam <strong>livres para outro agendamento</strong> e ninguém
                perde sessão do pacote. Atendimentos que já têm desfecho — realizados, faltas,
                cancelamentos — não são alterados.
              </p>
            </div>

            <button
              type="submit"
              disabled={salvando}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {salvando ? "Lançando…" : "Lançar suspensão"}
            </button>
          </form>

          {ativas.length > 0 && (
            <div className="border-t border-gray-100 p-6">
              <h4 className="font-bold text-gray-800 mb-3 text-sm">Suspensões em vigor</h4>
              <div className="space-y-2">
                {ativas.map(s => (
                  <div key={s.id} className="flex items-start justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">
                        {s.scope === "PROFISSIONAL" ? "Agenda de " : "Paciente "}{nomeDoAlvo(s)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateBR(s.startDate)} até {formatDateBR(s.endDate)} · lançada por {s.createdByName}
                      </p>
                      {s.reason && <p className="text-xs text-gray-600 mt-1 italic">{s.reason}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDesfazer(s.id)}
                      title="Desfazer esta suspensão"
                      className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-red-700 bg-white border border-gray-200 hover:border-red-200 rounded-lg px-3 py-2 transition-colors"
                    >
                      <RotateCcw size={14} /> Desfazer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
