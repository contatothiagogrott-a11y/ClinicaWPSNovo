import { User, Client, Group, AppConfig, Appointment } from "../types";

export function generateSeedData(
  users: User[],
  config: AppConfig
): { clients: Client[]; groups: Group[]; appointments: Appointment[] } {
  const clients: Client[] = [];
  const groups: Group[] = [];
  const appointments: Appointment[] = [];
  const psychos = users.filter((u) => u.role === "PSICO");
  const psico1 = psychos[0] || users[0];
  const psico2 = psychos.length > 1 ? psychos[1] : psico1;

  const generateId = () => Math.random().toString(36).substring(2, 9);
  
  const today = new Date();
  const dateStr = (d: Date) => d.toISOString().split("T")[0];

  // Generate 25 Em Atendimento
  for (let i = 1; i <= 25; i++) {
    clients.push({
      id: generateId(),
      fullName: `Paciente Atendimento ${i}`,
      
      protocolNumber: `PROTO-${i}`, registrationCode: `REG-${i}`, whatsapp: "11999999999", emergencyContactName: "Contato", emergencyContactPhone: "11999999999",
      birthDate: "1990-01-01",
      
      
      status: "EM_ATENDIMENTO",
      affiliation: "Efetivo",
      allocation: "Externo",
      assignedPsicoId: i % 2 === 0 ? psico1.id : psico2.id,
      maxSessions: 10,
      completedSessions: i % 10,
      history: [],
      dateIncluded: dateStr(today),
    });
  }

  // Generate 15 Em Fila de Espera
  for (let i = 1; i <= 15; i++) {
    const includedDate = new Date();
    includedDate.setDate(today.getDate() - i * 10);
    clients.push({
      id: generateId(),
      fullName: `Paciente Fila ${i}`,
      
      protocolNumber: `PROTO-${i}`, registrationCode: `REG-${i}`, whatsapp: "11888888888", emergencyContactName: "Contato", emergencyContactPhone: "11999999999",
      birthDate: "1995-01-01",
      
      
      status: "FILA_ESPERA",
      affiliation: "Estagiário",
      allocation: "Palácio",
      maxSessions: 10,
      completedSessions: 0,
      history: [],
      dateIncluded: dateStr(includedDate),
    });
  }

  // Generate 17 Finalizados
  for (let i = 1; i <= 17; i++) {
    clients.push({
      id: generateId(),
      fullName: `Paciente Finalizado ${i}`,
      
      protocolNumber: `PROTO-${i}`, registrationCode: `REG-${i}`, whatsapp: "11777777777", emergencyContactName: "Contato", emergencyContactPhone: "11999999999",
      birthDate: "1980-01-01",
      
      
      status: "FINALIZADO",
      affiliation: "Dependente",
      dependencyType: "Filho",
      dependencySponsor: "João (MAT-123)",
      allocation: "Unidade Administrativa",
      maxSessions: 10,
      completedSessions: 10,
      history: [],
      dateIncluded: dateStr(today),
    });
  }

  // 3 Grupos: "Ansiedade", "Estágio PAI", "Estágio PAB"
  const g1 = {
    id: generateId(),
    name: "Ansiedade",
    description: "Grupo de manejo de ansiedade",
    psychologistId: psico1.id,
    maxMembers: 10, objective: "Manejo da Ansiedade",
    memberIds: clients.slice(0, 3).map((c) => c.id),
    schedule: "Quartas 14h",
    isActive: true,
    createdAt: dateStr(today),
  };
  const g2 = {
    id: generateId(),
    name: "Estágio PAI",
    description: "Programa de Atenção Infantil",
    psychologistId: psico2.id,
    maxMembers: 8, objective: "Apoio e acolhimento infantil",
    memberIds: clients.slice(3, 8).map((c) => c.id),
    schedule: "Terças 09h",
    isActive: true,
    createdAt: dateStr(today),
  };
  const g3 = {
    id: generateId(),
    name: "Estágio PAB",
    description: "Programa de Atenção Básica",
    psychologistId: psico1.id,
    maxMembers: 12, objective: "Apoio e acompanhamento básico",
    memberIds: clients.slice(8, 12).map((c) => c.id),
    schedule: "Quintas 16h",
    isActive: true,
    createdAt: dateStr(today),
  };
  groups.push(g1, g2, g3);

  // Appointments on today for testing
  const d = dateStr(today);
  const room1 = config.rooms[0]?.name || "Sala 1 - Infantil";
  const room2 = config.rooms[1]?.name || "Sala 2 - Adulto";

  appointments.push(
    { id: generateId(), clientId: clients[0].id, psicoId: clients[0].assignedPsicoId!, roomId: room1, date: d, time: "08:00", endTime: "09:00" },
    { id: generateId(), clientId: clients[1].id, psicoId: clients[1].assignedPsicoId!, roomId: room1, date: d, time: "10:00", endTime: "11:00" },
    { id: generateId(), groupId: g1.id, psicoId: g1.psychologistId, roomId: room2, date: d, time: "14:00", endTime: "15:30" }
  );

  return { clients, groups, appointments };
}
