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
  const { config, addConfigItem, updateConfigItem, users, addUser, currentUser } = useStore();
  
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "PSICO" as any, title: "", crp: "" });

  if (currentUser?.role !== "SUPERVISOR") {
    return <div className="p-8 text-center text-red-500 font-bold">Acesso restrito ao Supervisor.</div>;
  }

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if(!newUser.name || !newUser.email) return;
    const tempPassword = `Bemvindo${Math.floor(1000 + Math.random() * 9000)}!`;
    addUser({ ...newUser, password: tempPassword });
    setNewUser({ name: "", email: "", role: "PSICO", title: "", crp: "" });
    alert(`Usuário adicionado com sucesso! Senha temporária: ${tempPassword}`);
  };

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
    </div>
  );
}
