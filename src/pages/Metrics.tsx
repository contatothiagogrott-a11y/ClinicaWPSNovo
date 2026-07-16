import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { BarChart, Users, Activity, CheckCircle, Clock } from "lucide-react";
import { cn } from "../lib/utils";

export default function Metrics() {
  const { clients, sessions, instruments, instrumentLogs, config } = useStore();
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold text-gray-900 mb-2">Métricas e Relatórios</h1>
           <p className="text-gray-500">Visão gerencial da clínica inter-setorial.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm w-full sm:w-auto">
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
      </header>

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
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><BarChart size={16}/> Média de Retorno</h4>
            <div className="text-4xl font-black text-blue-600">{avgAtendimentos}</div>
            <p className="text-xs text-gray-400 mt-2">Sessões por paciente ativo</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h4 className="text-gray-500 font-medium text-sm mb-2 flex items-center gap-2"><CheckCircle size={16}/> Avaliações Aplicadas</h4>
            <div className="text-4xl font-black text-purple-600">{totalAvaliacoes}</div>
            <p className="text-xs text-gray-400 mt-2">Instrumentos consumidos no período</p>
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
