/**
 * Gera os PDFs dos modelos com dados FICTÍCIOS, para apresentação.
 * Script de apoio — não faz parte do sistema publicado.
 */
import fs from "fs";
import path from "path";
import pdfPrinterImport from "pdfmake";
const PdfPrinter: any = (pdfPrinterImport as any).default ?? pdfPrinterImport;
import { buildAnamneseRiscoDocDefinition } from "../src/lib/pdfAnamneseRisco";
import { buildUrgenciaDocDefinition } from "../src/lib/pdfUrgencia";

const paciente: any = {
  id: "c-demo",
  fullName: "MARIA APARECIDA DEMONSTRAÇÃO (dados fictícios)",
  birthDate: "1982-01-15",
  registrationCode: "13530",
  sector: "TVAL",
  whatsapp: "(48) 99192-3890",
  protocolNumber: "121",
  emergencyContactName: "João Demonstração (cônjuge)",
  emergencyContactPhone: "(48) 99999-0000",
  affiliation: "Servidor",
};

const autor: any = { id: "u1", name: "Ana Paula Exemplo", crp: "12/11111", role: "PSICO", gender: "FEMININO" };

const docAnamnese: any = {
  id: "d1", clientId: "c-demo", type: "ANAMNESE_RISCO",
  createdAt: "2026-09-30T13:00:00.000Z", authorId: "u1", authorName: autor.name,
  data: {
    curso_formacao: "Ensino superior completo — Administração",
    endereco: "Rua das Palmeiras, 120", bairro: "Centro", estado_civil: "Casado(a)",
    queixa_motivo: "Relata sobrecarga de trabalho e dificuldade para desligar das demandas fora do expediente. Procurou o setor por sugestão da chefia imediata.",
    queixa_tipo_sintoma: "Ambos",
    queixa_descricao: "Insônia inicial, irritabilidade e tensão muscular na região cervical. Refere choro fácil nas últimas semanas.",
    queixa_tempo_sintomas: "Mais de 1 mês, menos de 6 meses",
    queixa_natureza: "Progressiva",
    queixa_mudanca_recente: "Mudança de setor há quatro meses, com aumento de atribuições sem alteração de equipe.",
    diagnostico_previo: "Não",
    diagnostico_previo_descricao: "—",
    historico_familiar: "Mãe com histórico de tratamento para ansiedade.",
    historico_internacao: "Não",
    diagnostico_observacoes: "Sem acompanhamento psiquiátrico prévio.",
    medicamento_uso_continuo: "Não",
    medicamento_nome: "—", medicamento_indicacao: "—", medicamento_acompanhamento: "—",
    substancia_uso: "Não", substancia_quais: "—",
    substancia_observacoes: "Refere consumo social de álcool, esporádico.",
    rede_saude_acompanhamento: "Sim", rede_saude_ubs: "UBS Centro",
    rede_saude_observacoes: "Acompanhamento clínico anual em dia.",
    rede_apoio_pessoas: "Sim", rede_apoio_quem: "Cônjuge, irmã e duas colegas de trabalho.",
    socio_pessoas_moram_junto: "3", socio_renda_familiar: "Não informado por opção",
    socio_informacoes_adicionais: "Residência própria, sem dependentes menores.",
    risco_violencia: "Não", risco_anedonia: "Não", risco_historico_suicidio_familiar: "Não",
    risco_observacoes: "Sem ideação suicida atual ou pregressa. Nega autolesão.",
    estado_mental_observacoes: "Orientada em tempo e espaço, discurso coerente, humor ansioso, afeto congruente. Senso-percepção preservado. Crítica presente.",
    vulnerabilidade_membros_rede: "Não", vulnerabilidade_dependencia_rede: "Não",
    classificacao_risco: "Baixo",
    encaminhamento: "Atendimento individual no Setor de Psicologia",
    encaminhamento_observacoes: "Proposta inicial de 8 encontros semanais, com reavaliação ao final.",
  },
};

const docUrgencia: any = {
  id: "d2", clientId: "c-demo", type: "URGENCIA",
  createdAt: "2026-09-30T13:00:00.000Z", authorId: "u1", authorName: autor.name,
  data: {
    data_hora: "2026-09-24",
    local: "Sala 2 — Setor de Psicologia",
    via_chegada: "Encaminhamento da chefia/setor",
    motivo: "Crise de choro intensa durante o expediente, com hiperventilação, presenciada pela equipe.",
    relato: "Servidora relata ter recebido notícia familiar grave por telefone momentos antes. Apresentou-se com respiração acelerada, tremor de extremidades e dificuldade de falar em frases completas.",
    risco_vida_iminente: "Não",
    intervencao: "Acolhimento em sala reservada. Técnica de respiração diafragmática e ancoragem sensorial. Escuta do conteúdo mobilizador. Permanência de 40 minutos até estabilização.",
    contato_emergencia_acionado: "Sim",
    servicos_externos_acionados: "Nenhum",
    estado_final: "Respiração regularizada, discurso organizado, orientada. Refere alívio e capacidade de retomar o dia.",
    encaminhamento_desfecho: "Encaminhado a atendimento contínuo/anamnese",
    observacoes_finais: "Agendado retorno para anamnese em 27/09. Chefia orientada quanto à liberação do restante do expediente.",
  },
};

// --- impressão ------------------------------------------------------------
// pdfmake 0.3 exporta uma INSTÂNCIA pronta (não uma classe), e as fontes são
// registradas com addFonts.
PdfPrinter.addFonts({
  Roboto: {
    normal: path.join("node_modules", "pdfmake", "build", "fonts", "Roboto", "Roboto-Regular.ttf"),
    bold: path.join("node_modules", "pdfmake", "build", "fonts", "Roboto", "Roboto-Medium.ttf"),
    italics: path.join("node_modules", "pdfmake", "build", "fonts", "Roboto", "Roboto-Italic.ttf"),
    bolditalics: path.join("node_modules", "pdfmake", "build", "fonts", "Roboto", "Roboto-MediumItalic.ttf"),
  },
});

const saida = process.env.SAIDA || "/mnt/user-data/outputs";
fs.mkdirSync(saida, { recursive: true });

async function escrever(nome: string, docDef: any) {
  const destino = path.join(saida, nome);
  await PdfPrinter.createPdf(docDef).write(destino);
  console.log("gerado:", destino);
}

await escrever("MODELO-Anamnese-Classificacao-de-Risco.pdf",
  buildAnamneseRiscoDocDefinition(paciente, docAnamnese, autor) as any);
await escrever("MODELO-Registro-de-Atendimento-de-Urgencia.pdf",
  buildUrgenciaDocDefinition(paciente, docUrgencia, autor) as any);
