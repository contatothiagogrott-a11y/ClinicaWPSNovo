import {
  letterheadHeader, letterheadFooter, letterheadBackground,
  PAGE_MARGINS, documentStyles,
} from "./pdfGenerator";
import { formatDateBR, formatDateExtenso, toDate, toDateOnly } from "./datetime";
import { signatureTitle } from "./roles";
import { numerarDatasDoGrupo } from "./groupSessions";
import { ATTENDANCE_LABELS, naoOcorreu } from "./attendance";
import type {
  Appointment, Client, Group, GroupClientNote, GroupRecord, SessionRecord, User,
} from "../types";

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
 *
 * O QUE MUDOU NESTA VERSÃO
 * ------------------------
 * O documento trazia apenas o registro COLETIVO de cada encontro. Faltava
 * justamente a peça que o art. 5º da Resolução CFP nº 001/2009 torna
 * obrigatória: a documentação INDIVIDUAL de cada participante. Na prática, ao
 * imprimir o prontuário do grupo o setor entregava metade do registro.
 *
 * Agora cada encontro sai com as duas camadas, uma embaixo da outra:
 *
 *      ENCONTRO Nº 7 — 12/03/2026
 *      ├── Registro coletivo .......... o que aconteceu no grupo
 *      └── Registros individuais ...... a evolução de cada integrante
 *
 * E, ao final, as anotações de acompanhamento que cada profissional mantém
 * sobre os integrantes ao longo do processo.
 *
 * O QUE NÃO SAI NESTE DOCUMENTO
 * -----------------------------
 * As ANOTAÇÕES PRIVADAS da sessão (`privateNotes`) ficam de fora, sempre.
 * Elas são o rascunho pessoal do profissional, visível só a quem escreveu —
 * imprimi-las num documento que circula entre condutores e supervisão
 * anularia essa garantia por via oblíqua. O art. 1º, § 2º da Resolução CFP
 * nº 001/2009 distingue o registro do prontuário das anotações pessoais do
 * psicólogo, e só o primeiro compõe o documento.
 */

export interface FontesDoProntuarioDeGrupo {
  /** Registros coletivos dos encontros. */
  groupRecords: GroupRecord[];
  /** Prontuários individuais dos integrantes (os que têm `groupId`). */
  sessions?: SessionRecord[];
  /** Anotações de acompanhamento por integrante. */
  groupClientNotes?: GroupClientNote[];
  /** Agenda do grupo — usada para numerar os encontros. */
  appointments?: Appointment[];
}

export function buildProntuarioGrupoDocDefinition(
  group: Group,
  fontes: FontesDoProntuarioDeGrupo,
  membros: Client[],
  equipe: User[],
  numeroDoGrupo: string
) {
  const { groupRecords, sessions = [], groupClientNotes = [], appointments = [] } = fontes;

  const condutores = [group.psychologistId, group.coPsychologistId]
    .filter(Boolean)
    .map(id => equipe.find(u => u.id === id))
    .filter(Boolean) as User[];

  const nomeDe = (id?: string) => {
    const u = equipe.find(x => x.id === id);
    return u ? `${u.name}${u.crp ? ` — CRP ${u.crp}` : ""}` : "Profissional não identificado";
  };
  const pacienteDe = (id: string) =>
    membros.find(m => m.id === id)?.fullName ?? "Integrante não identificado";

  const coletivos = groupRecords
    .filter(r => r.groupId === group.id && !r.isDraft);

  /** Prontuários individuais deste grupo que já foram concluídos. */
  const individuais = sessions
    .filter(s => s.groupId === group.id && !s.isDraft);

  /**
   * Um encontro é identificado pela DATA. É o que permite casar o registro
   * coletivo com os registros individuais daquele mesmo dia, já que as duas
   * coisas são gravadas em tabelas diferentes.
   */
  const datas = Array.from(new Set([
    ...coletivos.map(r => toDateOnly(r.sessionDate)),
    ...individuais.map(s => toDateOnly(s.date)),
  ].filter(Boolean) as string[])).sort();

  // Numeração vinda da linha do tempo do GRUPO — a mesma que a ficha do
  // paciente mostra, para que "Sessão 7" signifique a mesma coisa nos dois.
  const numeroPorData = numerarDatasDoGrupo(group.id, {
    appointments, groupRecords, sessions,
  });

  const blocos: any[] = [];

  datas.forEach(data => {
    const coletivo = coletivos.find(r => toDateOnly(r.sessionDate) === data);
    const doDia = individuais
      .filter(s => toDateOnly(s.date) === data)
      .sort((a, b) => pacienteDe(a.clientId).localeCompare(pacienteDe(b.clientId), "pt-BR"));

    const n = numeroPorData.get(data);
    const presentes = (coletivo?.attendance ?? []).filter(a => a.status === "COMPARECEU").length;
    const total = (coletivo?.attendance ?? []).length;

    const linhas: any[] = [];

    // Cabeçalho do encontro
    linhas.push([{
      text: `ENCONTRO${n ? ` Nº ${n}` : ""} — ${formatDateBR(data)}${total ? `  ·  Presentes: ${presentes} de ${total}` : ""}`,
      bold: true, fillColor: "#f5f3ff",
    }]);

    // ---- Camada 1: registro coletivo --------------------------------------
    linhas.push([{
      text: "Registro coletivo do encontro",
      bold: true, fontSize: 9.5, color: "#1e3a8a", margin: [4, 8, 4, 2],
    }]);
    linhas.push([{
      text: coletivo ? `Registro realizado por: ${nomeDe(coletivo.authorId)}` : "",
      fontSize: 8.5, color: "#444444", margin: [4, 0, 4, 0],
    }]);
    linhas.push([{
      text: coletivo?.content || "(sem registro coletivo para este encontro)",
      italics: !coletivo?.content,
      margin: [4, 4, 4, 8],
    }]);

    // ---- Camada 2: registros individuais ----------------------------------
    linhas.push([{
      text: `Registros individuais dos integrantes${doDia.length ? ` (${doDia.length})` : ""}`,
      bold: true, fontSize: 9.5, color: "#1e3a8a", margin: [4, 10, 4, 2],
    }]);

    if (doDia.length === 0) {
      linhas.push([{
        text: "(nenhum registro individual concluído para este encontro)",
        italics: true, fontSize: 9, color: "#666666", margin: [4, 2, 4, 8],
      }]);
    } else {
      doDia.forEach(s => {
        const situacao = s.attendance ? ATTENDANCE_LABELS[s.attendance as keyof typeof ATTENDANCE_LABELS] : "";
        linhas.push([{
          margin: [4, 4, 4, 8],
          stack: [
            {
              text: [
                { text: pacienteDe(s.clientId), bold: true, fontSize: 9.5 },
                situacao ? { text: `  ·  ${situacao}`, fontSize: 8.5, color: "#92400e" } : "",
              ],
            },
            {
              text: `Registro de: ${nomeDe(s.psicoId)}`,
              fontSize: 8, color: "#666666", margin: [0, 1, 0, 3],
            },
            {
              text: s.clinicalContentHidden
                ? "(conteúdo não disponível para este perfil)"
                : s.notes || "(sem evolução escrita)",
              italics: !s.notes || !!s.clinicalContentHidden,
              fontSize: 10,
            },
          ],
        }]);
      });
    }

    blocos.push({
      margin: [0, 10, 0, 0],
      table: { widths: ["*"], body: linhas },
      layout: "lightHorizontalLines",
      unbreakable: false,
    });
  });

  /**
   * ANOTAÇÕES DE ACOMPANHAMENTO POR INTEGRANTE.
   *
   * Não pertencem a um encontro específico: são o acompanhamento contínuo que
   * o profissional mantém sobre cada participante ao longo do processo
   * grupal. Entram no documento porque compõem a documentação individual
   * prevista no art. 5º da Resolução CFP nº 001/2009.
   */
  const notasDoGrupo = groupClientNotes
    .filter(n => n.groupId === group.id && (n.content ?? "").trim())
    .sort((a, b) => pacienteDe(a.clientId).localeCompare(pacienteDe(b.clientId), "pt-BR"));

  const blocoDeNotas = notasDoGrupo.length
    ? [
        { text: "ANOTAÇÕES DE ACOMPANHAMENTO POR INTEGRANTE", style: "sectionTitle", margin: [0, 18, 0, 6] },
        ...notasDoGrupo.map(n => ({
          margin: [0, 6, 0, 0],
          table: {
            widths: ["*"],
            body: [
              [{ text: pacienteDe(n.clientId), bold: true, fillColor: "#f8fafc", fontSize: 9.5 }],
              [{ text: `Anotação de: ${nomeDe(n.authorId)}`, fontSize: 8, color: "#666666", margin: [4, 3, 4, 0] }],
              [{ text: n.content, margin: [4, 4, 4, 8], fontSize: 10 }],
            ],
          },
          layout: "lightHorizontalLines",
        })),
      ]
    : [];

  const assinaturas = condutores.map(c => ({
    width: `${Math.floor(100 / Math.max(condutores.length, 1))}%`,
    stack: [
      { text: "_______________________________", alignment: "center" },
      { text: c.name, alignment: "center", bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
      { text: signatureTitle(c), alignment: "center", fontSize: 9 },
      { text: c.crp ? `CRP ${c.crp}` : "", alignment: "center", fontSize: 9 },
    ],
  }));

  const encontrosQueOcorreram = datas.filter(d => {
    const appt = appointments.find(a => a.groupId === group.id && toDateOnly(a.date) === d);
    return !appt || !naoOcorreu(appt.attendance);
  }).length;

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
            [{ text: "Encontros", bold: true }, { text: String(encontrosQueOcorreram) },
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
      {
        text: "Cada encontro traz o registro coletivo e, em seguida, a evolução individual de cada integrante presente.",
        fontSize: 8.5, color: "#555555", margin: [0, 0, 0, 4],
      },
      ...(blocos.length ? blocos : [{ text: "(nenhum encontro registrado)", italics: true, fontSize: 10 }]),

      ...blocoDeNotas,

      {
        text: `Documento emitido em ${formatDateExtenso(new Date())}.`,
        fontSize: 9, margin: [0, 16, 0, 0],
      },
      {
        text: "As anotações privadas de cada profissional não integram este documento (Resolução CFP nº 001/2009, art. 1º, § 2º).",
        fontSize: 7, color: "#666666", margin: [0, 6, 0, 0],
      },
      { columns: assinaturas, margin: [0, 30, 0, 0] },
    ],
  };
}
