import { Client, ClinicalDocument, User } from "../types";
import { ANAMNESE_RISCO_SECTIONS } from "./clinicalFormSchemas";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, signatureBlock, renderSectionsToPdfContent, documentStyles } from "./pdfGenerator";
import { formatDateBR } from "./datetime";

/**
 * ATENÇÃO — identidade do supervisor.
 *
 * Estes valores estavam FIXOS NO CÓDIGO: todo documento saía assinado com o
 * mesmo nome e CRP, independentemente de quem supervisiona o caso. Se essa
 * pessoa sair do setor, ou se outro profissional assumir a supervisão, os
 * documentos continuariam saindo com a assinatura errada — o que, num
 * documento psicológico, é atribuir a um profissional a responsabilidade por
 * um ato que não foi dele (Resolução CFP nº 06/2019).
 *
 * Enquanto a escolha do supervisor por documento não estiver implementada,
 * estes valores servem apenas de PADRÃO e devem ser conferidos.
 */
const SUPERVISOR_NAME = "Rafael da Costa Faria";
const SUPERVISOR_ROLE = "Psicólogo Supervisor";
const SUPERVISOR_CRP = "CRP-SC 25613";

export function buildAnamneseRiscoDocDefinition(client: Client, doc: ClinicalDocument, author?: User) {
  const data = doc.data || {};

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content: [
      { text: "ANAMNESE DE CLASSIFICAÇÃO DE RISCO", style: "title" },
      { text: "Instrumento unificado de Anamnese e Avaliação de Fatores de Risco e Proteção — Setor de Psicologia", style: "subtitle" },

      { text: "Dados de Identificação", style: "sectionTitle", margin: [0, 4, 0, 6] },
      {
        table: {
          widths: ["25%", "25%", "25%", "25%"],
          body: [
            [{ text: "Nome", bold: true }, { text: client.fullName, colSpan: 3 }, {}, {}],
            [{ text: "Data de Nascimento", bold: true }, { text: client.birthDate || "—" }, { text: "Matrícula", bold: true }, { text: client.registrationCode || "—" }],
            [{ text: "Setor", bold: true }, { text: (client as any).sector || "—" }, { text: "Contato", bold: true }, { text: client.whatsapp || "—" }],
            [{ text: "Contato de Emergência", bold: true, colSpan: 4 }, {}, {}, {}],
            [{ text: "Nome", bold: true }, { text: client.emergencyContactName || "—" }, { text: "Parentesco/Relação", bold: true }, { text: client.emergencyContactRelationship || "—" }],
            [{ text: "Contato", bold: true }, { text: client.emergencyContactPhone || "—", colSpan: 3 }, {}, {}],
          ],
        },
        layout: "lightHorizontalLines",
      },

      ...renderSectionsToPdfContent(ANAMNESE_RISCO_SECTIONS, data),

      {
        margin: [0, 16, 0, 0],
        columns: [
          { text: [{ text: "Data: ", bold: true }, formatDateBR(doc.createdAt)] },
        ],
      },
      signatureBlock({
        leftLabel: `Profissional Responsável${author ? ` — ${author.name}${author.crp ? ` — CRP ${author.crp}` : ""}` : ""}`,
        rightName: SUPERVISOR_NAME,
        rightRole: SUPERVISOR_ROLE,
        rightCrp: SUPERVISOR_CRP,
      }),
    ],
  };
}
