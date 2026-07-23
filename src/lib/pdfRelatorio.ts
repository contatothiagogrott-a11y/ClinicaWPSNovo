import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, documentStyles } from "./pdfGenerator";

export interface ReportTableSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export function buildRelatorioDocDefinition(periodLabel: string, sections: ReportTableSection[]) {
  const content: any[] = [
    { text: "RELATÓRIO GERENCIAL — SETOR DE PSICOLOGIA", style: "title" },
    { text: periodLabel, style: "subtitle" },
  ];

  for (const section of sections) {
    content.push({ text: section.title, style: "sectionTitle", margin: [0, 16, 0, 6] });
    content.push({
      table: {
        headerRows: 1,
        widths: section.headers.map(() => "*"),
        body: [
          section.headers.map(h => ({ text: h, bold: true, fillColor: "#eef2ff", fontSize: 9 })),
          ...section.rows.map(row => row.map(cell => ({ text: String(cell), fontSize: 9 }))),
        ],
      },
      layout: "lightHorizontalLines",
    });
    if (section.rows.length === 0) {
      content.push({ text: "Nenhum dado no período selecionado.", italics: true, fontSize: 9, color: "#888888", margin: [0, 4, 0, 0] });
    }
  }

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content,
  };
}
