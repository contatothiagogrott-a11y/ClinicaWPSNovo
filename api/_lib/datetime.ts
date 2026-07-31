/**
 * Datas no servidor, sempre ancoradas em America/Sao_Paulo.
 *
 * A Vercel roda as funções em UTC. Se o servidor gravar `new Date("2026-07-20")`
 * (meia-noite UTC) e o navegador em Florianópolis ler esse valor, ele exibe
 * 19/07. Aqui normalizamos tudo para o MEIO-DIA do dia civil brasileiro:
 * o instante fica no meio do dia, então nenhuma conversão de fuso consegue
 * empurrá-lo para o dia anterior ou seguinte.
 */

export const APP_TIMEZONE = "America/Sao_Paulo";

/** Offset fixo de Brasília (horário de verão extinto pelo Decreto nº 9.772/2019). */
const BRT_OFFSET = "-03:00";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte o que vier do front-end ("YYYY-MM-DD", ISO completo ou Date) num
 * instante seguro para gravar no Postgres.
 */
export function parseDateInput(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (DATE_ONLY_RE.test(raw)) {
    // Meio-dia de Brasília para o dia civil informado.
    const d = new Date(`${raw}T12:00:00${BRT_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Combina "YYYY-MM-DD" + "HH:mm" no fuso da instituição. */
export function parseLocalDateTime(dateOnly: string, time?: string | null): Date | null {
  if (!dateOnly || !DATE_ONLY_RE.test(String(dateOnly).trim())) return parseDateInput(dateOnly);
  const hhmm = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5).padStart(5, "0") : "12:00";
  const d = new Date(`${String(dateOnly).trim()}T${hhmm}:00${BRT_OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" do dia civil brasileiro correspondente ao instante. */
export function toDateOnly(value: Date | null | undefined): string {
  if (!value || isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** ISO completo (UTC) — usado para carimbos de data/hora exatos. */
export function toISO(value: Date | null | undefined): string {
  if (!value || isNaN(value.getTime())) return "";
  return value.toISOString();
}

/**
 * "20/07/2026 14:30" no fuso da instituição — para textos de log.
 *
 * Montado a partir das partes em vez de usar o formato pronto do Intl, que
 * insere vírgula ("20/07/2026, 14:30"). Como este texto vai literalmente para
 * a trilha de auditoria ("Prontuário registrado por ... em <data>"), a
 * pontuação importa para a leitura.
 */
export function formatBR(value: Date | null | undefined): string {
  if (!value || isNaN(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Início do dia civil brasileiro (00:00 BRT) — para filtros de intervalo. */
export function startOfDayBRT(dateOnly: string): Date | null {
  if (!DATE_ONLY_RE.test(String(dateOnly).trim())) return null;
  const d = new Date(`${String(dateOnly).trim()}T00:00:00${BRT_OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}

/** Idade em anos completos a partir de uma data de nascimento. */
export function ageInYears(birth: Date | string | null | undefined): number | null {
  const d = parseDateInput(birth);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
