import {
  letterheadHeader, letterheadFooter, letterheadBackground,
  PAGE_MARGINS, documentStyles,
} from "./pdfGenerator";
import { formatDateBR, formatDateExtenso, toDate } from "./datetime";
import { signatureTitle } from "./roles";
import type { Client, Group, GroupRecord, User } from "../types";

/**
 * PRONTUÁRIO DE GRUPO
 * ===================
 *
 * Documento SEPARADO do prontuário individual, por três razões:
 *
 *  1. SIGILO — o conteúdo do grupo é restrito aos profissionais que o
 *     conduzem e à supervisão. Se saísse dentro do PDF individual, bastaria
 *     exportar para contornar a restrição de acesso.
 *  2. NATUREZA — o registro do grupo descreve um encontro coletivo. O
 *     art. 5º da Resolução CFP nº 001/2009 prevê documentação do grupo
 *     somada à documentação individual de cada integrante.
 *  3. NUMERAÇÃO — o grupo tem número próprio (prefixo "G"), que não se
 *     confunde com a numeração dos prontuários individuais.
 */
export function buildProntuarioGrupoDocDefinition(
  group: Group,
  records: GroupRecord[],
  membros: Client[],
  equipe: User[],
  numeroDoGrupo: string
) {
  const condutores = [group.psychologistId, group.coPsychologistId]
    .filter(Boolean)
    .map(id => equipe.find(u => u.id === id))
    .filter(Boolean) as User[];

  const registros = [...records]
    .filter(r => r.groupId === group.id && !r.isDraft)
    .sort((a, b) => (toDate(a.sessionDate)?.getTime() ?? 0) - (toDate(b.sessionDate)?.getTime() ?? 0));

  const blocos: any[] = [];
  registros.forEach(r => {
    const autor = equipe.find(u => u.id === r.authorId);
    const presentes = (r.attendance ?? []).filter(a => a.status === "COMPARECEU").length;
    const total = (r.attendance ?? []).length;

    blocos.push({
      margin: [0, 10, 0, 0],
      table: {
        widths: ["*"],
        body: [
          [{
            text: `ENCONTRO: ${formatDateBR(r.sessionDate)}${total ? `  ·  Presentes: ${presentes} de ${total}` : ""}`,
            bold: true, fillColor: "#f5f3ff",
          }],
          [{
            text: `Registro realizado por: ${autor ? `${autor.name}${autor.crp ? ` — CRP ${autor.crp}` : ""}` : "Profissional não identificado"}`,
            fontSize: 8.5, color: "#444444", margin: [4, 4, 4, 0],
          }],
          [{ text: r.content || "(sem registro de evolução)", margin: [4, 8, 4, 16] }],
        ],
      },
      layout: "lightHorizontalLines",
    });
  });

  const assinaturas = condutores.map(c => ({
    width: `${Math.floor(100 / Math.max(condutores.length, 1))}%`,
    stack: [
      { text: "_______________________________", alignment: "center" },
      { text: c.name, alignment: "center", bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
      { text: signatureTitle(c), alignment: "center", fontSize: 9 },
      { text: c.crp ? `CRP ${c.crp}` : "", alignment: "center", fontSize: 9 },
    ],
  }));

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content: [
      { text: "PRONTUÁRIO DE GRUPO", style: "title" },
      { text: "Registro documental de atendimento em grupo — Resolução CFP nº 001/2009", style: "subtitle" },

      {
        table: {
          widths: ["25%", "25%", "25%", "25%"],
          body: [
            [{ text: "Grupo", bold: true }, { text: group.name, colSpan: 3 }, {}, {}],
            [{ text: "Prontuário nº", bold: true }, { text: numeroDoGrupo },
             { text: "Situação", bold: true }, { text: group.isActive ? "Ativo" : "Encerrado" }],
            [{ text: "Objetivo", bold: true }, { text: group.objective || "—", colSpan: 3 }, {}, {}],
            [{ text: "Condutores", bold: true },
             { text: condutores.map(c => `${c.name}${c.crp ? ` (CRP ${c.crp})` : ""}`).join(" · ") || "—", colSpan: 3 }, {}, {}],
            [{ text: "Encontros", bold: true }, { text: String(registros.length) },
             { text: "Integrantes", bold: true }, { text: String(membros.length) }],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 10],
      },

      { text: "INTEGRANTES", style: "sectionTitle", margin: [0, 14, 0, 6] },
      {
        ul: membros.map(m => `${m.fullName}${m.protocolNumber ? ` — prontuário individual nº ${m.protocolNumber}` : ""}`),
        fontSize: 9.5,
      },

      { text: "REGISTRO DOS ENCONTROS", style: "sectionTitle", margin: [0, 16, 0, 6] },
      ...(blocos.length ? blocos : [{ text: "(nenhum encontro registrado)", italics: true, fontSize: 10 }]),

      {
        text: `Documento emitido em ${formatDateExtenso(new Date())}.`,
        fontSize: 9, margin: [0, 16, 0, 0],
      },
      { columns: assinaturas, margin: [0, 40, 0, 0] },
    ],
  };
}
