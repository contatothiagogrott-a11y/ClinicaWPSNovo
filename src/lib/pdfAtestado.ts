import { Client, ClinicalDocument, User } from "../types";
import { letterheadHeader, letterheadFooter, letterheadBackground, PAGE_MARGINS, signatureBlock, documentStyles } from "./pdfGenerator";

export function buildAtestadoDocDefinition(client: Client, doc: ClinicalDocument, author?: User) {
  const data = doc.data || {};
  const emissionDate = data.emissionDate ? new Date(data.emissionDate) : new Date(doc.createdAt);
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
      { text: `Florianópolis, ${emissionDate.getDate()} de ${emissionDate.toLocaleDateString("pt-BR", { month: "long" })} de ${emissionDate.getFullYear()}.`, fontSize: 11, margin: [0, 0, 0, 0] },

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
        stack: [
          { text: `¹ Este atestado psicológico tem o prazo de validade de ${validadeDias} dias, contados a partir da data de emissão.` },
          { text: "² Assembleia Legislativa do Estado de Santa Catarina. Coordenadoria de Saúde e Assistência. Av. Mauro Ramos 300, 2º andar. Florianópolis, Santa Catarina. Contato telefônico — Setor de Psicologia: (48) 3221-2917.", margin: [0, 2, 0, 0] },
        ],
      },
    ],
  };
}

/** Monta o texto inicial do atestado a partir dos dados do paciente — o
 * psicólogo pode (e deve) revisar e editar livremente antes de emitir. */
export function composeAtestadoBodyText(client: Client, opts: { aptoPara: string; endereco: string; acompanhamentoDesde: string; motivo: string }) {
  const nascimento = client.birthDate ? new Date(client.birthDate).toLocaleDateString("pt-BR") : "XX/XX/XXXX";
  const desde = opts.acompanhamentoDesde ? new Date(opts.acompanhamentoDesde).toLocaleDateString("pt-BR") : "XX/XX/XXXX";
  return `Atesto¹ para os devidos fins que ${client.fullName || "XXXXXXXX"}, nascido(a) em ${nascimento}, residente à ${opts.endereco || "XXXX"}, está apta para ${opts.aptoPara || "XXXX"}. Está em acompanhamento psicológico nesta instituição² desde ${desde} por recomendação da equipe médica que a acompanha para a realização de ${opts.motivo || "XXXX"}. Participou dos encontros de forma assídua e encontra-se com humor estável, sono regular e sem alterações do senso-percepção.\n\nOs instrumentos utilizados para avaliação foram entrevistas clínicas, anamnese, psicoterapia individual e psico-orientação para o pré e pós cirúrgico individual.`;
}
