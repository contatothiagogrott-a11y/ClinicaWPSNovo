import { Client, ClinicalDocument, User } from "../types";
import { URGENCIA_SECTIONS } from "./clinicalFormSchemas";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, signatureBlock, renderSectionsToPdfContent, documentStyles } from "./pdfGenerator";

export function buildUrgenciaDocDefinition(client: Client, doc: ClinicalDocument, author?: User) {
  const data = doc.data || {};

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content: [
      { text: "REGISTRO DE ATENDIMENTO DE URGÊNCIA", style: "title" },
      { text: "Atendimento pontual em situação de crise — não configura anamnese nem atendimento contínuo", style: "subtitle" },

      { text: "Paciente", style: "sectionTitle", margin: [0, 4, 0, 6] },
      {
        table: {
          widths: ["25%", "25%", "25%", "25%"],
          body: [
            [{ text: "Nome", bold: true }, { text: client.fullName, colSpan: 3 }, {}, {}],
            [{ text: "Matrícula", bold: true }, { text: client.registrationCode || "—" }, { text: "Setor", bold: true }, { text: (client as any).sector || "—" }],
          ],
        },
        layout: "lightHorizontalLines",
      },

      ...renderSectionsToPdfContent(URGENCIA_SECTIONS, data),

      {
        margin: [0, 16, 0, 0],
        text: [{ text: "Registrado em: ", bold: true }, new Date(doc.createdAt).toLocaleDateString("pt-BR")],
      },
      signatureBlock({
        leftLabel: `Profissional Responsável${author ? ` — ${author.name}${author.crp ? ` — CRP ${author.crp}` : ""}` : ""}`,
      }),
    ],
  };
}
