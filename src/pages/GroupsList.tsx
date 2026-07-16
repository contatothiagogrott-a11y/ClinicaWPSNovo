import React, { useState } from "react";
import { useStore } from "../contexts/StoreContext";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Users, ArrowRight } from "lucide-react";
import CreateGroupModal from "../components/CreateGroupModal";

export default function GroupsList() {
  const { groups, currentUser } = useStore();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const activeGroups = groups.filter(g => g.isActive);

  return (
    <div className="h-full flex flex-col p-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 mt-4">Grupos Terapêuticos</h1>
          <p className="text-lg text-gray-500 font-medium">Turmas coletivas gerenciadas pela clínica</p>
        </div>
        {(currentUser?.role === "SUPERVISOR" || currentUser?.role === "ADMIN" || currentUser?.role === "PSICO") && (
          <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={20} /> Novo Grupo
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pr-4 -mr-4">
        {activeGroups.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
             <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-300 mb-6">
                <Users size={40} />
             </div>
             <h2 className="text-2xl font-bold text-gray-900 mb-2">Nenhum Grupo</h2>
             <p className="text-gray-500 font-medium text-lg leading-relaxed mb-6">Você ainda não tem grupos terapêuticos ativos cadastrados.</p>
             <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-colors">Criar Primeiro Grupo</button>
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {activeGroups.map(group => (
                <div key={group.id} onClick={() => navigate(`/group/${group.id}`)} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 cursor-pointer transition-all group flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                       <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600">{group.name}</h3>
                       <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-bold leading-none flex items-center gap-1.5">
                          <Users size={12}/> {group.memberIds.length}
                       </span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{group.objective}</p>
                  </div>
                  <div className="mt-6 flex justify-end">
                     <div className="w-10 h-10 bg-gray-50 group-hover:bg-blue-600 rounded-full flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                        <ArrowRight size={18} />
                     </div>
                  </div>
                </div>
             ))}
           </div>
        )}
      </div>

      {showCreate && <CreateGroupModal open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
