import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { BarChart as BarChartIcon, Users, Activity, CheckCircle, Clock, TrendingUp, Tag, History, Layers, Download } from "lucide-react";
import { cn } from "../lib/utils";
import { parseISO, isWithinInterval } from "date-fns";
import { downloadPdf } from "../lib/pdfGenerator";
import { buildRelatorioDocDefinition, ReportTableSection } from "../lib/pdfRelatorio";

export default function Metrics() {
  const { clients, sessions, instruments, instrumentLogs, config, appointments, users } = useStore();
  const [startDate, setStartDate] = useState(() => {
     const date = new Date();
     date.setDate(1); // 1st day of the current month
     return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
     return new Date().toISOString().split('T')[0];
  });

  const isWithinPeriod = (dateStr: string) => {
     if (!dateStr) return false;
     const d = new Date(dateStr).getTime();
     const start = new Date(startDate + "T00:00:00").getTime();
     const end = new Date(endDate + "T23:59:59.999").getTime();
     return d >= start && d <= end;
  };

  const filteredSessions = sessions.filter(s => !s.isDraft && isWithinPeriod(s.date || s.createdAt));
  const filteredClients = clients.filter(c => isWithinPeriod(c.dateIncluded));
  const filteredLogs = instrumentLogs.filter(l => l.type === "CONSUMPTION" && isWithinPeriod(l.date));

  const periodInterval = { start: new Date(startDate + "T00:00:00"), end: new Date(endDate + "T23:59:59.999") };
  // Só agendamentos individuais (de um paciente específico) contam aqui — os de
  // grupo têm presença registrada por membro em outro lugar (prontuário do
  // grupo), então misturar os dois deixava o número sem sentido claro.
  const apptsInPeriod = appointments.filter(a => {
     if (!a.clientId) return false;
     try { return isWithinInterval(parseISO(a.date), periodInterval); } catch { return false; }
  });
  const withAttendance = apptsInPeriod.filter(a => a.attendance && a.attendance !== "PENDENTE");
  const countCompareceu = withAttendance.filter(a => a.attendance === "COMPARECEU").length;
  const countFaltaJustificada = withAttendance.filter(a => a.attendance === "FALTA_JUSTIFICADA").length;
  const countFaltaInjustificada = withAttendance.filter(a => a.attendance === "FALTA_INJUSTIFICADA").length;

  const psicos = users.filter(u => u.role === "PSICO");
  const psicoPerformance = psicos.map(p => {
     const activeClients = clients.filter(c => c.assignedPsicoId === p.id && c.status === "EM_ATENDIMENTO");
     const withPlan = activeClients.filter(c => c.maxSessions > 0);
     const avgCompletion = withPlan.length > 0
        ? Math.round(withPlan.reduce((acc, c) => acc + (c.completedSessions / c.maxSessions), 0) / withPlan.length * 100)
        : null;
     const myAppts = apptsInPeriod.filter(a => a.psicoId === p.id);
     const myWithAttendance = myAppts.filter(a => a.attendance && a.attendance !== "PENDENTE");
     return {
        id: p.id,
        name: p.name,
        activeClients: activeClients.length,
        avgCompletion,
        compareceu: myWithAttendance.filter(a => a.attendance === "COMPARECEU").length,
        faltaJustificada: myWithAttendance.filter(a => a.attendance === "FALTA_JUSTIFICADA").length,
        faltaInjustificada: myWithAttendance.filter(a => a.attendance === "FALTA_INJUSTIFICADA").length,
        sessionsInPeriod: sessions.filter(s => s.psicoId === p.id && !s.isDraft && isWithinPeriod(s.date || s.createdAt)).length,
     };
  });

  const totalAtendimentos = filteredSessions.length;
  const inWaitlist = filteredClients.filter(c => c.status === "FILA_ESPERA" || c.status === "TRIAGEM" || c.status === "TRIADOS");
  const completedOrActive = filteredClients.filter(c => c.status === "EM_ATENDIMENTO" || c.status === "FINALIZADO");
  
  const avgAtendimentos = completedOrActive.length > 0 ? (totalAtendimentos / completedOrActive.length).toFixed(1) : 0;
  
  const totalAvaliacoes = filteredLogs.reduce((acc, log) => acc + Math.abs(log.amount), 0);
  
  const affiliations = config.affiliations.map(a => a.name);
  const byAffiliation = affiliations.map(a => ({
     name: a,
     count: filteredClients.filter(c => c.affiliation === a).length
  }));

  const totalDependentes = byAffiliation.find(a => a.name === "Dependente")?.count || 0;
  const totalTitulares = filteredClients.length - totalDependentes;
  const totalClients = filteredClients.length || 1; // avoid division by 0

  // -------------------------------------------------------------------------
  // Métricas por TAG (temática): quantos casos, em qual etapa, e média de
  // sessões dos casos finalizados com aquela tag — dá uma leitura por assunto
  // (ex: "Ansiedade") em vez de só números soltos.
  // -------------------------------------------------------------------------
  const activeTags = config.tags.filter(t => t.isActive).map(t => t.name);
  const tagBreakdown = activeTags.map(tag => {
    const withTag = clients.filter(c => c.tags?.includes(tag));
    const finalizedWithTag = withTag.filter(c => c.status === "FINALIZADO");
    const avgSessions = finalizedWithTag.length > 0
      ? Math.round((finalizedWithTag.reduce((acc, c) => acc + (c.completedSessions || 0), 0) / finalizedWithTag.length) * 10) / 10
      : null;
    return {
      tag,
      total: withTag.length,
      filaEspera: withTag.filter(c => c.status === "FILA_ESPERA").length,
      triagem: withTag.filter(c => c.status === "TRIAGEM").length,
      triados: withTag.filter(c => c.status === "TRIADOS").length,
      emAtendimento: withTag.filter(c => c.status === "EM_ATENDIMENTO").length,
      finalizado: finalizedWithTag.length,
      avgSessions,
    };
  }).filter(t => t.total > 0);

  // -------------------------------------------------------------------------
  // Quem fez a triagem/classificação de risco no período — derivado do
  // histórico do paciente (cada mudança de status fica registrada lá).
  // -------------------------------------------------------------------------
  const allHistory = clients.flatMap(c => (c.history || []).map(h => ({ ...h, clientId: c.id, clientName: c.fullName })));
  const triagemHistory = allHistory.filter(h => isWithinPeriod(h.date) && /TRIAGEM/i.test(h.action));
  const triadosHistory = allHistory.filter(h => isWithinPeriod(h.date) && /TRIADOS/i.test(h.action));
  const triagemByPsico = new Map<string, { triagem: number; triados: number }>();
  triagemHistory.forEach(h => {
    const cur = triagemByPsico.get(h.actorName) || { triagem: 0, triados: 0 };
    cur.triagem++;
    triagemByPsico.set(h.actorName, cur);
  });
  triadosHistory.forEach(h => {
    const cur = triagemByPsico.get(h.actorName) || { triagem: 0, triados: 0 };
    cur.triados++;
    triagemByPsico.set(h.actorName, cur);
  });
  const triagemRows = Array.from(triagemByPsico.entries()).map(([name, v]) => ({ name, ...v }));

  // -------------------------------------------------------------------------
  // Atendidos no período (pacientes distintos, não sessões brutas) e volume
  // atual em atendimento (não depende do período, é uma foto de agora).
  // -------------------------------------------------------------------------
  const atendidosNoPeriodo = new Set(filteredSessions.map(s => s.clientId)).size;
  const emAtendimentoAgora = clients.filter(c => c.status === "EM_ATENDIMENTO").length;

  // -------------------------------------------------------------------------
  // Coorte por ano de entrada na fila: de quem entrou no ano X, quantos já
  // tiveram atendimento dentro do período filtrado acima.
  // -------------------------------------------------------------------------
  const waitlistYears = Array.from(new Set(clients.map(c => new Date(c.dateIncluded).getFullYear()))).sort((a, b) => b - a);
  const [cohortYear, setCohortYear] = useState<number>(waitlistYears[0] || new Date().getFullYear());
  const cohortClients = clients.filter(c => new Date(c.dateIncluded).getFullYear() === cohortYear);
  const cohortAttendedInPeriod = cohortClients.filter(c => filteredSessions.some(s => s.clientId === c.id));
  const cohortStillWaiting = cohortClients.filter(c => ["FILA_ESPERA", "TRIAGEM", "TRIADOS"].includes(c.status));

  // -------------------------------------------------------------------------
  // Exportação em PDF — seções selecionáveis
  // -------------------------------------------------------------------------
  const SECTION_OPTIONS = [
    { key: "resumo", label: "Resumo Geral" },
    { key: "tags", label: "Métricas por Tag" },
    { key: "psicologos", label: "Desempenho por Psicólogo" },
    { key: "triagem", label: "Triagem por Psicólogo" },
    { key: "coorte", label: `Coorte ${cohortYear} (fila de espera)` },
    { key: "vinculo", label: "Público por Vínculo" },
  ];
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(SECTION_OPTIONS.map(s => s.key)));

  const toggleSection = (key: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExportPdf = () => {
    const periodLabel = `Período: ${new Date(startDate + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(endDate + "T00:00:00").toLocaleDateString("pt-BR")}`;
    const sections: ReportTableSection[] = [];

    if (selectedSections.has("resumo")) {
      sections.push({
        title: "Resumo Geral",
        headers: ["Métrica", "Valor"],
        rows: [
          ["Prontuários salvos no período", totalAtendimentos],
          ["Pacientes distintos atendidos no período", atendidosNoPeriodo],
          ["Em atendimento (agora)", emAtendimentoAgora],
          ["Na fila de espera (agora)", inWaitlist.length],
          ["Compareceram no período (atendimentos individuais)", countCompareceu],
          ["Faltas justificadas no período (individuais)", countFaltaJustificada],
          ["Faltas injustificadas no período (individuais)", countFaltaInjustificada],
          ["Média de sessões por paciente ativo/concluído", avgAtendimentos],
          ["Avaliações/instrumentos aplicados no período", totalAvaliacoes],
        ],
      });
    }
    if (selectedSections.has("tags")) {
      sections.push({
        title: "Métricas por Tag",
        headers: ["Tag", "Total", "Fila", "Triagem", "Triados", "Em Atend.", "Finalizado", "Média Sessões (finalizados)"],
        rows: tagBreakdown.map(t => [t.tag, t.total, t.filaEspera, t.triagem, t.triados, t.emAtendimento, t.finalizado, t.avgSessions ?? "—"]),
      });
    }
    if (selectedSections.has("psicologos")) {
      sections.push({
        title: "Desempenho por Psicólogo",
        headers: ["Psicólogo", "Pacientes Ativos", "Sessões no Período", "% Plano Concluído", "Compareceram", "Faltas Justif.", "Faltas Injustif."],
        rows: psicoPerformance.map(p => [p.name, p.activeClients, p.sessionsInPeriod, p.avgCompletion !== null ? `${p.avgCompletion}%` : "—", p.compareceu, p.faltaJustificada, p.faltaInjustificada]),
      });
    }
    if (selectedSections.has("triagem")) {
      sections.push({
        title: "Triagem por Psicólogo (no período)",
        headers: ["Psicólogo", "Casos movidos p/ Triagem", "Casos movidos p/ Triados"],
        rows: triagemRows.map(r => [r.name, r.triagem, r.triados]),
      });
    }
    if (selectedSections.has("coorte")) {
      sections.push({
        title: `Coorte ${cohortYear} — Entraram na fila em ${cohortYear}`,
        headers: ["Métrica", "Valor"],
        rows: [
          ["Total de casos que entraram em " + cohortYear, cohortClients.length],
          ["Já atendidos no período filtrado", cohortAttendedInPeriod.length],
          ["Ainda aguardando (fila/triagem/triados)", cohortStillWaiting.length],
        ],
      });
    }
    if (selectedSections.has("vinculo")) {
      sections.push({
        title: "Público por Vínculo",
        headers: ["Vínculo", "Quantidade", "% do total"],
        rows: byAffiliation.sort((a, b) => b.count - a.count).map(a => [a.name, a.count, `${Math.round(a.count / totalClients * 100)}%`]),
      });
    }

    const docDef = buildRelatorioDocDefinition(periodLabel, sections);
    downloadPdf(docDef, `relatorio-psicologia-${startDate}-a-${endDate}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold text-gray-900 mb-2">Métricas e Relatórios</h1>
           <p className="text-gray-500">Visão gerencial da clínica inter-setorial.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
             <div className="flex flex-col px-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Data Inicial</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="outline-none text-sm font-bold text-gray-800 bg-transparent" />
             </div>
             <div className="text-gray-300 font-light">-</div>
             <div className="flex flex-col px-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Data Final</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="outline-none text-sm font-bold text-gray-800 bg-transparent" />
             </div>
          </div>
          <button onClick={handleExportPdf} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm shrink-0">
             <Download size={18} /> Exportar PDF
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Seções incluídas na exportação</p>
        <div className="flex flex-wrap gap-2">
          {SECTION_OPTIONS.map(opt => (
            <button key={opt.key} type="button" onClick={() => toggleSection(opt.key)}
              className={cn("text-xs px-3 py-1.5 rounded-full font-bold border transition-colors", selectedSections.has(opt.key) ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><Activity size={16}/> Volume Total</h4>
            <div className="text-4xl font-black text-gray-900">{totalAtendimentos}</div>
            <p className="text-xs text-gray-400 mt-2">Prontuários salvos no período</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><Clock size={16}/> Origem vs Término</h4>
            <div className="flex items-end gap-2 text-4xl font-black text-gray-900">
               {inWaitlist.length} <span className="text-xl text-gray-400 font-medium mb-1">/ {completedOrActive.length}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Na fila x Em atendimento (ou concluídos)</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><BarChartIcon size={16}/> Média de Retorno</h4>
            <div className="text-4xl font-black text-blue-600">{avgAtendimentos}</div>
            <p className="text-xs text-gray-400 mt-2">Sessões por paciente ativo</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><CheckCircle size={16}/> Testes Aplicados</h4>
            <div className="text-4xl font-black text-purple-600">{totalAvaliacoes}</div>
            <p className="text-xs text-gray-400 mt-2">Instrumentos consumidos no período</p>
         </div>
      </div>

      <div>
         <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Presença em atendimentos individuais no período (não inclui sessões de grupo)</p>
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
               <div>
                  <h4 className="text-gray-500 font-medium text-sm mb-1">Compareceram</h4>
                  <div className="text-3xl font-black text-emerald-600">{countCompareceu}</div>
               </div>
               <TrendingUp className="text-emerald-200" size={32} />
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
               <div>
                  <h4 className="text-gray-500 font-medium text-sm mb-1">Faltas Justificadas</h4>
                  <div className="text-3xl font-black text-amber-600">{countFaltaJustificada}</div>
               </div>
               <Clock className="text-amber-200" size={32} />
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
               <div>
                  <h4 className="text-gray-500 font-medium text-sm mb-1">Faltas Injustificadas</h4>
                  <div className="text-3xl font-black text-red-600">{countFaltaInjustificada}</div>
               </div>
               <Activity className="text-red-200" size={32} />
            </div>
         </div>
         <p className="text-xs text-gray-400 mt-2">{withAttendance.length} agendamento(s) individual(is) com presença registrada no período — o total pode ser menor que o volume geral porque alguns agendamentos ainda estão como "pendente" ou são sessões de grupo.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Users className="text-blue-600"/> Desempenho por Psicólogo</h3>
         <p className="text-xs text-gray-400 mb-6">
            "% do plano" compara sessões realizadas com o total previsto para cada paciente ativo — mais justo do que somar sessões brutas, já que cada caso tem um plano de tamanho diferente.
         </p>
         <div className="overflow-x-auto">
            <table className="w-full text-sm">
               <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase font-bold border-b border-gray-100">
                     <th className="pb-3 pr-4">Psicólogo</th>
                     <th className="pb-3 pr-4">Pacientes ativos</th>
                     <th className="pb-3 pr-4">Sessões no período</th>
                     <th className="pb-3 pr-4">% do plano concluído (média)</th>
                     <th className="pb-3 pr-4">Compareceram</th>
                     <th className="pb-3 pr-4">Faltas Justif.</th>
                     <th className="pb-3">Faltas Injustif.</th>
                  </tr>
               </thead>
               <tbody>
                  {psicoPerformance.map(p => (
                     <tr key={p.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-gray-800">{p.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{p.activeClients}</td>
                        <td className="py-3 pr-4 text-gray-600">{p.sessionsInPeriod}</td>
                        <td className="py-3 pr-4">
                           {p.avgCompletion !== null ? (
                              <span className={cn("font-bold", p.avgCompletion >= 90 ? "text-red-600" : p.avgCompletion >= 70 ? "text-amber-600" : "text-emerald-600")}>
                                 {p.avgCompletion}%
                              </span>
                           ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 pr-4 font-bold text-emerald-600">{p.compareceu}</td>
                        <td className="py-3 pr-4 font-bold text-amber-600">{p.faltaJustificada}</td>
                        <td className="py-3 font-bold text-red-600">{p.faltaInjustificada}</td>
                     </tr>
                  ))}
                  {psicoPerformance.length === 0 && (
                     <tr><td colSpan={7} className="py-6 text-center text-gray-400">Nenhum psicólogo cadastrado ainda.</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
               <h4 className="text-gray-500 font-medium text-sm mb-1">Pacientes distintos atendidos no período</h4>
               <div className="text-3xl font-black text-gray-900">{atendidosNoPeriodo}</div>
            </div>
            <Activity className="text-blue-200" size={36} />
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
               <h4 className="text-gray-500 font-medium text-sm mb-1">Em atendimento agora (total geral)</h4>
               <div className="text-3xl font-black text-emerald-600">{emAtendimentoAgora}</div>
            </div>
            <Users className="text-emerald-200" size={36} />
         </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Tag className="text-blue-600" size={18} /> Métricas por Tag</h3>
         <p className="text-xs text-gray-400 mb-6">Contagem por status e média de sessões dos casos já finalizados com cada tag (não é filtrado por período — é uma foto de agora).</p>
         <div className="overflow-x-auto">
            <table className="w-full text-sm">
               <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase font-bold border-b border-gray-100">
                     <th className="pb-3 pr-4">Tag</th>
                     <th className="pb-3 pr-4">Total</th>
                     <th className="pb-3 pr-4">Fila</th>
                     <th className="pb-3 pr-4">Triagem</th>
                     <th className="pb-3 pr-4">Triados</th>
                     <th className="pb-3 pr-4">Em Atend.</th>
                     <th className="pb-3 pr-4">Finalizado</th>
                     <th className="pb-3">Média Sessões (finalizados)</th>
                  </tr>
               </thead>
               <tbody>
                  {tagBreakdown.sort((a, b) => b.total - a.total).map(t => (
                     <tr key={t.tag} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-gray-800">{t.tag}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.total}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.filaEspera}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.triagem}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.triados}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.emAtendimento}</td>
                        <td className="py-3 pr-4 text-gray-600">{t.finalizado}</td>
                        <td className="py-3 font-bold text-gray-700">{t.avgSessions ?? "—"}</td>
                     </tr>
                  ))}
                  {tagBreakdown.length === 0 && (
                     <tr><td colSpan={8} className="py-6 text-center text-gray-400">Nenhum paciente com tags cadastradas ainda.</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><History className="text-blue-600" size={18} /> Triagem por Psicólogo (no período)</h3>
         <p className="text-xs text-gray-400 mb-6">Baseado no histórico de mudança de status de cada caso — mostra quem realizou a triagem/classificação de risco.</p>
         <div className="overflow-x-auto">
            <table className="w-full text-sm">
               <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase font-bold border-b border-gray-100">
                     <th className="pb-3 pr-4">Psicólogo</th>
                     <th className="pb-3 pr-4">Casos movidos p/ Triagem</th>
                     <th className="pb-3">Casos movidos p/ Triados</th>
                  </tr>
               </thead>
               <tbody>
                  {triagemRows.map(r => (
                     <tr key={r.name} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-gray-800">{r.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{r.triagem}</td>
                        <td className="py-3 text-gray-600">{r.triados}</td>
                     </tr>
                  ))}
                  {triagemRows.length === 0 && (
                     <tr><td colSpan={3} className="py-6 text-center text-gray-400">Nenhuma movimentação de triagem registrada no período.</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Layers className="text-blue-600" size={18} /> Coorte por Ano de Entrada na Fila</h3>
            <select value={cohortYear} onChange={e => setCohortYear(Number(e.target.value))} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold outline-none">
               {waitlistYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
         </div>
         <p className="text-xs text-gray-400 mb-6">Ex: de quem entrou na fila em {cohortYear}, quantos já foram atendidos dentro do período filtrado acima.</p>
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-2xl p-4 text-center">
               <div className="text-3xl font-black text-gray-900">{cohortClients.length}</div>
               <p className="text-xs text-gray-500 mt-1">Entraram em {cohortYear}</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
               <div className="text-3xl font-black text-emerald-700">{cohortAttendedInPeriod.length}</div>
               <p className="text-xs text-emerald-600 mt-1">Já atendidos no período filtrado</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 text-center">
               <div className="text-3xl font-black text-amber-700">{cohortStillWaiting.length}</div>
               <p className="text-xs text-amber-600 mt-1">Ainda aguardando (fila/triagem/triados)</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><Users className="text-blue-600"/> Público por Vínculo</h3>
            <div className="space-y-4">
               {byAffiliation.sort((a,b) => b.count - a.count).map(a => (
                  <div key={a.name}>
                     <div className="flex justify-between text-sm font-semibold text-gray-700 mb-1">
                        <span>{a.name}</span>
                        <span>{a.count} ({Math.round(a.count / totalClients * 100)}%)</span>
                     </div>
                     <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round(a.count / totalClients * 100)}%` }} />
                     </div>
                  </div>
               ))}
            </div>
         </div>
         
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Proporção (Titulares vs Dependentes)</h3>
            <div className="flex items-center gap-8 justify-center py-8">
               <div className="relative w-48 h-48 rounded-full border-[1.5rem] border-blue-50 flex items-center justify-center flex-col shadow-inner">
                  <span className="text-3xl font-black text-blue-900">{Math.round(totalTitulares / totalClients * 100)}%</span>
                  <span className="text-xs font-bold text-blue-400 tracking-wider">TITULARES</span>
                  
                  {/* Mock a pie slice visually through border overlay if possible, or leave as conceptual circular representation */}
               </div>
               <div className="relative w-32 h-32 rounded-full border-[1rem] border-purple-50 flex items-center justify-center flex-col shadow-inner">
                  <span className="text-2xl font-black text-purple-900">{Math.round(totalDependentes / totalClients * 100)}%</span>
                  <span className="text-[10px] font-bold text-purple-400 tracking-wider">DEPENDENTES</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
