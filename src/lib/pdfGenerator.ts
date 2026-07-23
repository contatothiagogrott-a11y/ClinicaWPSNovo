import pdfMakeImport from "pdfmake/build/pdfmake";
import vfsFontsImport from "pdfmake/build/vfs_fonts";
import { LETTERHEAD_PNG_BASE64 } from "./letterheadData";
import { WATERMARK_PNG_BASE64 } from "./watermarkData";
import { SectionSchema, FieldSchema } from "./clinicalFormSchemas";

// A forma exata de importar isso varia conforme a versão/empacotador (Vite
// já teve vários relatos de bugs de interop CJS/ESM com este pacote
// especificamente) — por isso os fallbacks defensivos abaixo em vez de
// simplesmente `import pdfMake from "pdfmake/build/pdfmake"`.
const pdfMake: any = (pdfMakeImport as any).default ?? pdfMakeImport;
const vfs: any = (vfsFontsImport as any).default ?? vfsFontsImport;

function createPdf(docDefinition: any) {
  return pdfMake.createPdf(docDefinition, undefined, undefined, vfs);
}

export function downloadPdf(docDefinition: any, filename: string) {
  createPdf(docDefinition).download(filename);
}

export function openPdfInNewTab(docDefinition: any) {
  createPdf(docDefinition).open();
}

// ---------------------------------------------------------------------------
// Medidas do timbre institucional — extraídas diretamente do modelo Word
// oficial (ATESTADO_MODELO.docx) para bater exatamente com o padrão usado
// pela clínica: logo de cabeçalho, marca d'água central e margens de página.
// ---------------------------------------------------------------------------

// Margens de página em pt: 3cm esquerda/topo, 2cm direita, e espaço extra no
// topo/rodapé para caber a logo do cabeçalho e o texto do rodapé.
export const PAGE_MARGINS: [number, number, number, number] = [85, 108, 57, 78];

const HEADER_LOGO_WIDTH = 380; // pt — proporcional aos ~431pt do modelo original, ajustado à margem
const WATERMARK_WIDTH = 226.77; // pt — medida exata do modelo (WordPictureWatermark)
const WATERMARK_HEIGHT = 257.10; // pt — medida exata do modelo

// ---------------------------------------------------------------------------
// Cabeçalho/rodapé/marca d'água padrão — se repetem em todas as páginas
// ---------------------------------------------------------------------------

export function letterheadHeader() {
  return {
    margin: [85, 28, 57, 0] as [number, number, number, number],
    columns: [
      { image: LETTERHEAD_PNG_BASE64, width: HEADER_LOGO_WIDTH },
    ],
  };
}

export function letterheadFooter(current: number, total: number) {
  return {
    margin: [85, 0, 57, 20] as [number, number, number, number],
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 453, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }], margin: [0, 0, 0, 4] },
      {
        columns: [
          { text: "Assembleia Legislativa do Estado de Santa Catarina — Setor de Psicologia — Documento gerado pelo sistema, uso restrito à equipe autorizada.", fontSize: 6.5, color: "#888888" },
          { text: `${current} / ${total}`, fontSize: 6.5, color: "#888888", alignment: "right", width: 40 },
        ],
      },
    ],
  };
}

// Marca d'água central em todas as páginas (usa o mecanismo `background` do
// pdfmake, que fica atrás do conteúdo normal — equivalente ao "watermark"
// do Word). Opacidade baixa para não atrapalhar a leitura, como no modelo.
export function letterheadBackground(_currentPage: number, pageSize: { width: number; height: number }) {
  const x = (pageSize.width - WATERMARK_WIDTH) / 2;
  const y = (pageSize.height - WATERMARK_HEIGHT) / 2;
  return {
    image: WATERMARK_PNG_BASE64,
    width: WATERMARK_WIDTH,
    height: WATERMARK_HEIGHT,
    absolutePosition: { x, y },
    opacity: 0.13,
  };
}

export function signatureBlock(opts: { leftLabel?: string; rightName?: string; rightRole?: string; rightCrp?: string } = {}) {
  return {
    margin: [0, 40, 0, 0],
    columns: [
      {
        width: "50%",
        stack: [
          { text: "_______________________________", alignment: "center" },
          { text: opts.leftLabel || "Assinatura do Profissional Responsável", alignment: "center", fontSize: 9, margin: [0, 4, 0, 0] },
        ],
      },
      {
        width: "50%",
        stack: [
          { text: "_______________________________", alignment: "center" },
          { text: opts.rightName || "", alignment: "center", bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
          { text: opts.rightRole || "", alignment: "center", fontSize: 9 },
          { text: opts.rightCrp || "", alignment: "center", fontSize: 9 },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Renderização genérica de um campo/seção do schema (usado nos documentos de
// Anamnese+Risco e Urgência para não duplicar o layout campo a campo)
// ---------------------------------------------------------------------------

function fieldValueText(field: FieldSchema, value: any): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "yesno") return value === true || value === "true" ? "Sim" : value === false || value === "false" ? "Não" : String(value);
  if (field.type === "yesno_na") return { SIM: "Sim", NAO: "Não", NA: "N/A" }[value as string] || String(value);
  if (field.type === "check") return value ? "Presente" : "Ausente";
  return String(value);
}

export function renderSectionsToPdfContent(sections: SectionSchema[], data: Record<string, any>) {
  const content: any[] = [];
  for (const section of sections) {
    content.push({ text: section.title, style: "sectionTitle", margin: [0, 14, 0, 6] });
    const rows: any[] = [];
    let i = 0;
    while (i < section.fields.length) {
      const f = section.fields[i];
      if (f.half && section.fields[i + 1]?.half) {
        const f2 = section.fields[i + 1];
        rows.push([
          { text: [{ text: `${f.label}: `, bold: true }, fieldValueText(f, data[f.key])], border: [false, false, false, true], margin: [0, 3, 0, 3] },
          { text: [{ text: `${f2.label}: `, bold: true }, fieldValueText(f2, data[f2.key])], border: [false, false, false, true], margin: [0, 3, 0, 3] },
        ]);
        i += 2;
      } else {
        rows.push([
          { text: [{ text: `${f.label}: `, bold: true }, fieldValueText(f, data[f.key])], colSpan: 2, border: [false, false, false, true], margin: [0, 3, 0, 3] },
          {},
        ]);
        i += 1;
      }
    }
    content.push({
      table: { widths: ["50%", "50%"], body: rows },
      layout: "noBorders",
    });
  }
  return content;
}

export const documentStyles = {
  sectionTitle: { fontSize: 11, bold: true, color: "#1e3a8a", decoration: "underline" },
  title: { fontSize: 15, bold: true, alignment: "center", margin: [0, 4, 0, 2] },
  subtitle: { fontSize: 9, alignment: "center", color: "#555555", margin: [0, 0, 0, 10] },
};
