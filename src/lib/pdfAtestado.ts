import { Client, ClinicalDocument, User } from "../types";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, signatureBlock, documentStyles } from "./pdfGenerator";
import { formatDateBR, formatDateExtenso } from "./datetime";

export function buildAtestadoDocDefinition(client: Client, doc: ClinicalDocument, author?: User) {
  const data = doc.data || {};
  /**
   * CORREÇÃO DO BUG DE FUSO (item 5).
   *
   * Antes: `new Date("2026-07-20")` — o JavaScript lê isso como MEIA-NOITE
   * UTC. Ao imprimir com getDate()/getFullYear() em Florianópolis (UTC-3),
   * saía 19/07/2026. O atestado era emitido com um dia a menos.
   *
   * Agora a data é formatada a partir da string, sem conversão de fuso
   * (ver src/lib/datetime.ts). Não é preciosismo: a Resolução CFP nº 06/2019
   * exige data de emissão fidedigna no atestado, e é dela que corre o prazo
   * de validade do documento.
   */
  const emissionSource = data.emissionDate || doc.createdAt;
  const validadeDias = data.validadeDias || 60;

  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    header: letterheadHeader,
    footer: letterheadFooter,
    background: letterheadBackground,
    styles: documentStyles,
    content: [
      { text: "ATESTADO PSICOLÓGICO", style: "title", margin: [0, 10, 0, 20] },

      { text: data.bodyText || "", fontSize: 11, lineHeight: 1.4, alignment: "justify", margin: [0, 0, 0, 20] },

      { text: "À disposição para esclarecimentos e orientações,", fontSize: 11, margin: [0, 0, 0, 16] },
      { text: `Florianópolis, ${formatDateExtenso(emissionSource)}.`, fontSize: 11, margin: [0, 0, 0, 0] },

      signatureBlock({
        leftLabel: "",
        rightName: author?.name || "",
        rightRole: "PROFISSIONAL",
        rightCrp: author?.crp ? `CRP ${author.crp}` : "CRP",
      }),

      {
        margin: [0, 30, 0, 0],
        fontSize: 7,
        color: "#666666",
        text: `¹ Este atestado psicológico tem o prazo de validade de ${validadeDias} dias, contados a partir da data de emissão.`,
      },
    ],
  };
}

/** Monta o texto inicial do atestado a partir dos dados do paciente — o
 * psicólogo pode (e deve) revisar e editar livremente antes de emitir. */
export function composeAtestadoBodyText(client: Client, opts: { aptoPara: string; endereco: string; acompanhamentoDesde: string; motivo: string }) {
  // Mesmas datas, mesma armadilha de fuso: nascimento e início do
  // acompanhamento também saíam um dia adiantados no texto do atestado.
  const nascimento = client.birthDate ? formatDateBR(client.birthDate) : "XX/XX/XXXX";
  const desde = opts.acompanhamentoDesde ? formatDateBR(opts.acompanhamentoDesde) : "XX/XX/XXXX";
  return `Atesto¹ para os devidos fins que ${client.fullName || "XXXXXXXX"}, nascido(a) em ${nascimento}, residente à ${opts.endereco || "XXXX"}, está apta para ${opts.aptoPara || "XXXX"}. Está em acompanhamento psicológico nesta instituição desde ${desde} por recomendação da equipe médica que a acompanha para a realização de ${opts.motivo || "XXXX"}. Participou dos encontros de forma assídua e encontra-se com humor estável, sono regular e sem alterações do senso-percepção.\n\nOs instrumentos utilizados para avaliação foram entrevistas clínicas, anamnese, psicoterapia individual e psico-orientação para o pré e pós cirúrgico individual.`;
}
