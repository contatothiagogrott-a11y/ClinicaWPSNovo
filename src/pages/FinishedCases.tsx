import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { Client } from "../types";
import { Search, UserCheck, UserX } from "lucide-react";
import { cn } from "../lib/utils";
import { formatDateBR } from "../lib/datetime";

const FinishedCard: React.FC<{ client: Client; cancelado?: boolean }> = ({ client, cancelado }) => {
  const navigate = useNavigate();

  return (
    <div 
      onClick={() => navigate(`/client/${client.id}`)}
      className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center font-bold",
          cancelado ? "bg-gray-200 text-gray-500" : "bg-emerald-100 text-emerald-600"
        )}>
          {client.fullName.charAt(0)}
        </div>
        <div>
          <h3 className="font-bold text-gray-900 leading-tight group-hover:text-amber-600 transition-colors uppercase tracking-tight">{client.fullName}</h3>
          <p className="text-sm text-gray-500 font-medium">Desligado(a) / Alta</p>
        </div>
      </div>
      
      <div className="text-right">
        <h4 className="text-xs uppercase tracking-wider font-bold text-gray-400">Total de Sessões</h4>
        <p className="font-bold text-gray-900">{client.completedSessions}</p>
      </div>
    </div>
  );
};

export default function FinishedCases() {
  const { clients } = useStore();
  const [searchTerm, setSearchTerm] = useState("");

  /**
   * Duas abas, propositalmente separadas:
   *  FINALIZADO — houve atendimento e o caso encerrou (alta, desligamento).
   *  CANCELADO  — a pessoa entrou na fila mas nunca foi atendida.
   *
   * Misturar os dois inflaria o indicador de casos atendidos do setor e
   * criaria prazo de guarda documental para quem não recebeu serviço.
   */
  const [aba, setAba] = useState<"FINALIZADO" | "CANCELADO">("FINALIZADO");

  const finalizados = clients.filter(c => c.status === "FINALIZADO");
  const cancelados = clients.filter(c => c.status === "CANCELADO");
  const lista = aba === "FINALIZADO" ? finalizados : cancelados;

  const filtered = lista.filter(c =>
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.registrationCode || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 mt-4">Casos Encerrados</h1>
        <p className="text-lg text-gray-500 font-medium">
          {aba === "FINALIZADO"
            ? "Pacientes que receberam alta ou foram desligados"
            : "Pessoas que entraram na fila mas não chegaram a ser atendidas"}
        </p>
      </header>

      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl mb-6 w-fit">
        {([
          ["FINALIZADO", "Finalizados", finalizados.length, UserCheck],
          ["CANCELADO", "Cancelados", cancelados.length, UserX],
        ] as const).map(([valor, rotulo, total, Icone]) => (
          <button
            key={valor}
            onClick={() => setAba(valor)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors",
              aba === valor ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Icone size={16} /> {rotulo}
            <span className={cn(
              "text-[11px] px-2 py-0.5 rounded-md",
              aba === valor ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-500"
            )}>{total}</span>
          </button>
        ))}
      </div>

      <div className="mb-8">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou matrícula..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border-none rounded-2xl pl-12 pr-4 py-4 text-gray-900 shadow-sm focus:ring-2 focus:ring-amber-500 outline-none font-medium transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-4 -mr-4">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
             <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-6">
                <UserCheck size={40} />
             </div>
             <h2 className="text-2xl font-bold text-gray-900 mb-2">Sem Resultados</h2>
             <p className="text-gray-500 font-medium text-lg leading-relaxed">Nenhum paciente finalizado na clínica no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(client => (
              <FinishedCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
