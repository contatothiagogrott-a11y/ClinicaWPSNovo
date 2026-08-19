import { Client, SessionRecord, User, InstrumentApplication, Instrument } from "../types";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, documentStyles } from "./pdfGenerator";
import { formatDateBR, formatDateExtenso, toDate } from "./datetime";

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

export function buildProntuarioDocDefinition(
  client: Client,
  sessions: SessionRecord[],
  psico?: User,
  includedInstrumentApps?: InstrumentApplication[],
  instruments?: Instrument[],
  /**
   * Equipe do setor, para identificar o autor de CADA sessão.
   *
   * O prontuário é institucional e o paciente pode ter sido atendido por
   * profissionais diferentes ao longo do acompanhamento. Sem identificar quem
   * realizou cada sessão, o documento impresso não permite saber quem
   * respondeu por qual ato — e a identificação com nome e CRP é exigida
   * (Resolução CFP nº 06/2019).
   */
  equipe?: User[]
) {
  /**
   * O prontuário INDIVIDUAL não inclui sessões de grupo.
   *
   * O registro do grupo é documento próprio, com sigilo próprio (restrito aos
   * condutores) e numeração própria. Misturar os dois num único PDF faria o
   * documento individual carregar conteúdo de outro contexto de atendimento —
   * e bastaria exportar para contornar a restrição de acesso.
   */
  const nonDraftSessions = sessions
    .filter(s => s.clientId === client.id && !s.isDraft && !s.groupId)
    .sort((a, b) => (toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0));

  const firstDate = nonDraftSessions[0]?.date;
  const lastDate = nonDraftSessions[nonDraftSessions.length - 1]?.date;

  const TIPOS: Record<string, string> = {
    TRIAGEM_GRUPO: "Triagem para grupo",
    ENTREVISTA: "Entrevista",
    DEVOLUTIVA: "Devolutiva",
  };

  const sessionBlocks: any[] = [];
  nonDraftSessions.forEach(s => {
    // Autor da sessão: preferencialmente da equipe; se não achar, cai no
    // profissional que está emitindo o documento.
    const autor = equipe?.find(u => u.id === s.psicoId) ?? (s.psicoId === psico?.id ? psico : undefined);
    const assinatura = autor
      ? `${autor.name}${autor.crp ? ` — CRP ${autor.crp}` : ""}`
      : "Profissional não identificado";
    const natureza = s.sessionType && TIPOS[s.sessionType] ? ` · ${TIPOS[s.sessionType]}` : "";
    // Identifica o encontro do grupo, quando for o caso.
    const grupo = s.groupId && s.groupSessionNumber ? ` · Sessão ${s.groupSessionNumber} de grupo` : "";

    sessionBlocks.push({
      margin: [0, 10, 0, 0],
      table: {
        widths: ["*"],
        body: [
          [{ text: `DATA: ${formatDateBR(s.date)}${natureza}${grupo}`, bold: true, fillColor: "#f1f5f9" }],
          [{
            text: `Sessão realizada por: ${assinatura}`,
            fontSize: 8.5,
            color: "#444444",
            margin: [4, 4, 4, 0],
          }],
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
                  text: [{ text: `${formatDateBR(entry.date)}: `, bold: true }, entry.description || "(sem descrição)"],
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
            [{ text: "Data de Início", bold: true }, { text: firstDate ? formatDateBR(firstDate) : "—" }, { text: "Data de Término", bold: true }, { text: client.status === "FINALIZADO" && lastDate ? formatDateBR(lastDate) : "Em andamento" }],
            [{ text: "N° Atendimentos", bold: true }, { text: String(nonDraftSessions.length) }, { text: "", border: [false, false, false, false] }, { text: "", border: [false, false, false, false] }],
            [{ text: "Encaminhamento", bold: true }, { text: client.priority || "—", colSpan: 3 }, {}, {}],
          ],
        },
        layout: "lightHorizontalLines",
      },

      ...sessionBlocks,
      ...testBlocks,

      { text: `Prontuário impresso e arquivado no dia ${formatDateExtenso(today)}.`, margin: [0, 20, 0, 0], fontSize: 9 },
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
