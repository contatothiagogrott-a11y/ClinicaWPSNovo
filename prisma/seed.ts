/**
 * Seed inicial do banco (Neon/Postgres).
 * Roda MANUALMENTE com: npm run db:seed
 *
 * MUDANÇA IMPORTANTE: o seed NÃO roda mais automaticamente no build.
 * Antes ele era executado a cada deploy, o que é arriscado num sistema com
 * dado real (reintrodução de usuários de demonstração, efeitos colaterais em
 * produção). Agora é um ato deliberado, executado uma única vez.
 *
 * Todos os usuários criados aqui nascem com `mustChangePassword: true`: a
 * senha inicial é provisória e o sistema obriga a troca no primeiro acesso.
 * Isso preserva o não-repúdio da assinatura do prontuário — a credencial
 * precisa ser conhecida apenas pelo titular.
 *
 * Pacientes de exemplo só são criados se SEED_DEMO_DATA=true. Em instalação
 * real, jamais se semeia paciente fictício num banco de prontuários.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encryptField } from "../api/_lib/crypto.js";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

async function main() {
  console.log("Seed: criando usuários...");

  const demoPassword = process.env.SEED_DEMO_PASSWORD || "TrocarSenha!123";

  const roberto = await prisma.user.upsert({
    where: { email: "roberto@clinica.com" },
    update: {},
    create: {
      name: "Roberto (Supervisor)",
      email: "roberto@clinica.com",
      passwordHash: await hash(demoPassword),
      role: "SUPERVISOR",
      // CRP obrigatório: o Supervisor também atende e assina documentos
      // (Resolução CFP nº 06/2019 — nome e CRP no documento psicológico).
      crp: "12/00001",
      gender: "MASCULINO",
      mustChangePassword: true,
    },
  });

  const ana = await prisma.user.upsert({
    where: { email: "ana@clinica.com" },
    update: {},
    create: {
      name: "Ana (Administração)",
      email: "ana@clinica.com",
      passwordHash: await hash(demoPassword),
      role: "ADMIN",
      // Perfil Administrativo não é profissional de psicologia: sem CRP e
      // sem acesso a conteúdo clínico.
      mustChangePassword: true,
    },
  });

  const carolina = await prisma.user.upsert({
    where: { email: "carolina@clinica.com" },
    update: {},
    create: {
      name: "Carolina (Psicóloga)",
      email: "carolina@clinica.com",
      passwordHash: await hash(demoPassword),
      role: "PSICO",
      crp: "12/11111",
      gender: "FEMININO",
      color: "#3b82f6",
      mustChangePassword: true,
    },
  });

  const joao = await prisma.user.upsert({
    where: { email: "joao@clinica.com" },
    update: {},
    create: {
      name: "João (Psicólogo)",
      email: "joao@clinica.com",
      passwordHash: await hash(demoPassword),
      role: "PSICO",
      crp: "12/22222",
      gender: "MASCULINO",
      color: "#f97316",
      mustChangePassword: true,
    },
  });

  console.log(
    `Seed: senha PROVISÓRIA para os usuários acima: "${demoPassword}". ` +
      "O sistema exigirá a troca no primeiro acesso de cada um."
  );

  console.log("Seed: criando itens de configuração...");
  const configSeed: Array<{ type: "AFFILIATION" | "ALLOCATION" | "ROOM" | "TAG"; names: string[] }> = [
    { type: "AFFILIATION", names: ["Efetivo", "Estagiário", "Terceirizado", "À disposição", "Militar", "Comissionado", "Dependente"] },
    { type: "ALLOCATION", names: ["Unidade Administrativa", "Palácio", "Externo"] },
    { type: "ROOM", names: ["Sala 1 - Infantil", "Sala 2 - Adulto", "Sala 3 - Casal", "Sala 4 - Online"] },
    { type: "TAG", names: ["Ansiedade", "Depressão", "TOC", "TDAH", "Casal", "Infantil", "Luto", "Trauma"] },
  ];
  for (const group of configSeed) {
    for (const name of group.names) {
      const exists = await prisma.configItem.findFirst({ where: { type: group.type, name } });
      if (!exists) {
        await prisma.configItem.create({ data: { type: group.type, name, isActive: true } });
      }
    }
  }

  const rooms = await prisma.configItem.findMany({ where: { type: "ROOM" } });

  // Pacientes fictícios só entram quando explicitamente solicitado.
  const seedDemoData = process.env.SEED_DEMO_DATA === "true";
  const existingClients = await prisma.client.count();
  if (!seedDemoData) {
    console.log("Seed: pacientes de exemplo NÃO criados (defina SEED_DEMO_DATA=true para criá-los).");
  }
  if (seedDemoData && existingClients === 0) {
    console.log("Seed: criando pacientes de exemplo...");
    const client1 = await prisma.client.create({
      data: {
        protocolNumber: "PROTO-0001",
        registrationCode: "REG-0001",
        fullNameEnc: encryptField("Paciente Exemplo 1"),
        whatsappEnc: encryptField("11999999999"),
        birthDateEnc: encryptField("1990-01-01"),
        emergencyContactNameEnc: encryptField("Contato de Emergência"),
        emergencyContactPhoneEnc: encryptField("11988888888"),
        affiliation: "Efetivo",
        allocation: "Externo",
        status: "EM_ATENDIMENTO",
        assignedPsicoId: carolina.id,
        maxSessions: 10,
        completedSessions: 2,
        history: { create: [{ actorId: roberto.id, action: "Caso criado (seed inicial)" }] },
      },
    });

    const client2 = await prisma.client.create({
      data: {
        protocolNumber: "PROTO-0002",
        registrationCode: "REG-0002",
        fullNameEnc: encryptField("Paciente Exemplo 2"),
        whatsappEnc: encryptField("11888888888"),
        birthDateEnc: encryptField("1995-05-05"),
        emergencyContactNameEnc: encryptField("Contato de Emergência"),
        emergencyContactPhoneEnc: encryptField("11977777777"),
        affiliation: "Estagiário",
        allocation: "Palácio",
        status: "FILA_ESPERA",
        maxSessions: 10,
        completedSessions: 0,
        history: { create: [{ actorId: roberto.id, action: "Caso criado (seed inicial)" }] },
      },
    });

    console.log("Seed: criando grupo de exemplo...");
    const group = await prisma.group.create({
      data: {
        name: "Ansiedade",
        objective: "Manejo da ansiedade",
        psychologistId: carolina.id,
        members: { create: [{ clientId: client1.id }] },
      },
    });

    console.log("Seed: criando agendamentos de exemplo...");
    const today = new Date();
    if (rooms[0]) {
      await prisma.appointment.create({
        data: {
          clientId: client1.id,
          psicoId: carolina.id,
          roomId: rooms[0].name,
          date: today,
          time: "08:00",
          endTime: "09:00",
        },
      });
    }
    void joao;
    void ana;
    void client2;
    void group;
  } else if (seedDemoData) {
    console.log("Seed: já existem pacientes no banco, pulando criação de exemplos.");
  }

  console.log("Seed concluído com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
