/**
 * Datas com fuso fixo em America/Sao_Paulo.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * `new Date("2026-07-20")` é interpretado pelo JavaScript como MEIA-NOITE UTC.
 * Ao formatar em Florianópolis (UTC-3), o resultado vira 19/07/2026 — um dia
 * a menos. Era exatamente essa a causa do bug dos atestados.
 *
 * Regra da casa: nenhuma tela e nenhum PDF deve chamar `new Date(string)` ou
 * `toLocaleDateString()` direto. Tudo passa por aqui.
 *
 * Compliance: datas corretas em documentos psicológicos não são detalhe
 * estético — o CFP (Resolução nº 06/2019) exige data e local de emissão
 * fidedignos em atestados, declarações e relatórios, e o prontuário precisa
 * refletir a data real do atendimento para valer como registro documental
 * (Resolução CFP nº 001/2009).
 */

export const APP_TIMEZONE = "America/Sao_Paulo";

/** Strings no formato "YYYY-MM-DD" (data pura, sem hora). */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

type DateInput = string | number | Date | null | undefined;

function splitDateOnly(value: string): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

function toInstant(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (DATE_ONLY_RE.test(raw)) {
    // Meio-dia local: nunca "vira" o dia por causa de fuso ou horário de verão.
    const [y, m, d] = splitDateOnly(raw);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function fmt(value: DateInput, options: Intl.DateTimeFormatOptions): string {
  const instant = toInstant(value);
  if (!instant) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, ...options }).format(instant);
}

/**
 * Converte qualquer entrada em um objeto Date seguro para cálculos e para
 * bibliotecas de calendário (date-fns, react-big-calendar).
 * Datas puras viram meio-dia local em vez de meia-noite UTC.
 */
export function toDate(value: DateInput): Date | null {
  return toInstant(value);
}

/** Igual a toDate, mas nunca retorna null (usa "agora" como fallback). */
export function toDateOrNow(value: DateInput): Date {
  return toInstant(value) ?? new Date();
}

/** 20/07/2026 */
export function formatDateBR(value: DateInput): string {
  if (typeof value === "string" && DATE_ONLY_RE.test(value.trim())) {
    // Caminho literal: sem conversão nenhuma, impossível deslocar o dia.
    const [y, m, d] = splitDateOnly(value.trim());
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  return fmt(value, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** 14:30 */
export function formatTimeBR(value: DateInput): string {
  return fmt(value, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 20/07/2026 14:30 */
export function formatDateTimeBR(value: DateInput): string {
  const date = formatDateBR(value);
  const time = formatTimeBR(value);
  return date && time ? `${date} ${time}` : date;
}

/** 20 de julho de 2026 — usado nos documentos psicológicos. */
export function formatDateExtenso(value: DateInput): string {
  if (typeof value === "string" && DATE_ONLY_RE.test(value.trim())) {
    const [y, m, d] = splitDateOnly(value.trim());
    return `${d} de ${MONTHS_PT[m - 1]} de ${y}`;
  }
  const instant = toInstant(value);
  if (!instant) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} de ${get("month")} de ${get("year")}`;
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 20 de jul às 14:30 — usado na linha do tempo do histórico. */
export function formatTimelineBR(value: DateInput): string {
  const instant = toInstant(value);
  if (!instant) return "";
  const d = fmt(instant, { day: "2-digit", month: "short" });
  return `${d.replace(".", "")} às ${formatTimeBR(instant)}`;
}

/** "YYYY-MM-DD" correspondente ao dia civil em America/Sao_Paulo. */
export function toDateOnly(value: DateInput): string {
  if (typeof value === "string" && DATE_ONLY_RE.test(value.trim())) return value.trim();
  const instant = toInstant(value);
  if (!instant) return "";
  // en-CA produz exatamente YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Hoje ("YYYY-MM-DD") no fuso da instituição — use em <input type="date">. */
export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/** Idade em anos completos, a partir de uma data de nascimento. */
export function ageInYears(birthDate: DateInput): number | null {
  const birth = toInstant(birthDate);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Combina "YYYY-MM-DD" + "HH:mm" num instante correto no fuso da instituição,
 * devolvido em ISO (UTC) para gravar no banco sem ambiguidade.
 */
export function localDateTimeToISO(dateOnly: string, time: string): string {
  const [y, m, d] = splitDateOnly(dateOnly);
  const [hh, mm] = time.split(":").map(Number);
  // Offset de Brasília: -03:00 o ano todo (horário de verão extinto em 2019
  // pelo Decreto nº 9.772/2019). Fixar o offset evita depender do fuso do
  // dispositivo do usuário, que pode estar configurado errado.
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return new Date(iso).toISOString();
}
