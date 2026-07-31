import { decryptField } from "./crypto.js";

/**
 * Lógica PURA da trilha de auditoria: quais campos mudaram e como se chamam.
 *
 * Está separada de `audit.ts` de propósito. Aquele módulo abre conexão com o
 * banco; este não depende de nada externo, o que permite testá-lo isoladamente
 * — e é justamente aqui que mora a garantia mais delicada do sistema: que o
 * log registre o NOME do campo alterado e jamais o seu conteúdo.
 */

// ---------------------------------------------------------------------------
// Rótulos legíveis dos campos do cadastro.
// O log mostra "Nome completo alterado", NUNCA o nome em si.
// ---------------------------------------------------------------------------

/** Campos guardados em texto puro (não sensíveis sob a ótica da LGPD). */
export const PLAIN_FIELD_LABELS: Record<string, string> = {
  protocolNumber: "Número de prontuário",
  registrationCode: "Matrícula",
  affiliation: "Vínculo",
  allocation: "Alocação",
  dependencyType: "Tipo de dependência",
  dependencySponsor: "Titular da dependência",
  status: "Status do caso",
  priority: "Prioridade",
  defaultRoom: "Sala padrão",
  defaultTime: "Horário padrão",
  maxSessions: "Máximo de sessões previstas",
  completedSessions: "Sessões realizadas",
  signedAgreement: "Termo de compromisso",
  tags: "Tags de demanda",
  sector: "Setor",
  workShift: "Turno de trabalho",
  whatsappAuthorized: "Autorização de contato por WhatsApp",
  previouslyAttended: "Atendimento anterior",
  contactMadeByName: "Responsável pelo contato",
  contactStatus: "Status do contato",
  dateIncluded: "Data de inclusão",
  extension: "Ramal",
  alescEntryDate: "Data de ingresso na ALESC",
  needsReview: "Sinalização de revisão",
  contactDate: "Data do contato",
};

/**
 * Campos criptografados (dado pessoal sensível).
 * A chave é o nome recebido do front-end; o valor `column` é a coluna "*Enc".
 */
export const ENCRYPTED_FIELD_LABELS: Record<string, { label: string; column: string }> = {
  fullName: { label: "Nome completo", column: "fullNameEnc" },
  whatsapp: { label: "Telefone/WhatsApp", column: "whatsappEnc" },
  birthDate: { label: "Data de nascimento", column: "birthDateEnc" },
  emergencyContactName: { label: "Contato de emergência (nome)", column: "emergencyContactNameEnc" },
  emergencyContactPhone: { label: "Contato de emergência (telefone)", column: "emergencyContactPhoneEnc" },
  emergencyContactRelationship: { label: "Contato de emergência (parentesco)", column: "emergencyContactRelationshipEnc" },
  residenceCityNeighborhood: { label: "Cidade/bairro de residência", column: "residenceCityNeighborhoodEnc" },
  helpRequest: { label: "Pedido de ajuda", column: "helpRequestEnc" },
  medications: { label: "Medicações em uso", column: "medicationsEnc" },
  contactObservations: { label: "Observações de contato", column: "contactObservationsEnc" },
  diagnosis: { label: "Diagnóstico/CID", column: "diagnosisEnc" },
};

const ASSIGNMENT_LABEL = "Profissional responsável";

/**
 * Compara o que veio no PATCH com o registro atual e devolve apenas os
 * RÓTULOS dos campos realmente alterados. Nenhum valor sai daqui.
 */
export function diffChangedFieldLabels(existing: any, body: Record<string, any>): string[] {
  const labels: string[] = [];

  for (const [key, label] of Object.entries(PLAIN_FIELD_LABELS)) {
    if (!(key in body)) continue;
    const before = existing?.[key];
    const after = body[key];
    if (!valuesAreEqual(before, after)) labels.push(label);
  }

  for (const [key, meta] of Object.entries(ENCRYPTED_FIELD_LABELS)) {
    if (!(key in body)) continue;
    // Decripta só para COMPARAR. O valor nunca é persistido no log nem retornado.
    const before = decryptField(existing?.[meta.column]);
    const after = body[key] === null || body[key] === undefined ? "" : String(body[key]);
    if (before !== after) labels.push(meta.label);
  }

  if ("assignedPsicoId" in body) {
    const before = existing?.assignedPsicoId ?? null;
    const after = body.assignedPsicoId || null;
    if (before !== after) labels.push(ASSIGNMENT_LABEL);
  }

  return labels;
}

function valuesAreEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined || b === "";
  if (b === null || b === undefined) return a === "";
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  }
  if (a instanceof Date) {
    const other = new Date(b);
    return !isNaN(other.getTime()) && a.getTime() === other.getTime();
  }
  return String(a) === String(b);
}

