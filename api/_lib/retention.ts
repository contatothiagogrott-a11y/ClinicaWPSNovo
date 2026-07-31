import { ageInYears, parseDateInput } from "./datetime.js";

/**
 * TEMPORALIDADE DE GUARDA DO REGISTRO DOCUMENTAL
 * ==============================================
 *
 * Base normativa:
 *  - Resolução CFP nº 001/2009, art. 4º, §1º: guarda mínima de 5 anos do
 *    registro documental após o encerramento do serviço prestado.
 *  - Manual Orientativo de Registro e Elaboração de Documentos Psicológicos:
 *    o prazo de 5 anos NÃO deve ser tomado como parâmetro para crianças e
 *    adolescentes. A orientação é preservar as informações ao menos até a
 *    maioridade (18 anos), quando passam a incidir os prazos prescricionais
 *    gerais — Código Civil, art. 205 (10 anos).
 *  - LGPD Art. 15/16: o dado deve ser eliminado após o fim do tratamento,
 *    ressalvado o cumprimento de obrigação legal — que é justamente o caso
 *    da guarda obrigatória acima.
 *
 * Este módulo apenas CALCULA e REGISTRA a data-limite. Nenhum descarte
 * automático é executado: a eliminação de prontuário é ato deliberado da
 * instituição e deve ser conferida por profissional responsável.
 */

export const RETENTION_YEARS_ADULT = 5;
export const RETENTION_YEARS_AFTER_MAJORITY = 10;
export const MAJORITY_AGE = 18;

function addYears(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Calcula até quando o registro documental do paciente deve ser mantido.
 *
 * @param finalizedAt  data de encerramento do caso
 * @param birthDate    data de nascimento já DECRIPTADA (string ou Date)
 */
export function computeRetentionUntil(
  finalizedAt: Date,
  birthDate: string | Date | null | undefined
): Date {
  const baseline = addYears(finalizedAt, RETENTION_YEARS_ADULT);

  const birth = parseDateInput(birthDate ?? null);
  if (!birth) return baseline; // sem data de nascimento, aplica-se a regra geral

  const age = ageInYears(birth);
  if (age === null || age >= MAJORITY_AGE) return baseline;

  // Criança ou adolescente: guarda até a maioridade + prazo prescricional civil.
  const majorityDate = addYears(birth, MAJORITY_AGE);
  const extended = addYears(majorityDate, RETENTION_YEARS_AFTER_MAJORITY);
  return extended > baseline ? extended : baseline;
}

/** Descreve a regra aplicada, para o texto da trilha de auditoria. */
export function describeRetention(
  retentionUntil: Date,
  birthDate: string | Date | null | undefined
): string {
  const age = ageInYears(parseDateInput(birthDate ?? null));
  const rule =
    age !== null && age < MAJORITY_AGE
      ? `guarda estendida (paciente menor de idade: maioridade + ${RETENTION_YEARS_AFTER_MAJORITY} anos)`
      : `guarda mínima de ${RETENTION_YEARS_ADULT} anos (Res. CFP nº 001/2009, art. 4º, §1º)`;
  return `Prazo de guarda do registro documental definido para ${retentionUntil.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${rule}.`;
}
