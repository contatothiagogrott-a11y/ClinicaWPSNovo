import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { LayoutDashboard, Users, UserCog, Settings, Calendar, Clock, LogOut, ChevronDown, ChevronRight, ShieldAlert, Bell, X } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { cn } from "../lib/utils";

interface ApptNotification {
  id: string;
  clientName: string;
  time: string;
  room: string;
  psychoName: string;
}

export default function Layout() {
  const { currentUser, setCurrentUser, users, appointments, clients } = useStore();
  const location = useLocation();
  const [isGestaoOpen, setIsGestaoOpen] = useState(true);
  const [isAtendimentosOpen, setIsAtendimentosOpen] = useState(true);
  const [notifications, setNotifications] = useState<ApptNotification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;

    // Check for appointments in 15 minutes every minute
    const interval = setInterval(() => {
       const now = new Date();
       const currentHours = now.getHours();
       const currentMinutes = now.getMinutes();
       
       const todayStr = now.toISOString().split('T')[0];
       
       const upcomingAppts = appointments.filter(a => {
          if (a.date !== todayStr) return false;
          
          // Only show for the psycho assigned, or if current user is admin/supervisor
          if (currentUser.role === "PSICO" && a.psicoId !== currentUser.id) return false;

          const [appHourStr, appMinStr] = a.time.split(":");
          const appHour = parseInt(appHourStr, 10);
          const appMin = parseInt(appMinStr, 10);
          
          const timeDiffMins = (appHour * 60 + appMin) - (currentHours * 60 + currentMinutes);
          
          return timeDiffMins > 0 && timeDiffMins <= 15;
       });

       const newNotifs: ApptNotification[] = upcomingAppts.map(a => {
          const clientName = a.groupId ? "Sessão de Grupo" : clients.find(c => c.id === a.clientId)?.fullName || "Paciente Removido";
          const psychoName = users.find(u => u.id === a.psicoId)?.name || "Psicólogo";
          
          return {
             id: a.id,
             clientName,
             time: a.time,
             room: a.roomId,
             psychoName
          };
       }).filter(n => !dismissedNotifications.has(n.id));

       setNotifications(newNotifs);

    }, 15000); // Check every 15 seconds to be somewhat responsive, even if it's meant for minute-level

    return () => clearInterval(interval);
  }, [appointments, currentUser, clients, users, dismissedNotifications]);

  const dismissNotification = (id: string) => {
     setDismissedNotifications(prev => new Set(prev).add(id));
     setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (!currentUser) return <Navigate to="/login" replace />;

  const atendimentosItems = [
    { name: "Agenda", path: "/agenda" },
    { name: "Fila de Espera", path: "/waitlist" },
    { name: "Em Atendimento", path: "/active" },
    { name: "Grupos", path: "/groups" }, 
    { name: "Finalizados", path: "/finished" },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 flex-col md:flex-row font-sans">
      {/* Barra superior com usuário logado e logout real (sessão via cookie httpOnly) */}
      <div className="fixed top-0 inset-x-0 z-[60] bg-indigo-900 text-white text-xs px-4 py-1 flex items-center justify-between shadow-md">
        <span className="font-medium">{currentUser.name} - {currentUser.role === "PSICO" ? "Psicólogo" : currentUser.role === "SUPERVISOR" ? "Supervisor" : "Administrativo"}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentUser(null)}
            className="text-white hover:text-red-200 ml-2 flex items-center gap-1"
            title="Sair"
          >
             <LogOut size={16} /> Sair
          </button>
        </div>
      </div>

      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-gray-200 bg-white pt-10 z-50">
        <div className="p-6">
           <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition block w-fit">
            <span className="bg-blue-600 text-white p-2 rounded-xl shadow-sm text-sm">
              <Users size={20} />
            </span>
            <h1 className="text-2xl font-bold text-gray-900">
               Clínica Admin
            </h1>
           </NavLink>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-2 overflow-y-auto pb-6">
           {/* Section: Atendimentos */}
           <div>
              <button
                 onClick={() => setIsAtendimentosOpen(!isAtendimentosOpen)}
                 className="w-full flex items-center justify-between px-2 py-2 text-sm font-bold tracking-wider text-gray-400 uppercase hover:text-gray-900 transition mb-1"
              >
                 <span>Atendimentos</span>
                 {isAtendimentosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {isAtendimentosOpen && (
                 <div className="space-y-1">
                    {atendimentosItems.map((item) => {
                      const isActive = location.pathname.startsWith(item.path);
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={cn(
                            "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-blue-600" : "bg-transparent")} />
                          {item.name}
                        </NavLink>
                      );
                    })}
                 </div>
              )}
           </div>

          {/* Section: Gestão */}
          {(currentUser.role === "SUPERVISOR" || currentUser.role === "ADMIN") && (
             <div className="pt-4 border-t border-gray-100 mt-4">
                <button
                   onClick={() => setIsGestaoOpen(!isGestaoOpen)}
                   className="w-full flex items-center justify-between px-2 py-2 text-sm font-bold tracking-wider text-gray-400 uppercase hover:text-gray-900 transition mb-1"
                >
                   <span className="flex items-center gap-2">Gestão</span>
                   {isGestaoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                
                {isGestaoOpen && (
                   <div className="space-y-1">
                      <NavLink
                         to="/atendimentos"
                         className={cn(
                           "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                           location.pathname === "/atendimentos"
                             ? "bg-amber-50 text-amber-700"
                             : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                         )}
                      >
                         <div className={cn("w-1.5 h-1.5 rounded-full", location.pathname === "/atendimentos" ? "bg-amber-600" : "bg-transparent")} />
                         Atendimentos
                      </NavLink>
                      <NavLink
                         to="/metrics"
                         className={cn(
                           "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                           location.pathname === "/metrics" || location.pathname === "/dashboard"
                             ? "bg-amber-50 text-amber-700"
                             : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                         )}
                      >
                         <div className={cn("w-1.5 h-1.5 rounded-full", (location.pathname === "/metrics" || location.pathname === "/dashboard") ? "bg-amber-600" : "bg-transparent")} />
                         Métricas e Relatórios
                      </NavLink>
                      <NavLink
                         to="/inventory"
                         className={cn(
                           "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                           location.pathname === "/inventory"
                             ? "bg-amber-50 text-amber-700"
                             : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                         )}
                      >
                         <div className={cn("w-1.5 h-1.5 rounded-full", location.pathname === "/inventory" ? "bg-amber-600" : "bg-transparent")} />
                         Inventário de Testes
                      </NavLink>
                      {currentUser.role === "SUPERVISOR" && (
                         <>
                         <NavLink
                            to="/users"
                            className={cn(
                              "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                              location.pathname === "/users"
                                ? "bg-amber-50 text-amber-700"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            )}
                         >
                            <div className={cn("w-1.5 h-1.5 rounded-full", location.pathname === "/users" ? "bg-amber-600" : "bg-transparent")} />
                            Gerenciar Usuários
                         </NavLink>
                         <NavLink
                            to="/capacity"
                            className={cn(
                              "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                              location.pathname === "/capacity"
                                ? "bg-amber-50 text-amber-700"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            )}
                         >
                            <div className={cn("w-1.5 h-1.5 rounded-full", location.pathname === "/capacity" ? "bg-amber-600" : "bg-transparent")} />
                            Quadro Clínico
                         </NavLink>
                         </>
                      )}
                      <NavLink
                         to="/settings"
                         className={cn(
                           "flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold gap-3",
                           location.pathname === "/settings"
                             ? "bg-amber-50 text-amber-700"
                             : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                         )}
                      >
                         <div className={cn("w-1.5 h-1.5 rounded-full", location.pathname === "/settings" ? "bg-amber-600" : "bg-transparent")} />
                         Configurações
                      </NavLink>
                   </div>
                )}
             </div>
          )}
          
          <div className="pt-4 border-t border-gray-100 mt-4">
             <NavLink
                to="/my-settings"
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 font-bold",
                  location.pathname === "/my-settings"
                    ? "bg-gray-200 text-gray-900 shadow-sm"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Settings size={20} />
                Minha Conta
              </NavLink>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100 mt-auto bg-gray-50 shrink-0">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-full border border-blue-200 bg-white shadow-sm flex items-center justify-center text-blue-600 shrink-0">
              <UserCog size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{currentUser.name}</p>
              <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase truncate">{currentUser.role === "PSICO" ? "Psicólogo" : currentUser.role === "SUPERVISOR" ? "Supervisor" : "Administrativo"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-24 md:pb-0 pt-8 mt-1 lg:mt-5 bg-slate-50 relative">
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-6 inset-x-2 bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-2xl flex justify-around p-2 z-[50]">
        {[
           { name: "Painel", path: "/dashboard", icon: LayoutDashboard },
           { name: "Agenda", path: "/agenda", icon: Calendar },
           { name: "Fila", path: "/waitlist", icon: Clock },
           { name: "Ativos", path: "/active", icon: Users }
        ].map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-full min-w-[64px] transition-all duration-200",
                isActive
                  ? "text-white bg-blue-600 shadow-md"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              <Icon size={20} className={cn("mb-0.5", isActive && "fill-blue-500")} />
              <span className={cn("text-[9px] font-bold whitespace-nowrap", isActive && "font-bold text-white")}>
                 {item.name}
              </span>
            </NavLink>
          );
        })}
        
        {/* Simplified Advanced/Settings access for mobile (using MySettings as representative) */}
        <NavLink
            to="/my-settings"
            className={cn(
              "flex flex-col items-center justify-center p-2 rounded-full min-w-[64px] transition-all duration-200",
              location.pathname === "/my-settings" || location.pathname === "/settings" || location.pathname === "/users"
                ? "text-white bg-blue-600 shadow-md"
                : "text-gray-500 hover:text-gray-900"
            )}
         >
           <Settings size={20} className="mb-0.5" />
           <span className="text-[9px] font-bold">Ajustes</span>
         </NavLink>
      </nav>

      {/* Notifications overlay */}
      <div className="fixed top-12 md:top-6 right-4 md:right-6 z-[100] flex flex-col gap-3">
         {notifications.map(n => (
            <div key={n.id} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72 sm:w-80 animate-in slide-in-from-right-8 fade-in duration-300">
               <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                     <Bell size={16} /> Próximo Atendimento
                  </div>
                  <button onClick={() => dismissNotification(n.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                     <X size={16} />
                  </button>
               </div>
               <h4 className="font-bold text-gray-900 leading-tight mb-1">{n.clientName}</h4>
               <p className="text-sm text-gray-600 font-medium">{n.time} • {n.room}</p>
               <p className="text-xs text-gray-500 mt-2 font-medium bg-gray-50 px-2 py-1 rounded-md inline-block">{n.psychoName}</p>
            </div>
         ))}
      </div>
    </div>
  );
}
