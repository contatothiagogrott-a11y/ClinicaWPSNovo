import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Plus, Edit2, Check, X, ShieldAlert } from "lucide-react";
import { ConfigItem } from "../types";

function ConfigManager({ title, type, items, onAdd, onUpdate }: { 
  title: string, 
  type: "affiliations" | "allocations" | "rooms" | "tags", 
  items: ConfigItem[], 
  onAdd: (type: any, val: string) => void, 
  onUpdate: (type: any, id: string, updates: Partial<ConfigItem>) => void 
}) {
  const [newVal, setNewVal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const handleAdd = () => {
    if (!newVal.trim()) return;
    onAdd(type, newVal.trim());
    setNewVal("");
  };

  const handleSaveEdit = (id: string) => {
    if (!editVal.trim()) return;
    onUpdate(type, id, { name: editVal.trim() });
    setEditingId(null);
  };

  return (
    <div className="pt-4 first:pt-0 border-t first:border-0 border-gray-100">
      <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wider">{title}</h3>
      <ul className="mb-4 space-y-2 max-h-48 overflow-y-auto">
        {items.map(item => (
          <li key={item.id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${item.isActive ? 'bg-gray-50 border-gray-100' : 'bg-red-50/50 border-red-100 opacity-75'}`}>
             {editingId === item.id ? (
                <div className="flex-1 flex gap-2 w-full">
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} type="text" className="flex-1 min-w-0 bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => handleSaveEdit(item.id)} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Check size={16}/></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"><X size={16}/></button>
                </div>
             ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${item.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className={`text-sm font-bold ${!item.isActive && 'text-gray-500 line-through'}`}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.isActive && (
                      <button onClick={() => { setEditingId(item.id); setEditVal(item.name); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => onUpdate(type, item.id, { isActive: !item.isActive })} 
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${item.isActive ? 'text-red-600 hover:bg-red-100' : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'}`}
                    >
                      {item.isActive ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </>
             )}
          </li>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">Nenhum registro encontrado.</p>}
      </ul>
      <div className="flex gap-2">
        <input value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} type="text" placeholder={`Adicionar ${title}...`} className="flex-1 bg-gray-100 border-2 border-transparent focus:bg-white focus:border-blue-500 px-4 py-2.5 rounded-xl text-sm outline-none transition-all" />
        <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl transition-colors"><Plus size={20}/></button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { config, addConfigItem, updateConfigItem, currentUser, limparProntuariosVazios, realinharAutoria, removerDuplicatasDeGrupo, gerarProntuariosDeGrupo } = useStore();
  const [limpando, setLimpando] = useState(false);
  const [resultadoLimpeza, setResultadoLimpeza] = useState<string>("");
  const [previaAutoria, setPreviaAutoria] = useState<any>(null);
  const [autoriaOcupado, setAutoriaOcupado] = useState(false);
  const [dupGrupo, setDupGrupo] = useState<any>(null);
  const [dupOcupado, setDupOcupado] = useState(false);
  const [gerarGrupo, setGerarGrupo] = useState<any>(null);
  const [gerarOcupado, setGerarOcupado] = useState(false);

  const executarLimpeza = async () => {
    setLimpando(true);
    setResultadoLimpeza("");
    try {
      const n = await limparProntuariosVazios();
      setResultadoLimpeza(
        n === 0
          ? "Nenhum prontuário pendente vazio encontrado."
          : `${n} prontuário(s) pendente(s) vazio(s) removido(s).`
      );
    } catch (err: any) {
      setResultadoLimpeza(err?.message || "Não foi possível concluir a limpeza.");
    } finally {
      setLimpando(false);
    }
  };

  const executarGeracao = async (aplicar: boolean) => {
    setGerarOcupado(true);
    try { setGerarGrupo(await gerarProntuariosDeGrupo(aplicar)); }
    finally { setGerarOcupado(false); }
  };

  const verDuplicatas = async (aplicar: boolean) => {
    setDupOcupado(true);
    try { setDupGrupo(await removerDuplicatasDeGrupo(aplicar)); }
    finally { setDupOcupado(false); }
  };

  const verPrevia = async () => {
    setAutoriaOcupado(true);
    try { setPreviaAutoria(await realinharAutoria(false)); }
    finally { setAutoriaOcupado(false); }
  };

  const aplicarRealinhamento = async () => {
    setAutoriaOcupado(true);
    try { setPreviaAutoria(await realinharAutoria(true)); }
    finally { setAutoriaOcupado(false); }
  };

  if (currentUser?.role !== "SUPERVISOR") {
    return <div className="p-8 text-center text-red-500 font-bold">Acesso restrito ao Supervisor.</div>;
  }

  // O cadastro de equipe vive somente em "Gerenciar Usuários" (/users), onde a
  // senha provisória gerada pelo servidor é exibida uma única vez. Havia aqui
  // uma segunda porta de criação de usuário que inventava a senha no navegador
  // (`Bemvindo1234!`) e a mostrava num alert() — removida.

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações Gerais</h1>
        <p className="text-gray-500">Gerenciamento de tabelas e acessos da clínica.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Atributos da Clínica */}
        <div className="space-y-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 col-span-1 md:col-span-2">
          <h2 className="text-xl font-bold text-gray-900">Tabelas Base</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ConfigManager title="Salas de Atendimento" type="rooms" items={config.rooms} onAdd={addConfigItem} onUpdate={updateConfigItem} />
            <ConfigManager title="Tipos de Vínculo" type="affiliations" items={config.affiliations} onAdd={addConfigItem} onUpdate={updateConfigItem} />
            <ConfigManager title="Unidades e Alocações" type="allocations" items={config.allocations} onAdd={addConfigItem} onUpdate={updateConfigItem} />
            <ConfigManager title="Tags de Demanda" type="tags" items={config.tags || []} onAdd={addConfigItem} onUpdate={updateConfigItem} />
          </div>
        </div>

      </div>

      {/* MANUTENÇÃO ------------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mt-8">
        <h2 className="text-lg font-bold text-gray-900">Manutenção</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Prontuários pendentes em branco se acumulam quando um atendimento é cancelado,
          reagendado ou quando a série é remarcada. Esta limpeza remove apenas os que
          <strong> não têm nenhum conteúdo escrito</strong> e que não correspondem a um
          atendimento realizado.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4 text-xs text-gray-600 space-y-1">
          <p><strong>É removido:</strong> rascunho vazio de sessão futura, de agendamento cancelado ou excluído, e de encontro reagendado.</p>
          <p><strong>É preservado:</strong> qualquer registro com texto, e as pendências de atendimentos que realmente aconteceram.</p>
        </div>
        <button
          onClick={executarLimpeza}
          disabled={limpando}
          className="bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors"
        >
          {limpando ? "Limpando..." : "Limpar prontuários pendentes vazios"}
        </button>
        {resultadoLimpeza && (
          <p className="mt-3 text-sm font-semibold text-gray-700">{resultadoLimpeza}</p>
        )}

        {/* Geração de prontuários de grupo faltantes */}
        <div className="border-t border-gray-100 mt-6 pt-6">
          <h3 className="font-bold text-gray-900">Gerar prontuários faltantes dos grupos</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Cria a documentação individual de cada integrante nos encontros de grupo já agendados —
            é ela que permite registrar a presença ou a falta de cada participante. Use também
            depois de <strong>incluir alguém num grupo</strong>, para gerar os registros dos
            encontros já marcados.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => executarGeracao(false)}
              disabled={gerarOcupado}
              className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-800 font-bold px-5 py-3 rounded-xl text-sm transition-colors"
            >
              {gerarOcupado ? "Verificando..." : "Ver o que está faltando"}
            </button>
            {gerarGrupo?.modo === "previa" && gerarGrupo.total > 0 && (
              <button
                onClick={() => executarGeracao(true)}
                disabled={gerarOcupado}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors"
              >
                Gerar {gerarGrupo.total} prontuário(s)
              </button>
            )}
          </div>
          {gerarGrupo && (
            <div className="mt-3 text-sm text-gray-700">
              {gerarGrupo.modo === "previa" && gerarGrupo.total === 0 ? (
                <p className="font-semibold text-emerald-700">
                  Nenhum prontuário faltando. Todos os encontros de grupo já têm a documentação
                  individual dos integrantes.
                </p>
              ) : (
                <>
                  <p className="font-semibold mb-1">
                    {gerarGrupo.modo === "aplicado"
                      ? `${gerarGrupo.criados} prontuário(s) criado(s):`
                      : `${gerarGrupo.total} prontuário(s) seriam criados:`}
                  </p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {gerarGrupo.porGrupo?.map((g: any, i: number) => (
                      <li key={i}>· <strong>{g.grupo}</strong>: {g.quantidade}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* Duplicatas de grupo */}
        <div className="border-t border-gray-100 mt-6 pt-6">
          <h3 className="font-bold text-gray-900">Remover prontuários de grupo duplicados</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            O prontuário do encontro de grupo estava sendo criado duas vezes — uma pelo
            agendamento e outra ao finalizar o registro coletivo. Esta rotina remove as
            repetições (mesma pessoa, mesmo grupo, mesma data), preservando sempre o registro
            que tem conteúdo escrito.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => verDuplicatas(false)}
              disabled={dupOcupado}
              className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-800 font-bold px-5 py-3 rounded-xl text-sm transition-colors"
            >
              {dupOcupado ? "Verificando..." : "Ver duplicatas encontradas"}
            </button>
            {dupGrupo?.modo === "previa" &&
              (dupGrupo.prontuariosIndividuais > 0 || dupGrupo.registrosColetivos > 0) && (
              <button
                onClick={() => verDuplicatas(true)}
                disabled={dupOcupado}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors"
              >
                Remover duplicatas
              </button>
            )}
          </div>
          {dupGrupo && (
            <div className="mt-3 text-sm text-gray-700 space-y-1">
              <p>
                <strong>{dupGrupo.prontuariosIndividuais}</strong> prontuário(s) individual(is) e{" "}
                <strong>{dupGrupo.registrosColetivos}</strong> registro(s) coletivo(s){" "}
                {dupGrupo.modo === "aplicado" ? "removido(s)." : "seriam removidos."}
              </p>
              {dupGrupo.conflitosParaConferencia > 0 && (
                <p className="text-amber-700">
                  {dupGrupo.conflitosParaConferencia} caso(s) com texto escrito em mais de um
                  registro — não removidos, precisam de conferência humana.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Realinhamento de autoria */}
        <div className="border-t border-gray-100 mt-6 pt-6">
          <h3 className="font-bold text-gray-900">Realinhar autoria dos prontuários</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Corrige registros em que o autor não corresponde ao profissional que estava agendado
            naquele dia — situação comum em prontuários criados antes das últimas correções.
            Só altera registros <strong>sem nenhum texto escrito</strong>.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={verPrevia}
              disabled={autoriaOcupado}
              className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-800 font-bold px-5 py-3 rounded-xl text-sm transition-colors"
            >
              {autoriaOcupado ? "Verificando..." : "Ver o que seria alterado"}
            </button>
            {previaAutoria?.modo === "previa" && previaAutoria.total > 0 && (
              <button
                onClick={aplicarRealinhamento}
                disabled={autoriaOcupado}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors"
              >
                Aplicar nos {previaAutoria.total} registros
              </button>
            )}
          </div>

          {previaAutoria?.modo === "previa" && (
            <div className="mt-4">
              {previaAutoria.total === 0 ? (
                <p className="text-sm font-semibold text-emerald-700">
                  Nenhuma divergência encontrada. Todos os registros já estão vinculados ao
                  profissional correto.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    {previaAutoria.total} registro(s) seriam realinhados:
                  </p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    {previaAutoria.exemplos?.map((e: any, i: number) => (
                      <div key={i} className="px-4 py-2 text-xs border-b border-gray-100 last:border-0 flex flex-wrap gap-x-3">
                        <span className="font-mono text-gray-500">{e.data}</span>
                        <span className="text-gray-400 line-through">{e.autorAtual}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-bold text-gray-900">{e.autorCorreto}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {previaAutoria?.modo === "aplicado" && (
            <p className="mt-3 text-sm font-semibold text-emerald-700">
              {previaAutoria.corrigidos} registro(s) realinhado(s).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
