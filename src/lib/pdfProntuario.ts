import { Client, SessionRecord, User, InstrumentApplication, Instrument } from "../types";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, documentStyles } from "./pdfGenerator";

const SUPERVISOR_NAME = "Rafael da Costa Faria";
const SUPERVISOR_ROLE = "Psicólogo Supervisor";
const SUPERVISOR_CRP = "CRP-SC 25613";

export function buildProntuarioDocDefinition(
  client: Client,
  sessions: SessionRecord[],
  psico?: User,
  includedInstrumentApps?: InstrumentApplication[],
  instruments?: Instrument[]
) {
  const nonDraftSessions = sessions
    .filter(s => s.clientId === client.id && !s.isDraft)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const firstDate = nonDraftSessions[0]?.date;
  const lastDate = nonDraftSessions[nonDraftSessions.length - 1]?.date;

  const sessionBlocks: any[] = [];
  nonDraftSessions.forEach(s => {
    sessionBlocks.push({
      margin: [0, 10, 0, 0],
      table: {
        widths: ["*"],
        body: [
          [{ text: `DATA: ${new Date(s.date).toLocaleDateString("pt-BR")}`, bold: true, fillColor: "#f1f5f9" }],
          [{ text: s.notes || "(sem registro de evolução)", margin: [4, 8, 4, 20], minHeight: 60 }],
        ],
      },
      layout: "lightHorizontalLines",
    });
  });

  const testBlocks: any[] = [];
  if (includedInstrumentApps && includedInstrumentApps.length > 0) {
    testBlocks.push({ text: "TESTES E INSTRUMENTOS APLICADOS", style: "sectionTitle", margin: [0, 20, 0, 8] });
    includedInstrumentApps.forEach(app => {
      const inst = instruments?.find(i => i.id === app.instrumentId);
      testBlocks.push({
        margin: [0, 6, 0, 0],
        table: {
          widths: ["*"],
          body: [
            [{ text: inst?.name || "Instrumento", bold: true, fillColor: "#f1f5f9" }],
            [{
              margin: [4, 6, 4, 6],
              stack: [
                ...(app.purpose ? [{ text: [{ text: "Finalidade: ", bold: true }, app.purpose], fontSize: 9, margin: [0, 0, 0, 6] }] : []),
                ...app.entries.map(entry => ({
                  text: [{ text: `${new Date(entry.date).toLocaleDateString("pt-BR")}: `, bold: true }, entry.description || "(sem descrição)"],
                  fontSize: 9,
                  margin: [0, 2, 0, 2],
                })),
              ],
            }],
          ],
        },
        layout: "lightHorizontalLines",
      });
    });
  }

  const today = new Date();

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content: [
      { text: "PRONTUÁRIO PSICOLÓGICO", style: "title" },

      {
        margin: [0, 6, 0, 0],
        table: {
          widths: ["18%", "32%", "18%", "32%"],
          body: [
            [{ text: "Paciente", bold: true }, { text: client.fullName, colSpan: 3 }, {}, {}],
            [{ text: "Matrícula", bold: true }, { text: client.registrationCode || "—" }, { text: "D.N.", bold: true }, { text: client.birthDate || "—" }],
            [{ text: "Contato", bold: true }, { text: client.whatsapp || "—" }, { text: "Setor", bold: true }, { text: (client as any).sector || "—" }],
            [{ text: "Profissional", bold: true }, { text: psico?.name || "—" }, { text: "CRP", bold: true }, { text: psico?.crp || "—" }],
            [{ text: "Data de Início", bold: true }, { text: firstDate ? new Date(firstDate).toLocaleDateString("pt-BR") : "—" }, { text: "Data de Término", bold: true }, { text: client.status === "FINALIZADO" && lastDate ? new Date(lastDate).toLocaleDateString("pt-BR") : "Em andamento" }],
            [{ text: "N° Atendimentos", bold: true }, { text: String(nonDraftSessions.length) }, { text: "", border: [false, false, false, false] }, { text: "", border: [false, false, false, false] }],
            [{ text: "Encaminhamento", bold: true }, { text: client.priority || "—", colSpan: 3 }, {}, {}],
          ],
        },
        layout: "lightHorizontalLines",
      },

      ...sessionBlocks,
      ...testBlocks,

      { text: `Prontuário impresso e arquivado no dia ${today.getDate()} de ${today.toLocaleDateString("pt-BR", { month: "long" })} de ${today.getFullYear()}.`, margin: [0, 20, 0, 0], fontSize: 9 },
      { text: "Florianópolis, SC.", fontSize: 9 },

      {
        margin: [0, 40, 0, 0],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              { text: psico?.name || "", alignment: "center", bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
              { text: psico?.crp ? `CRP ${psico.crp}` : "", alignment: "center", fontSize: 9 },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "_______________________________", alignment: "center" },
              { text: SUPERVISOR_NAME, alignment: "center", bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
              { text: SUPERVISOR_ROLE, alignment: "center", fontSize: 9 },
              { text: SUPERVISOR_CRP, alignment: "center", fontSize: 9 },
            ],
          },
        ],
      },
    ],
  };
}
