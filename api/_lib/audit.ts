import crypto from "crypto";
import { prisma } from "./prisma.js";
import { formatBR } from "./datetime.js";

/**
 * TRILHA DE AUDITORIA (LGPD + CFP)
 * =================================
 *
 * Dois registros distintos, com finalidades distintas:
 *
 * 1) HistoryLog  → o QUE mudou no caso (escrita). Append-only.
 * 2) AccessLog   → QUEM LEU/EXPORTOU dado sensível (leitura). Append-only.
 *
 * REGRA DE SIGILO ABSOLUTO
 * ------------------------
 * O log JAMAIS armazena conteúdo clínico. Quando um prontuário/evolução é
 * escrito ou retificado, gravamos apenas a METAINFORMAÇÃO:
 *
 *     "Prontuário registrado por Fulana de Tal (Psicólogo) em 20/07/2026 14:30"
 *
 * Fundamento: o sigilo profissional é dever do psicólogo (Art. 9º do Código de
 * Ética Profissional do Psicólogo) e o prontuário só pode ser acessado por quem
 * presta o atendimento (Resolução CFP nº 001/2009). O Administrativo tem acesso
 * legítimo à trilha de auditoria para fins de controle institucional, mas isso
 * não pode se converter em porta lateral para o conteúdo clínico — por isso a
 * metainformação e o conteúdo vivem em tabelas e rotas separadas.
 *
 * LGPD: o princípio da necessidade (Art. 6º, III) impede o log de guardar mais
 * do que o indispensável. Por decisão do cliente, alterações de cadastro
 * registram apenas O NOME DO CAMPO alterado, nunca o valor anterior ou novo.
 */

export type HistoryCategory =
  | "CADASTRO"
  | "CLINICO"
  | "DOCUMENTO"
  | "TRANSFERENCIA"
  | "FLUXO"
  | "SISTEMA";

export interface Actor {
  userId: string;
  name: string;
  role: "SUPERVISOR" | "ADMIN" | "PSICO";
}

const ROLE_LABELS: Record<string, string> = {
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrativo",
  PSICO: "Psicólogo",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// Rótulos e cálculo de diferença vivem em auditFields.ts (lógica pura,
// testável sem banco). Reexportados aqui para não quebrar quem já importa.
export {
  PLAIN_FIELD_LABELS,
  ENCRYPTED_FIELD_LABELS,
  diffChangedFieldLabels,
} from "./auditFields.js";

// ---------------------------------------------------------------------------
// Escrita da trilha
// ---------------------------------------------------------------------------

interface HistoryInput {
  clientId: string;
  actor: Actor;
  action: string;
  category: HistoryCategory;
  /** Texto curto e NÃO clínico. Fica criptografado em repouso. */
  details?: string | null;
}

/**
 * Grava uma entrada de histórico. Nunca lança: uma falha de auditoria não pode
 * derrubar o atendimento, mas é registrada no console para investigação.
 */
export async function writeHistory(input: HistoryInput): Promise<void> {
  try {
    const { encryptField } = await import("./crypto.js");
    await prisma.historyLog.create({
      data: {
        clientId: input.clientId,
        actorId: input.actor.userId,
        action: input.action,
        category: input.category,
        detailsEnc: input.details ? encryptField(input.details) : null,
      },
    });
  } catch (err) {
    console.error("[auditoria] falha ao gravar HistoryLog:", err);
  }
}

/** Alteração de cadastro: registra apenas os NOMES dos campos alterados. */
export async function logClientFieldChanges(
  clientId: string,
  actor: Actor,
  changedLabels: string[]
): Promise<void> {
  if (changedLabels.length === 0) return;
  await writeHistory({
    clientId,
    actor,
    category: "CADASTRO",
    action: "Cadastro do paciente alterado",
    // Só rótulos de campo — sem valor anterior, sem valor novo (LGPD Art. 6º, III).
    details: `Campos alterados: ${changedLabels.join(", ")}.`,
  });
}

/** Transferência de responsável — exige justificativa (não clínica). */
export async function logClientTransfer(
  clientId: string,
  actor: Actor,
  fromName: string,
  toName: string,
  reason: string
): Promise<void> {
  await writeHistory({
    clientId,
    actor,
    category: "TRANSFERENCIA",
    action: "Profissional responsável alterado",
    details: `De: ${fromName || "Não atribuído"} → Para: ${toName || "Não atribuído"}. Justificativa: ${reason}`,
  });
}

/**
 * Prontuário/evolução clínica.
 *
 * *** NUNCA RECEBE O CONTEÚDO DO PRONTUÁRIO. ***
 * A assinatura desta função é propositalmente incapaz de aceitar o texto
 * clínico: só entra metainformação. Isso é uma barreira de projeto, não uma
 * convenção que alguém possa esquecer de seguir.
 */
export async function logClinicalRecord(
  clientId: string,
  actor: Actor,
  kind: "REGISTRO" | "RETIFICACAO" | "RASCUNHO",
  when: Date
): Promise<void> {
  const verb =
    kind === "REGISTRO" ? "Prontuário registrado" :
    kind === "RETIFICACAO" ? "Prontuário retificado" :
    "Rascunho de prontuário salvo";

  await writeHistory({
    clientId,
    actor,
    category: "CLINICO",
    action: `${verb} por ${actor.name} (${roleLabel(actor.role)}) em ${formatBR(when)}`,
    details: null, // conteúdo clínico jamais vai para a auditoria
  });
}

/** Emissão/exportação de documento psicológico ou de PDF do prontuário. */
export async function logDocumentEvent(
  clientId: string,
  actor: Actor,
  documentLabel: string,
  event: "EMISSAO" | "EXPORTACAO"
): Promise<void> {
  const verb = event === "EMISSAO" ? "emitido" : "exportado em PDF";
  await writeHistory({
    clientId,
    actor,
    category: "DOCUMENTO",
    action: `${documentLabel} ${verb} por ${actor.name} (${roleLabel(actor.role)})`,
    details: null,
  });
}

// ---------------------------------------------------------------------------
// Trilha de ACESSO (leitura/exportação de dado sensível)
// ---------------------------------------------------------------------------

/**
 * O IP é dado pessoal (LGPD Art. 5º, I). Guardamos apenas um hash com sal,
 * suficiente para correlacionar acessos suspeitos sem manter o endereço.
 */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.ENCRYPTION_KEY || "";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function logAccess(params: {
  actor: Actor;
  action: string;
  resource: string;
  clientId?: string | null;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        actorId: params.actor.userId,
        action: params.action,
        resource: params.resource,
        clientId: params.clientId ?? null,
        ipHash: hashIp(params.ip),
      },
    });
  } catch (err) {
    console.error("[auditoria] falha ao gravar AccessLog:", err);
  }
}
