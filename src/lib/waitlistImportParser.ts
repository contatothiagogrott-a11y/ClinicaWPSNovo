import * as XLSX from "xlsx";

/**
 * LEITURA DE PLANILHAS DE FILA DE ESPERA
 * ======================================
 *
 * As listas do setor vêm de origens e gestões diferentes, e não há como
 * padronizá-las. Este módulo foi escrito olhando os arquivos REAIS, e trata
 * cada armadilha encontrada neles:
 *
 *  1. TELEFONE GRAVADO COMO DATA. O Excel marcou células como data com valor
 *     48999216836. Lidas com `cellDates`, viram lixo. Solução: lemos tudo em
 *     bruto e convertemos conforme o TIPO DO CAMPO DE DESTINO, não conforme o
 *     que o Excel acha que a célula é.
 *  2. MATRÍCULA COMO DECIMAL ("13230.0"). E existem matrículas não numéricas
 *     ("MMVV", "os8167"), que são válidas e não podem ser descartadas.
 *  3. CABEÇALHO FORA DA LINHA 1 (a aba "Espera Geral" começa na linha 2) ou
 *     inexistente. Por isso a linha do cabeçalho é escolhida por quem importa.
 *  4. COLUNAS DESLOCADAS. Em algumas linhas há telefone na coluna "Programa"
 *     e a palavra "Estagiário" na coluna "Turno". Não dá para adivinhar a
 *     intenção: essas linhas entram MARCADAS PARA REVISÃO.
 *  5. CAMPOS LIVRES. "Turno" tem 12 variações ("os dois", "8 horas",
 *     "11 as 15"). Importamos como está e sinalizamos.
 *
 * Princípio: nunca descartar uma pessoa da fila por causa de dado sujo, e
 * nunca gravar dado sujo em silêncio. Entra tudo, sinalizado.
 */

// ---------------------------------------------------------------------------
// Definição dos campos
// ---------------------------------------------------------------------------

export type FieldKind =
  | "text"
  | "upper"      // texto normalizado para CAIXA ALTA
  | "date"       // instante (carimbo de data/hora)
  | "dateOnly"   // data pura (nascimento, ingresso)
  | "phone"
  | "boolean"
  | "nameRelationship" // "Maria - Mãe" -> nome + vínculo
  | "note";      // não tem campo próprio: vai para Observações, rotulado

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** Todas as palavras precisam aparecer no cabeçalho (sem acento/caixa). */
  keywords: string[][];
  /** Impede que outro campo roube esta coluna. */
  priority?: number;
}

export const FIELD_DEFS: FieldDef[] = [
  { key: "fullName", label: "Nome do paciente", kind: "upper", priority: 10,
    keywords: [["qual seu nome"], ["nome completo do(a) dependente"], ["nome"]] },
  { key: "dateIncluded", label: "Data de entrada na fila", kind: "date", priority: 9,
    keywords: [["carimbo"], ["data", "hora"], ["data de preenchimento"], ["data de cadastro"]] },
  { key: "birthDate", label: "Data de nascimento", kind: "dateOnly", priority: 9,
    keywords: [["data", "nascimento"]] },
  { key: "registrationCode", label: "Matrícula", kind: "text", priority: 8,
    keywords: [["matricula"]] },
  { key: "affiliation", label: "Vínculo", kind: "text", priority: 7,
    keywords: [["voce e"], ["programa"], ["vinculo com a alesc"]] },
  { key: "sector", label: "Setor", kind: "upper", priority: 7,
    keywords: [["setor"]] },
  { key: "workShift", label: "Turno", kind: "text", priority: 6,
    keywords: [["turno"]] },
  { key: "whatsapp", label: "Telefone / WhatsApp", kind: "phone", priority: 9,
    keywords: [["seu whatsapp"], ["telefone", "whatsapp"], ["telefone para contato"], ["cel"], ["telefone"], ["contato"]] },
  { key: "extension", label: "Ramal", kind: "text", priority: 8,
    keywords: [["ramal"]] },
  { key: "whatsappAuthorized", label: "Autoriza contato por WhatsApp", kind: "boolean", priority: 8,
    keywords: [["autoriza"]] },
  { key: "previouslyAttended", label: "Já foi atendido antes", kind: "boolean", priority: 8,
    keywords: [["ja foi atendido"], ["atendido anteriormente"], ["ja realizou acompanhamento"]] },
  { key: "residenceCityNeighborhood", label: "Cidade / bairro", kind: "text", priority: 6,
    keywords: [["cidade", "bairro"], ["endereco"]] },
  { key: "helpRequest", label: "Pedido de ajuda", kind: "text", priority: 7,
    keywords: [["pode lhe ajudar"], ["pode ajuda"], ["poderiamos auxiliar"], ["motivo da solicitacao"], ["demanda"]] },
  { key: "medications", label: "Medicações em uso", kind: "text", priority: 8,
    keywords: [["medicamento"]] },
  { key: "diagnosis", label: "Diagnóstico / CID", kind: "text", priority: 9,
    keywords: [["diagnostico"]] },
  { key: "alescEntryDate", label: "Ingresso na ALESC", kind: "dateOnly", priority: 8,
    keywords: [["ingresso"]] },
  { key: "emergencyContactNameRelationship", label: "Contato de emergência (nome e vínculo)", kind: "nameRelationship", priority: 9,
    keywords: [["nome", "vinculo", "contato de emergencia"]] },
  { key: "emergencyContactPhone", label: "Contato de emergência (telefone)", kind: "phone", priority: 9,
    keywords: [["contato de emergencia", "ligamos"], ["contato de emergencia"]] },
  { key: "contactMadeByName", label: "Contato feito por", kind: "text", priority: 8,
    keywords: [["contato feito por"]] },
  { key: "contactDate", label: "Data do contato", kind: "date", priority: 9,
    keywords: [["data do contato"]] },
  { key: "contactObservations", label: "Observações", kind: "text", priority: 5,
    keywords: [["observa"], ["obs"]] },

  // Sem campo próprio no sistema: viram linhas rotuladas em Observações,
  // conforme decidido com o setor.
  { key: "note_email", label: "E-mail (→ Observações)", kind: "note", priority: 4, keywords: [["e-mail"], ["email"]] },
  { key: "note_healthPlan", label: "Plano de saúde (→ Observações)", kind: "note", priority: 4, keywords: [["plano de saude"]] },
  { key: "note_followUp", label: "Acompanhamento profissional (→ Observações)", kind: "note", priority: 4, keywords: [["acompanhado", "profissional"]] },
  { key: "note_regularTherapy", label: "Faz terapia regularmente (→ Observações)", kind: "note", priority: 6, keywords: [["realiza atendimento com psicologo"]] },
  { key: "note_groupInterest", label: "Interesse em grupo terapêutico (→ Observações)", kind: "note", priority: 4, keywords: [["grupo terapeutico"]] },
  { key: "note_listSent", label: "Lista de atendimento enviada (→ Observações)", kind: "note", priority: 4, keywords: [["lista de atendimento"]] },

  /**
   * Agendamento que já constava na planilha.
   *
   * Estas pessoas entram como FILA DE ESPERA, sem psicólogo atribuído (a
   * distribuição é feita manualmente pelo setor). Mas jogar a informação fora
   * seria perder histórico: em vez disso, ela é preservada como uma linha de
   * observação legível — "Consta agendamento anterior na planilha: ...".
   *
   * Prioridade baixa de propósito: "Data"/"Hora" isolados só podem ser
   * capturados DEPOIS que campos específicos ("Data de nascimento", "Data do
   * contato", "Carimbo de data/hora") já escolheram suas colunas.
   */
  { key: "prior_psychologist", label: "Psicólogo indicado na planilha (→ Observações)", kind: "note", priority: 3, keywords: [["psicologo"], ["psicologa"], ["psicololgo"]] },
  { key: "prior_scheduled", label: "Agendado? na planilha (→ Observações)", kind: "note", priority: 3, keywords: [["agendado"]] },
  { key: "prior_date", label: "Data do agendamento (→ Observações)", kind: "note", priority: 1, keywords: [["data"]] },
  { key: "prior_time", label: "Hora do agendamento (→ Observações)", kind: "note", priority: 1, keywords: [["hora"]] },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f])
);

// ---------------------------------------------------------------------------
// Utilidades de normalização
// ---------------------------------------------------------------------------

function normalizeHeader(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** CAIXA ALTA preservando acentos, com espaços colapsados. */
export function toUpperName(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

/** Serial do Excel (dias desde 1899-12-30) -> Date, ao MEIO-DIA local. */
function excelSerialToDate(serial: number): Date | null {
  // Serial plausível: entre 1900 e ~2100. Telefones (bilhões) caem fora daqui,
  // e é por isso que números enormes nunca são confundidos com data.
  if (!isFinite(serial) || serial < 1 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

function parseDateValue(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return excelSerialToDate(value);
  const raw = String(value).trim();
  if (!raw) return null;

  // dd/mm/aaaa [hh:mm[:ss]]
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, mo, yRaw, h = "12", mi = "0", se = "0"] = br;
    const y = Number(yRaw) < 100 ? 2000 + Number(yRaw) : Number(yRaw);
    const date = new Date(y, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    return isNaN(date.getTime()) ? null : date;
  }
  // aaaa-mm-dd
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);

  // "mm/aaaa" ou "Março/2025" — usado em "ingresso na ALESC"
  const my = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (my) return new Date(Number(my[2]), Number(my[1]) - 1, 1, 12, 0, 0);

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlyString(d: Date | null): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Telefone. Aceita número puro (inclusive vindo de célula marcada como data),
 * texto com máscara, e o apóstrofo que o Excel às vezes deixa ("48999117515'").
 */
function parsePhone(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    // Célula marcada como data mas que na verdade guardava um telefone:
    // reconstrói o serial original e devolve os dígitos.
    const serial = value.getTime() / 86400000 + 25569;
    return String(Math.round(serial));
  }
  if (typeof value === "number") return String(Math.round(value));
  const digits = String(value).replace(/\D/g, "");
  return digits;
}

/**
 * Hora vinda do Excel.
 * O Excel guarda hora como FRAÇÃO DE DIA: 0.4166666 = 10:00. Sem converter,
 * a observação sairia "hora: 0.4166666666666667".
 */
function parseTimeValue(value: any): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMin = Math.round(value * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{0,2})/i);
  if (m) return `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
  return raw;
}

/** Formata para leitura: (48) 99999-9999 */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function parseBooleanValue(value: any): boolean | undefined {
  if (typeof value === "boolean") return value;
  const v = normalizeHeader(String(value ?? ""));
  if (!v) return undefined;
  if (/^(sim|s|yes|true|verdadeiro|x)$/.test(v)) return true;
  if (/^(nao|n|no|false|falso)$/.test(v)) return false;
  if (v.startsWith("sim")) return true;
  if (v.startsWith("nao")) return false;
  return undefined;
}

/** Número inteiro sem o ".0" que o Excel adiciona. */
function parsePlainText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (value instanceof Date) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Leitura do arquivo
// ---------------------------------------------------------------------------

export interface SheetSummary {
  name: string;
  rowCount: number;
  colCount: number;
  /** Primeiras linhas em bruto, para o usuário escolher onde está o cabeçalho. */
  preview: string[][];
}

export async function loadWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  // cellDates DESLIGADO de propósito: queremos os valores crus e decidimos o
  // tipo pelo campo de destino (ver comentário no topo, armadilha nº 1).
  return XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
}

export function listSheets(wb: XLSX.WorkBook): SheetSummary[] {
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    return {
      name,
      rowCount: Math.max(0, rows.length - 1),
      colCount: rows.reduce((m, r) => Math.max(m, r.length), 0),
      preview: rows.slice(0, 6).map((r) => r.map((c) => parsePlainText(c).slice(0, 30))),
    };
  });
}

export interface SheetData {
  headers: string[];
  rows: any[][];
}

/**
 * @param headerRow linha do cabeçalho (1 = primeira). 0 = planilha SEM
 *                  cabeçalho — as colunas passam a se chamar "Coluna A", etc.
 */
export function readSheet(wb: XLSX.WorkBook, sheetName: string, headerRow: number): SheetData {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const all: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });

  if (headerRow <= 0) {
    const width = all.reduce((m, r) => Math.max(m, r.length), 0);
    const headers = Array.from({ length: width }, (_, i) => `Coluna ${columnLetter(i)}`);
    return { headers, rows: all };
  }

  const headerIdx = headerRow - 1;
  const rawHeaders: any[] = all[headerIdx] ?? [];
  const width = Math.max(rawHeaders.length, ...all.slice(headerIdx).map((r) => r.length), 0);
  const headers = Array.from({ length: width }, (_, i) => {
    const h = parsePlainText(rawHeaders[i]);
    // Coluna sem título (acontece na aba "Matutino"): nomeada pela letra para
    // continuar mapeável à mão, em vez de sumir.
    return h || `Coluna ${columnLetter(i)}`;
  });
  return { headers, rows: all.slice(headerIdx + 1) };
}

function columnLetter(index: number): string {
  let n = index, out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

// ---------------------------------------------------------------------------
// Detecção automática de colunas
// ---------------------------------------------------------------------------

/** Devolve { chaveDoCampo: índiceDaColuna }. */
export function detectColumnMap(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const map: Record<string, number> = {};
  const usedColumns = new Set<number>();

  // Campos de maior prioridade escolhem primeiro, para que "Nome" não seja
  // roubado por "Favor informar nome e vínculo do contato de emergência".
  const ordered = [...FIELD_DEFS].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const field of ordered) {
    for (const group of field.keywords) {
      const idx = normalized.findIndex(
        (h, i) => !usedColumns.has(i) && h.length > 0 && group.every((kw) => h.includes(kw))
      );
      if (idx >= 0) {
        map[field.key] = idx;
        usedColumns.add(idx);
        break;
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Conversão das linhas
// ---------------------------------------------------------------------------

export interface ImportRow {
  data: Record<string, any>;
  /** Motivos pelos quais a linha precisa de conferência humana. */
  reviewReasons: string[];
  sourceRowNumber: number;
}

const NOTE_LABELS: Record<string, string> = {
  note_email: "E-mail",
  note_healthPlan: "Plano de saúde",
  note_followUp: "Acompanhamento profissional",
  note_regularTherapy: "Faz terapia regularmente",
  note_groupInterest: "Interesse em grupo terapêutico",
  note_listSent: "Lista de atendimento enviada",
};

/** Turnos que o setor reconhece; o resto entra como está e é sinalizado. */
const KNOWN_SHIFTS = ["matutino", "vespertino", "noturno", "integral"];

export function buildImportRows(
  data: SheetData,
  columnMap: Record<string, number>
): ImportRow[] {
  const result: ImportRow[] = [];

  data.rows.forEach((row, i) => {
    if (!row || row.every((c) => c === "" || c === null || c === undefined)) return;

    const get = (key: string) => {
      const idx = columnMap[key];
      return idx === undefined ? undefined : row[idx];
    };

    const out: Record<string, any> = {};
    const reasons: string[] = [];
    const notes: string[] = [];

    // --- Nome (obrigatório) ---
    const nameRaw = parsePlainText(get("fullName"));
    if (!nameRaw) return; // linha sem nome não é pessoa: descartada silenciosamente
    out.fullName = toUpperName(nameRaw);
    if (out.fullName.split(" ").filter(Boolean).length < 2) {
      reasons.push("Nome parece incompleto (só um termo).");
    }

    // --- Demais campos, conforme o tipo do DESTINO ---
    for (const field of FIELD_DEFS) {
      if (field.key === "fullName") continue;
      const raw = get(field.key);
      if (raw === undefined || raw === "" || raw === null) continue;

      switch (field.kind) {
        case "upper":
          out[field.key] = toUpperName(parsePlainText(raw));
          break;

        case "text":
          out[field.key] = parsePlainText(raw);
          break;

        case "date": {
          const d = parseDateValue(raw);
          if (d) out[field.key] = d.toISOString();
          else if (parsePlainText(raw)) reasons.push(`${field.label}: data não reconhecida ("${parsePlainText(raw).slice(0, 20)}").`);
          break;
        }

        case "dateOnly": {
          const d = parseDateValue(raw);
          if (d) out[field.key] = toDateOnlyString(d);
          else if (parsePlainText(raw)) reasons.push(`${field.label}: data não reconhecida ("${parsePlainText(raw).slice(0, 20)}").`);
          break;
        }

        case "phone": {
          const digits = parsePhone(raw);
          if (digits.length >= 8 && digits.length <= 13) {
            out[field.key] = formatPhone(digits);
          } else if (digits) {
            out[field.key] = digits;
            reasons.push(`${field.label}: número com ${digits.length} dígitos, fora do padrão.`);
          }
          break;
        }

        case "boolean": {
          const b = parseBooleanValue(raw);
          if (b !== undefined) out[field.key] = b;
          else reasons.push(`${field.label}: resposta não reconhecida ("${parsePlainText(raw).slice(0, 20)}").`);
          break;
        }

        case "nameRelationship": {
          const v = parsePlainText(raw);
          const parts = v.split(/\s*[-–—]\s*/);
          out.emergencyContactName = toUpperName(parts[0] || "");
          out.emergencyContactRelationship = toUpperName(parts.slice(1).join(" - "));
          break;
        }

        case "note": {
          const v = parsePlainText(raw);
          if (v) notes.push(`${NOTE_LABELS[field.key] ?? field.label}: ${v}`);
          break;
        }
      }
    }

    // --- Agendamento anterior: vira UMA linha legível, não quatro soltas ---
    const priorPsico = parsePlainText(get("prior_psychologist"));
    const priorSched = parsePlainText(get("prior_scheduled"));
    const priorDateV = parseDateValue(get("prior_date"));
    const priorTimeV = parseTimeValue(get("prior_time"));
    const priorParts: string[] = [];
    if (priorPsico) priorParts.push(`profissional: ${priorPsico}`);
    if (priorDateV) priorParts.push(`data: ${toDateOnlyString(priorDateV).split("-").reverse().join("/")}`);
    if (priorTimeV) priorParts.push(`hora: ${priorTimeV}`);
    if (priorSched && !priorParts.length) priorParts.push(`agendado: ${priorSched}`);
    if (priorParts.length) {
      notes.push(`Consta agendamento anterior na planilha (${priorParts.join(", ")}). Não migrado para a agenda — redistribuir manualmente.`);
    }

    // --- Observações: o que já existia + os campos sem lugar próprio ---
    const baseObs = out.contactObservations ? [String(out.contactObservations)] : [];
    const allNotes = [...baseObs, ...notes].filter(Boolean);
    if (allNotes.length) out.contactObservations = allNotes.join("\n");

    // --- Detecção de coluna deslocada -------------------------------------
    // Se um campo de TEXTO recebeu algo que parece telefone, a planilha está
    // com as colunas corridas naquela linha. Foi o que aconteceu com
    // "Programa"/"Turno" na lista de estagiários.
    for (const key of ["affiliation", "workShift", "sector", "registrationCode"]) {
      const v = String(out[key] ?? "");
      const digits = v.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length === v.replace(/[\s().-]/g, "").length) {
        reasons.push(`${FIELD_BY_KEY[key]?.label ?? key}: contém um telefone — colunas provavelmente deslocadas nesta linha.`);
      }
    }

    // --- Validações de conteúdo -------------------------------------------
    if (!out.whatsapp) {
      reasons.push("Sem telefone de contato.");
    }
    /**
     * Na "Lista Geral 2025." a coluna Matrícula foi usada para marcar quem é
     * DEPENDENTE de servidor, em vez de um número. O sistema tem campo próprio
     * para isso — então convertemos, em vez de tratar como matrícula inválida.
     */
    if (out.registrationCode && /^dependente/i.test(String(out.registrationCode).trim())) {
      out.dependencyType = "Dependente";
      out.affiliation = out.affiliation || "Dependente";
      delete out.registrationCode;
    } else if (out.registrationCode) {
      const mat = String(out.registrationCode).trim();
      const temDigito = /\d/.test(mat);
      if (!temDigito) {
        /**
         * Matrícula SEM nenhum dígito ("Gabinete", "Coord. de Publicação") não
         * é matrícula: é o setor, escorregado de coluna. Este é o sinal mais
         * confiável de planilha desalinhada, e por isso vira revisão explícita.
         */
        reasons.push(`Matrícula contém texto sem número ("${mat.slice(0, 28)}") — provável coluna deslocada.`);
      } else if (!/^\d+$/.test(mat)) {
        // Códigos como "ARS13530" ou "13342as" são usados de verdade pelo
        // setor: aceitos sem alarme.
        // (nenhum aviso)
      }
    }
    if (out.workShift) {
      const shift = normalizeHeader(String(out.workShift));
      if (!KNOWN_SHIFTS.some((s) => shift.includes(s))) {
        reasons.push(`Turno em formato livre ("${out.workShift}").`);
      }
    }

    result.push({ data: out, reviewReasons: reasons, sourceRowNumber: i + 1 });
  });

  return result;
}

/** Campos preenchidos por dedução, sem coluna própria na planilha. */
export const DERIVED_FIELD_LABELS: Record<string, string> = {
  dependencyType: "Tipo de dependência",
  emergencyContactName: "Contato de emergência (nome)",
  emergencyContactRelationship: "Contato de emergência (vínculo)",
};

/** Rótulos usados na tela de conferência. */
export const IMPORT_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...FIELD_DEFS.map((f) => [f.key, f.label] as const),
   ...Object.entries({
     dependencyType: "Tipo de dependência",
     emergencyContactName: "Contato de emergência (nome)",
     emergencyContactRelationship: "Contato de emergência (vínculo)",
   })]
);
