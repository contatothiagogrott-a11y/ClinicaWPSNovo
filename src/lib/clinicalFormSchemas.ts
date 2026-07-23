// Schemas dos formulários clínicos. O mesmo schema alimenta tanto o
// formulário preenchível na tela quanto o PDF gerado — assim os dois nunca
// ficam dessincronizados.
//
// Baseado fielmente nos modelos fornecidos pela clínica:
// - "Triagem/Anamnese (em branco)"
// - "Instrumento de Avaliação de Fatores de Risco e Proteção e Definição
//    da Classificação de Risco"
// Os dois documentos foram unificados em um só, já que se referenciam
// (a anamnese alimenta a definição de risco).

export type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "yesno"
  | "yesno_na"
  | "select"
  | "check"
  | "number";

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  half?: boolean; // ocupa metade da linha ao lado do próximo campo `half`
}

export interface SectionSchema {
  title: string;
  fields: FieldSchema[];
  note?: string;
}

const fatoresRisco = [
  "Histórico de Transtorno Mental (ou associado)",
  "Tentativa de suicídio prévia",
  "Uso abusivo de substâncias",
  "Situação de violência ou assédio",
  "Isolamento",
  "Falta de apoio social",
  "Suicídio na família",
  "Discórdia familiar",
  "Relações conflituosas",
  "Desemprego",
  "Derrocada financeira/hipossuficiência",
  "Não adere ao tratamento",
  "Desilusão amorosa",
  "Pensamentos de morte",
];

const fatoresProtecao = [
  "Flexibilidade Cognitiva",
  "Habilidade para solucionar problemas",
  "Apoio familiar em situações de necessidade",
  "Boa integração e bons relacionamentos em grupos sociais",
  "Adesão a valores e normas socialmente compartilhados",
  "Rede social que oferece apoio prático e emocional",
  "Disponibilidade e acesso a serviços de saúde mental",
  "Estar empregado",
  "Prática de uma religião ou outras práticas coletivas (esportes, atividades artísticas, culturais)",
  "Disponibilidade e abertura em buscar ajuda",
  "Regularidade do sono",
  "Disponibilidade de recursos financeiros",
  "Bons hábitos alimentares",
  "Bom relacionamento interpessoal",
];

const estadoMentalAtual = [
  "Delírio", "Desespero", "Ansiedade",
  "Desesperança", "Instabilidade do Humor", "Constrição Cognitiva (não vê outra saída)",
  "Insônia", "Incapacitação", "Impulsividade",
  "Agressividade", "Inquietude", "Alucinação",
];

export const ANAMNESE_RISCO_SECTIONS: SectionSchema[] = [
  {
    title: "Dados de Identificação",
    fields: [
      { key: "curso_formacao", label: "Curso/Formação", type: "text" },
      { key: "endereco", label: "Endereço", type: "text", half: true },
      { key: "bairro", label: "Bairro", type: "text", half: true },
      { key: "estado_civil", label: "Estado Civil", type: "select", options: ["Solteiro(a)", "Amasiado(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)"] },
    ],
  },
  {
    title: "Queixa Principal",
    fields: [
      { key: "queixa_motivo", label: "O que fez você buscar atendimento psicológico?", type: "textarea" },
      { key: "queixa_tipo_sintoma", label: "Possui sintomas físicos e/ou psicológicos?", type: "select", options: ["Físicos", "Psicológicos", "Ambos", "N/A"] },
      { key: "queixa_descricao", label: "Breve descrição", type: "textarea" },
      { key: "queixa_tempo_sintomas", label: "Há quanto tempo percebe os sintomas?", type: "select", options: ["Menos de 1 mês", "Mais de 1 mês, menos de 6 meses", "Mais de 6 meses"] },
      { key: "queixa_natureza", label: "Queixa", type: "select", options: ["Súbita", "Progressiva"] },
      { key: "queixa_mudanca_recente", label: "Aconteceu alguma mudança significativa recentemente?", type: "textarea" },
    ],
  },
  {
    title: "Diagnóstico Prévio",
    fields: [
      { key: "diagnostico_previo", label: "Possui algum diagnóstico prévio? (Psiquiátrico, físico ou outro)", type: "yesno" },
      { key: "diagnostico_previo_descricao", label: "Breve descrição", type: "textarea" },
      { key: "historico_familiar", label: "Histórico médico e psiquiátrico familiar? (transtornos mentais, doenças físicas e outros)", type: "textarea" },
      { key: "historico_internacao", label: "Histórico de internações psiquiátricas?", type: "yesno" },
      { key: "diagnostico_observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    title: "Uso de Medicamentos",
    fields: [
      { key: "medicamento_uso_continuo", label: "Faz uso contínuo de algum medicamento?", type: "yesno" },
      { key: "medicamento_nome", label: "Nome/composição", type: "text" },
      { key: "medicamento_indicacao", label: "Indicação", type: "text" },
      { key: "medicamento_acompanhamento", label: "Tem acesso a acompanhamento médico para manutenção do medicamento?", type: "yesno" },
    ],
  },
  {
    title: "Uso de Substâncias",
    fields: [
      { key: "substancia_uso", label: "Faz uso contínuo de alguma substância ilegal ou com potencial de adicção (viciante)?", type: "yesno" },
      { key: "substancia_quais", label: "Quais (álcool, tabaco, maconha/cannabis, anfetaminas, alucinógenos, outras)", type: "textarea" },
      { key: "substancia_observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    title: "Uso da Rede de Saúde",
    fields: [
      { key: "rede_saude_acompanhamento", label: "Atualmente, tem acompanhamento psicológico?", type: "yesno" },
      { key: "rede_saude_ubs", label: "Tem UBS e/ou médico de referência?", type: "yesno" },
      { key: "rede_saude_observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    title: "Rede de Apoio",
    fields: [
      { key: "rede_apoio_pessoas", label: "Você tem pessoas com quem pode contar no dia a dia?", type: "yesno" },
      { key: "rede_apoio_quem", label: "Com quem você conta no dia a dia? (família, amigos, cônjuge)", type: "textarea" },
    ],
  },
  {
    title: "Condição Socioeconômica",
    fields: [
      { key: "socio_pessoas_moram_junto", label: "Quantas pessoas moram com você?", type: "number" },
      { key: "socio_renda_familiar", label: "Renda familiar aproximada (por integrante)", type: "select", options: ["Menos de 1 salário mínimo", "De 1 a 2 salários", "De 2 a 5 salários", "De 5 a 10 salários", "Mais de 10 salários"] },
      { key: "socio_informacoes_adicionais", label: "Informações adicionais", type: "textarea" },
    ],
  },
  {
    title: "Risco de Vida",
    fields: [
      { key: "risco_violencia", label: "Você está passando por alguma situação de violência (física, psicológica, sexual...)?", type: "yesno" },
      { key: "risco_anedonia", label: "Nas duas últimas semanas você teve o sentimento de não ter mais gosto por nada, de ter perdido o interesse e prazer pelas coisas que lhe agradavam habitualmente?", type: "yesno" },
      { key: "risco_historico_suicidio_familiar", label: "Tem histórico familiar de suicídio?", type: "yesno" },
      { key: "risco_observacoes", label: "Observação", type: "textarea" },
    ],
  },
  {
    title: "Estado Mental Atual",
    fields: [
      ...estadoMentalAtual.map((f, i) => ({ key: `estado_mental_${i}`, label: f, type: "check" as const })),
      { key: "estado_mental_observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    title: "Fatores de Risco",
    fields: fatoresRisco.map((f, i) => ({ key: `fator_risco_${i}`, label: f, type: "yesno_na" as const })),
  },
  {
    title: "Fatores de Proteção",
    fields: fatoresProtecao.map((f, i) => ({ key: `fator_protecao_${i}`, label: f, type: "yesno_na" as const })),
  },
  {
    title: "Vulnerabilidade Social",
    fields: [
      { key: "vulnerabilidade_membros_rede", label: "Membros reconhecidos na rede de suporte (nomes e tipo de vínculo)", type: "textarea" },
      { key: "vulnerabilidade_dependencia_rede", label: "Dependabilidade da rede de suporte", type: "select", options: ["Ausente", "Baixa", "Média", "Alta"] },
    ],
  },
  {
    title: "Classificação de Risco",
    fields: [
      { key: "classificacao_risco", label: "Classificação", type: "select", options: ["Emergencial (Gravíssimo)", "Urgência (Alto Risco)", "Médio Risco", "Baixo Risco"] },
      { key: "encaminhamento", label: "Encaminhamento", type: "select", options: ["Atendimento Clínico", "Encaminhamento à Atenção Primária", "Encaminhamento à Atenção Secundária", "Encaminhamento à Atenção Terciária (Alta Complexidade)", "Encaminhamento à Clínica Médica", "Encaminhamento ao Serviço Social", "Outro"] },
      { key: "encaminhamento_observacoes", label: "Observações do encaminhamento", type: "textarea" },
    ],
  },
];

export const URGENCIA_SECTIONS: SectionSchema[] = [
  {
    title: "Identificação do Atendimento",
    fields: [
      { key: "data_hora", label: "Data e hora do acionamento", type: "date" },
      { key: "local", label: "Local do atendimento", type: "text" },
      { key: "via_chegada", label: "Como chegou até o Setor de Psicologia", type: "select", options: ["Procura espontânea", "Encaminhamento da chefia/setor", "Encaminhamento médico/ambulatório", "Acionado por terceiros (colega, familiar)", "Encaminhado pela Segurança/Brigada", "Outro"] },
    ],
  },
  {
    title: "Motivo do Acionamento",
    fields: [
      { key: "motivo", label: "Motivo do acionamento de urgência", type: "textarea" },
      { key: "relato", label: "Breve relato do ocorrido", type: "textarea" },
      { key: "risco_vida_iminente", label: "Há risco de vida iminente?", type: "yesno" },
    ],
  },
  {
    title: "Intervenção Realizada",
    fields: [
      { key: "intervencao", label: "Intervenção realizada pelo profissional", type: "textarea" },
      { key: "contato_emergencia_acionado", label: "Contato de emergência do paciente foi acionado?", type: "yesno" },
      { key: "servicos_externos_acionados", label: "Serviços externos acionados (SAMU, CAPS, etc.)", type: "text" },
    ],
  },
  {
    title: "Desfecho",
    fields: [
      { key: "estado_final", label: "Estado do paciente ao final do atendimento", type: "textarea" },
      { key: "encaminhamento_desfecho", label: "Encaminhamento", type: "select", options: ["Retornou ao ambiente de origem", "Encaminhado a atendimento contínuo/anamnese", "Encaminhado a serviço de emergência externo", "Outro"] },
      { key: "observacoes_finais", label: "Observações finais", type: "textarea" },
    ],
  },
];
