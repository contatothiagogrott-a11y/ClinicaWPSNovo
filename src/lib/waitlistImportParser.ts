import * as XLSX from "xlsx";

// Cada campo interno é identificado por um conjunto de palavras-chave que
// devem aparecer no cabeçalho da coluna (comparação sem acento/maiúsculas).
// Isso torna a importação tolerante a pequenas variações no texto exato do
// cabeçalho da planilha (ex: "Matrícula" vs "matricula").
interface ColumnMatcher {
  key: string;
  keywords: string[];
  kind: "text" | "date" | "boolean" | "name_relationship" | "phone";
}

const COLUMN_MATCHERS: ColumnMatcher[] = [
  { key: "dateIncluded", keywords: ["carimbo", "data", "hora"], kind: "date" },
  { key: "fullName", keywords: ["nome"], kind: "text" },
  { key: "birthDate", keywords: ["data", "nascimento"], kind: "date" },
  { key: "registrationCode", keywords: ["matricula"], kind: "text" },
  { key: "affiliation", keywords: ["voce e"], kind: "text" },
  { key: "sector", keywords: ["setor"], kind: "text" },
  { key: "workShift", keywords: ["turno"], kind: "text" },
  { key: "whatsapp", keywords: ["telefone"], kind: "phone" },
  { key: "whatsappAuthorized", keywords: ["autoriza", "whatsapp"], kind: "boolean" },
  { key: "previouslyAttended", keywords: ["ja foi atendido"], kind: "boolean" },
  { key: "residenceCityNeighborhood", keywords: ["cidade", "bairro"], kind: "text" },
  { key: "helpRequest", keywords: ["setor pode", "ajudar"], kind: "text" },
  { key: "medications", keywords: ["medicamento"], kind: "text" },
  { key: "emergencyContactNameRelationship", keywords: ["nome", "vinculo", "contato de emergencia"], kind: "name_relationship" },
  { key: "emergencyContactPhone", keywords: ["contato de emergencia", "ligamos"], kind: "phone" },
  { key: "contactMadeByName", keywords: ["contato feito por"], kind: "text" },
  { key: "contactDate", keywords: ["data do contato"], kind: "date" },
  { key: "contactObservations", keywords: ["observa"], kind: "text" },
];

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function excelSerialToDate(value: number): Date {
  // Excel/Sheets date serial (dias desde 1899-12-30)
  return new Date(Math.round((value - 25569) * 86400 * 1000));
}

function parseFlexibleDate(value: any): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // dd/mm/yyyy ou dd/mm/yyyy HH:mm:ss (formato comum do Google Forms/Excel BR)
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
      const [, d, mo, y, h = "0", mi = "0", se = "0"] = match;
      const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function parseBoolean(value: any): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = normalize(value);
    if (["sim", "yes", "true", "s"].includes(v)) return true;
    if (["nao", "no", "false", "n"].includes(v)) return false;
  }
  return undefined;
}

/** Acha, para cada campo esperado, qual cabeçalho real da planilha melhor corresponde. */
function detectColumnMap(headers: string[]): Record<string, string> {
  const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalize(h) }));
  const map: Record<string, string> = {};
  for (const matcher of COLUMN_MATCHERS) {
    const found = normalizedHeaders.find(h => matcher.keywords.every(kw => h.normalized.includes(kw)));
    if (found) map[matcher.key] = found.original;
  }
  return map;
}

export interface ParsedImportResult {
  headers: string[];
  columnMap: Record<string, string>;
  rows: Record<string, any>[]; // já mapeadas para os campos internos do Client
  rawRowCount: number;
}

export async function parseWaitlistSpreadsheet(file: File): Promise<ParsedImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rawRows.length === 0) {
    return { headers: [], columnMap: {}, rows: [], rawRowCount: 0 };
  }

  const headers = Object.keys(rawRows[0]);
  const columnMap = detectColumnMap(headers);

  const rows = rawRows.map(raw => {
    const mapped: Record<string, any> = {};

    if (columnMap.dateIncluded) mapped.dateIncluded = parseFlexibleDate(raw[columnMap.dateIncluded]);
    if (columnMap.fullName) mapped.fullName = String(raw[columnMap.fullName] || "").trim();
    if (columnMap.birthDate) {
      const d = parseFlexibleDate(raw[columnMap.birthDate]);
      mapped.birthDate = d ? d.split("T")[0] : "";
    }
    if (columnMap.registrationCode) mapped.registrationCode = String(raw[columnMap.registrationCode] || "").trim();
    if (columnMap.affiliation) mapped.affiliation = String(raw[columnMap.affiliation] || "").trim();
    if (columnMap.sector) mapped.sector = String(raw[columnMap.sector] || "").trim();
    if (columnMap.workShift) mapped.workShift = String(raw[columnMap.workShift] || "").trim();
    if (columnMap.whatsapp) mapped.whatsapp = String(raw[columnMap.whatsapp] || "").trim();
    if (columnMap.whatsappAuthorized) mapped.whatsappAuthorized = parseBoolean(raw[columnMap.whatsappAuthorized]);
    if (columnMap.previouslyAttended) mapped.previouslyAttended = parseBoolean(raw[columnMap.previouslyAttended]);
    if (columnMap.residenceCityNeighborhood) mapped.residenceCityNeighborhood = String(raw[columnMap.residenceCityNeighborhood] || "").trim();
    if (columnMap.helpRequest) mapped.helpRequest = String(raw[columnMap.helpRequest] || "").trim();
    if (columnMap.medications) mapped.medications = String(raw[columnMap.medications] || "").trim();
    if (columnMap.emergencyContactNameRelationship) {
      const raw_val = String(raw[columnMap.emergencyContactNameRelationship] || "").trim();
      const parts = raw_val.split(/\s*-\s*/);
      mapped.emergencyContactName = parts[0] || "";
      mapped.emergencyContactRelationship = parts.slice(1).join(" - ") || "";
    }
    if (columnMap.emergencyContactPhone) mapped.emergencyContactPhone = String(raw[columnMap.emergencyContactPhone] || "").trim();
    if (columnMap.contactMadeByName) mapped.contactMadeByName = String(raw[columnMap.contactMadeByName] || "").trim();
    if (columnMap.contactDate) mapped.contactDate = parseFlexibleDate(raw[columnMap.contactDate]);
    if (columnMap.contactObservations) mapped.contactObservations = String(raw[columnMap.contactObservations] || "").trim();

    return mapped;
  });

  return { headers, columnMap, rows, rawRowCount: rawRows.length };
}

export const IMPORT_FIELD_LABELS: Record<string, string> = {
  dateIncluded: "Carimbo de data/hora (entrada na fila)",
  fullName: "Nome",
  birthDate: "Data de Nascimento",
  registrationCode: "Matrícula",
  affiliation: "Você é (vínculo)",
  sector: "Setor",
  workShift: "Turno de trabalho",
  whatsapp: "Telefone/WhatsApp",
  whatsappAuthorized: "Autoriza contato via WhatsApp",
  previouslyAttended: "Já foi atendido anteriormente",
  residenceCityNeighborhood: "Cidade e bairro de residência",
  helpRequest: "Como acha que o setor pode ajudar",
  medications: "Medicamentos",
  emergencyContactNameRelationship: "Nome e vínculo do contato de emergência",
  emergencyContactPhone: "Telefone do contato de emergência",
  contactMadeByName: "Contato feito por",
  contactDate: "Data do contato",
  contactObservations: "Observações do contato",
};
