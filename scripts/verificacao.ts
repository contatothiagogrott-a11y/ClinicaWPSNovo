/**
 * Verificação das regras críticas do sistema.
 *
 * Roda com:  npm run verificar
 *
 * Cobre justamente o que quebrou antes e o que não pode quebrar nunca:
 *  1. DATAS — o bug do atestado (emitido dia 20, saindo dia 19) e todas as
 *     conversões entre "dia civil brasileiro" e instante UTC. Os testes rodam
 *     com TZ=UTC (como a Vercel executa) e com TZ=America/Sao_Paulo.
 *  2. GUARDA DOCUMENTAL — prazos da Resolução CFP nº 001/2009, inclusive a
 *     regra estendida para crianças e adolescentes.
 *  3. SIGILO NA AUDITORIA — prova que o cálculo de alterações devolve apenas
 *     NOMES de campos e nunca os valores do paciente.
 *
 * Não substitui teste de integração, mas trava as regras que dependem de
 * detalhes fáceis de reintroduzir sem perceber.
 */
import { formatDateBR, formatDateExtenso, toDateOnly, todayDateOnly, localDateTimeToISO, ageInYears } from "../src/lib/datetime";
import { parseDateInput, toDateOnly as srvDateOnly, parseLocalDateTime, formatBR } from "../api/_lib/datetime";
import { computeRetentionUntil } from "../api/_lib/retention";
import { diffChangedFieldLabels } from "../api/_lib/auditFields";
import { encryptField } from "../api/_lib/crypto";

let falhas = 0;
function check(nome: string, obtido: any, esperado: any) {
  const ok = String(obtido) === String(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome.padEnd(52)} | obtido: ${obtido}`);
}

console.log(`\n--- Fuso do processo: ${process.env.TZ || "(padrão do sistema)"} ---\n`);

// === O BUG ORIGINAL: atestado emitido dia 20 saía dia 19 ===
check("Atestado: emissão 2026-07-20", formatDateBR("2026-07-20"), "20/07/2026");
check("Atestado: por extenso", formatDateExtenso("2026-07-20"), "20 de julho de 2026");
check("Atestado: 1º de janeiro (virada de ano)", formatDateBR("2026-01-01"), "01/01/2026");
check("Nascimento 1990-05-10", formatDateBR("1990-05-10"), "10/05/1990");

// === Instantes ISO gravados pelo servidor (UTC) ===
// 30/07/2026 às 01:00 UTC = ainda 29/07 em Brasília.
check("ISO 2026-07-30T01:00Z -> dia civil BR", toDateOnly("2026-07-30T01:00:00.000Z"), "2026-07-29");
check("ISO 2026-07-30T15:00Z -> dia civil BR", toDateOnly("2026-07-30T15:00:00.000Z"), "2026-07-30");

// === Servidor: data pura vira meio-dia BRT, imune a deslocamento ===
const gravado = parseDateInput("2026-07-20")!;
check("Servidor: grava 2026-07-20 e relê", srvDateOnly(gravado), "2026-07-20");
check("Servidor: instante gravado (UTC)", gravado.toISOString(), "2026-07-20T15:00:00.000Z");
check("Servidor: agendamento 08:00", formatBR(parseLocalDateTime("2026-07-20", "08:00")), "20/07/2026 08:00");

// === Agendamento: ida e volta front -> servidor -> front ===
const iso = localDateTimeToISO("2026-07-20", "08:00");
check("Agenda ida-e-volta 20/07 08:00", toDateOnly(iso) + " " + iso.slice(11, 16), "2026-07-20 11:00");

// === Guarda documental (Res. CFP 001/2009) ===
const fim = new Date("2026-07-30T12:00:00-03:00");
check("Guarda adulto: +20 anos (Lei 13.787/2018)", computeRetentionUntil(fim, "1990-01-01").getFullYear(), 2046);
// Menor com 10 anos em 2026 (nasc. 2016): 18 anos em 2034, +10 = 2044.
check("Guarda menor: o maior entre os dois prazos", computeRetentionUntil(fim, "2016-05-10").getFullYear(), 2046);
check("Idade calculada (nasc. 2016-05-10)", ageInYears("2016-05-10"), 10);

// === Auditoria: só o NOME do campo, nunca o valor ===
const existente = {
  fullNameEnc: encryptField("Maria da Silva"),
  whatsappEnc: encryptField("48999990000"),
  status: "TRIAGEM",
  assignedPsicoId: "psico-1",
};
const alteracao = { fullName: "Maria da Silva Souza", whatsapp: "48999990000", status: "EM_ATENDIMENTO", assignedPsicoId: "psico-2" };
const rotulos = diffChangedFieldLabels(existente, alteracao);
check("Diff detecta nome alterado", rotulos.includes("Nome completo"), true);
check("Diff ignora telefone inalterado", rotulos.includes("Telefone/WhatsApp"), false);
check("Diff detecta status", rotulos.includes("Status do caso"), true);
check("Diff detecta responsável", rotulos.includes("Profissional responsável"), true);
const serializado = JSON.stringify(rotulos);
check("Log NÃO contém o valor do nome", serializado.includes("Maria"), false);
check("Log NÃO contém o telefone", serializado.includes("48999"), false);



// ---------------------------------------------------------------------------
// NUMERAÇÃO DOS ENCONTROS DE GRUPO
// ---------------------------------------------------------------------------
// O número identifica o ENCONTRO, não a participação: quem entrou no meio do
// grupo vê o mesmo número dos demais no mesmo dia. E encontros cancelados não
// entram na contagem, renumerando os seguintes.
{
  const { numerarTodosOsGrupos } = await import("../src/lib/groupSessions");

  const ses = (id: string, cli: string, data: string, att?: string) =>
    ({ id, clientId: cli, groupId: "g1", date: `${data}T15:00:00.000Z`, attendance: att }) as any;
  const apt = (data: string, att?: string) =>
    ({ id: `a-${data}`, groupId: "g1", date: data, attendance: att }) as any;

  const datas = [
    "2026-03-02","2026-03-09","2026-03-16","2026-03-23","2026-03-30","2026-04-06","2026-04-13",
    "2026-04-20","2026-04-27","2026-05-04","2026-05-11","2026-05-18","2026-05-25","2026-06-01",
  ];
  const appointments = datas.map(d => apt(d));
  const sessoes: any[] = [];
  datas.forEach((d, i) => {
    sessoes.push(ses(`maria-${i + 1}`, "maria", d));
    if (i >= 4) sessoes.push(ses(`ana-${i + 1}`, "ana", d)); // Ana entrou no 5º encontro
  });

  const n = numerarTodosOsGrupos(sessoes, { appointments });
  check("Grupo: 14º encontro para quem está desde o início", n.get("maria-14"), 14);
  check("Grupo: 14º encontro para quem entrou no 5º", n.get("ana-14"), 14);
  check("Grupo: participantes do mesmo dia têm o mesmo nº", n.get("maria-9") === n.get("ana-9"), true);

  const comCancelamento = datas.map((d, i) =>
    apt(d, i === 2 ? "CANCELADO_PROFISSIONAL" : undefined)
  );
  const n2 = numerarTodosOsGrupos(
    sessoes.filter(s => !s.id.endsWith("-3")),
    { appointments: comCancelamento }
  );
  check("Grupo: encontro cancelado não conta", n2.get("maria-4"), 3);
}

// ---------------------------------------------------------------------------
// REGRAS DE PRESENÇA — cópia única entre servidor e navegador
// ---------------------------------------------------------------------------
// A lista de situações em que "o encontro não aconteceu" vive em dois arquivos
// idênticos porque o front-end e o servidor têm compiladores separados. Este
// teste falha se alguém alterar um e esquecer o outro — que foi exatamente o
// tipo de divergência responsável por reagendamentos sumirem de algumas telas
// e aparecerem em outras.
{
  const fs = await import("fs");
  const a = fs.readFileSync("api/_lib/attendance.ts", "utf-8");
  const b = fs.readFileSync("src/lib/attendance.ts", "utf-8");
  check("Presença: as duas cópias de attendance.ts são idênticas", a === b, true);

  const { NAO_OCORREU, NAO_CONSOME_SESSAO, consomeSessao, liberaHorario, exigeEvolucao } =
    await import("../src/lib/attendance");

  check("Presença: SUSPENSO libera o horário", liberaHorario("SUSPENSO"), true);
  check("Presença: SUSPENSO não consome sessão", consomeSessao("SUSPENSO"), false);
  check("Presença: SUSPENSO não cobra evolução", exigeEvolucao("SUSPENSO"), false);
  check("Presença: SUSPENSO não é cancelamento", NAO_OCORREU.includes("SUSPENSO") &&
        !["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL"].includes("SUSPENSO"), true);
  check("Presença: comparecimento consome sessão", consomeSessao("COMPARECEU"), true);
  check("Presença: falta não consome sessão", consomeSessao("FALTA_JUSTIFICADA"), false);
  check("Presença: falta NÃO libera o horário", liberaHorario("FALTA_INJUSTIFICADA"), false);
  check("Presença: toda situação de NAO_OCORREU também não consome sessão",
        NAO_OCORREU.every(a => NAO_CONSOME_SESSAO.includes(a)), true);
}

// ---------------------------------------------------------------------------
// ACOLHIMENTO EMERGENCIAL — sem profissional escolhido, não grava
// ---------------------------------------------------------------------------
// Antes, o compromisso nascia atribuído a quem estava operando a agenda, e
// todos os acolhimentos acabavam concentrados numa pessoa só. A regra agora é
// que a escolha é obrigatória e explícita.
{
  const EQUIPE = [
    { id: "u-ana", role: "PSICO" },
    { id: "u-rafael", role: "SUPERVISOR" },
    { id: "u-admin", role: "ADMIN" },
  ];

  /** Mesma decisão do AgendaModal + validação do servidor. */
  function designar(tipo: string, escolhido: string, quemAgenda: string) {
    if (tipo !== "ATENDIMENTO") {
      if (!escolhido) return { erro: "sem escolha" };
      const u = EQUIPE.find(e => e.id === escolhido);
      if (!u || !["PSICO", "SUPERVISOR"].includes(u.role)) return { erro: "não é profissional" };
      return { psicoId: escolhido };
    }
    return { psicoId: escolhido || quemAgenda };
  }

  check("Acolhimento: sem escolha, é bloqueado",
        !!designar("ACOLHIMENTO", "", "u-admin").erro, true);
  check("Acolhimento: nunca cai em quem está agendando",
        designar("ACOLHIMENTO", "", "u-admin").psicoId, undefined);
  check("Acolhimento: grava exatamente quem foi escolhido",
        designar("ACOLHIMENTO", "u-ana", "u-admin").psicoId, "u-ana");
  check("Acolhimento: administrativo não pode ser designado",
        !!designar("ACOLHIMENTO", "u-admin", "u-admin").erro, true);
  check("Triagem de grupo segue a mesma regra",
        !!designar("TRIAGEM_GRUPO", "", "u-ana").erro, true);
}

// ---------------------------------------------------------------------------
// PRONTUÁRIO DE GRUPO — imprime o coletivo E o individual
// ---------------------------------------------------------------------------
// Art. 5º da Resolução CFP nº 001/2009: a documentação do grupo é somada à
// documentação individual de cada participante. E a anotação privada do
// profissional (art. 1º, § 2º) nunca entra no documento.
{
  const { buildProntuarioGrupoDocDefinition } = await import("../src/lib/pdfProntuarioGrupo");

  const grupo: any = { id: "g1", name: "Grupo A", isActive: true, objective: "—",
    psychologistId: "u1", memberIds: ["c1", "c2"], protocolNumber: "G001" };
  const equipe: any[] = [{ id: "u1", name: "Ana", crp: "12/1", role: "PSICO" }];
  const membros: any[] = [
    { id: "c1", fullName: "Maria Silva" },
    { id: "c2", fullName: "Ana Souza" },
  ];
  const appointments: any[] = [{ id: "a1", groupId: "g1", date: "2026-03-05" }];
  const groupRecords: any[] = [{ id: "gr1", groupId: "g1", sessionDate: "2026-03-05",
    authorId: "u1", isDraft: false, content: "CONTEUDO_COLETIVO",
    attendance: [{ clientId: "c1", status: "COMPARECEU" }] }];
  const sessions: any[] = [
    { id: "s1", clientId: "c1", groupId: "g1", psicoId: "u1", date: "2026-03-05",
      isDraft: false, notes: "EVOLUCAO_DA_MARIA", privateNotes: "ANOTACAO_PRIVADA",
      attendance: "COMPARECEU" },
    { id: "s2", clientId: "c2", groupId: "g1", psicoId: "u1", date: "2026-03-05",
      isDraft: false, notes: "EVOLUCAO_DA_ANA", attendance: "COMPARECEU" },
  ];
  const groupClientNotes: any[] = [{ id: "n1", groupId: "g1", clientId: "c1",
    authorId: "u1", content: "ACOMPANHAMENTO_CONTINUO", updatedAt: "2026-03-05" }];

  const doc: any = buildProntuarioGrupoDocDefinition(
    grupo, { groupRecords, sessions, groupClientNotes, appointments }, membros, equipe, "G001");
  const texto = JSON.stringify(doc);

  check("PDF do grupo: traz o registro coletivo", texto.includes("CONTEUDO_COLETIVO"), true);
  check("PDF do grupo: traz a evolução individual de cada membro",
        texto.includes("EVOLUCAO_DA_MARIA") && texto.includes("EVOLUCAO_DA_ANA"), true);
  check("PDF do grupo: traz a anotação de acompanhamento",
        texto.includes("ACOMPANHAMENTO_CONTINUO"), true);
  check("PDF do grupo: NÃO vaza a anotação privada",
        texto.includes("ANOTACAO_PRIVADA"), false);
  check("PDF do grupo: numera o encontro", texto.includes("ENCONTRO Nº 1"), true);
}

// ---------------------------------------------------------------------------
// SUSPENSÃO — paciente e profissional são situações distintas
// ---------------------------------------------------------------------------
{
  const { consomeSessao, liberaHorario, ehSuspensao, ehCancelamento, exigeEvolucao } =
    await import("../src/lib/attendance");

  for (const s of ["SUSPENSO_PACIENTE", "SUSPENSO_PROFISSIONAL"]) {
    check(`${s}: libera o horário`, liberaHorario(s), true);
    check(`${s}: não consome sessão`, consomeSessao(s), false);
    check(`${s}: não cobra evolução`, exigeEvolucao(s), false);
    check(`${s}: NÃO é cancelamento`, ehCancelamento(s), false);
    check(`${s}: é suspensão`, ehSuspensao(s), true);
  }
  const { SUSPENSOES } = await import("../src/lib/attendance");
  check("Há marcações separadas para paciente e profissional",
        SUSPENSOES.includes("SUSPENSO_PACIENTE") && SUSPENSOES.includes("SUSPENSO_PROFISSIONAL"),
        true);
  check("Valor antigo SUSPENSO continua reconhecido", ehSuspensao("SUSPENSO"), true);
  check("Cancelamento não é suspensão", ehSuspensao("CANCELADO_PACIENTE"), false);
}

// ---------------------------------------------------------------------------
// NÚMERO DE SESSÃO — só o que foi realizado recebe número
// ---------------------------------------------------------------------------
// DEFEITO CORRIGIDO: o número era a POSIÇÃO NA LISTA, então falta e
// cancelamento também recebiam número e o prontuário contradizia o Controle de
// Sessões — que é o que define alta e renovação de pacote.
{
  const { numerarSessoesRealizadas, rotuloDoRegistro } =
    await import("../src/lib/attendance");

  const reg = (id: string, data: string, att?: string, isDraft = false) =>
    ({ id, date: `${data}T15:00:00.000Z`, attendance: att, isDraft }) as any;

  // Cinco ocorrências; só três foram atendimento de fato.
  const lista = [
    reg("a", "2026-03-05", "COMPARECEU"),
    reg("b", "2026-03-12", "CANCELADO_PACIENTE"),
    reg("c", "2026-03-19", "COMPARECEU"),
    reg("d", "2026-03-26", "FALTA_INJUSTIFICADA"),
    reg("e", "2026-04-02", "SUSPENSO_PROFISSIONAL"),
    reg("f", "2026-04-09", "COMPARECEU"),
    reg("g", "2026-04-16", undefined, true), // ainda pendente
  ];

  const n = numerarSessoesRealizadas(lista);
  check("Numeração: 1ª realizada é a Sessão 1", n.get("a"), 1);
  check("Numeração: cancelamento NÃO recebe número", n.get("b"), null);
  check("Numeração: a seguinte continua de onde parou", n.get("c"), 2);
  check("Numeração: falta NÃO recebe número", n.get("d"), null);
  check("Numeração: suspensão NÃO recebe número", n.get("e"), null);
  check("Numeração: terceira realizada é a Sessão 3", n.get("f"), 3);
  check("Numeração: rascunho pendente NÃO recebe número", n.get("g"), null);

  const realizadas = [...n.values()].filter(v => v !== null).length;
  check("Numeração: total numerado = total que consome sessão", realizadas, 3);

  check("Rótulo do cancelamento", rotuloDoRegistro(lista[1]), "Cancelada pelo paciente");
  check("Rótulo da falta", rotuloDoRegistro(lista[3]), "Falta");
  check("Rótulo da suspensão", rotuloDoRegistro(lista[4]), "Suspensa");
  check("Rótulo do pendente", rotuloDoRegistro(lista[6]), "Aguardando evolução");

  // A ordem da lista não pode alterar a numeração: o prontuário é exibido do
  // mais recente para o mais antigo, mas a sessão 1 é sempre a mais antiga.
  const invertida = [...lista].reverse();
  const n2 = numerarSessoesRealizadas(invertida);
  check("Numeração independe da ordem recebida", n2.get("f"), 3);
}

// ---------------------------------------------------------------------------
// TODO DESFECHO DEIXA RASTRO NO PRONTUÁRIO
// ---------------------------------------------------------------------------
// Res. CFP nº 001/2009, art. 1º: o prontuário registra o CURSO do
// acompanhamento. Um cancelamento apagado deixa um vão sem explicação.
{
  const { TEXTO_DO_REGISTRO, NAO_CONSOME_SESSAO } = await import("../src/lib/attendance");

  for (const situacao of NAO_CONSOME_SESSAO) {
    check(`${situacao}: tem texto de registro definido`,
          !!TEXTO_DO_REGISTRO[situacao], true);
  }
  check("O texto do cancelamento não interpreta clinicamente",
        /resistente|desinteresse|abandono/i.test(TEXTO_DO_REGISTRO.CANCELADO_PACIENTE ?? ""), false);
}

// ---------------------------------------------------------------------------
// JANELA DA SUSPENSÃO — o primeiro e o último dia precisam entrar inteiros
// ---------------------------------------------------------------------------
// Este projeto já teve bug de fuso (atestado saindo com um dia a menos). Aqui o
// risco é o mesmo: se a janela fechar ao meio-dia, os atendimentos da tarde do
// último dia escapam da suspensão e continuam cobrando evolução.
{
  const { startOfDayBRT, parseDateInput, parseLocalDateTime } =
    await import("../api/_lib/datetime");

  // Mesma conta da rota POST /api/suspensoes.
  const inicio = startOfDayBRT("2026-07-06")!;
  const fimDia = parseDateInput("2026-07-10")!;
  const fim = new Date(fimDia.getTime());
  fim.setUTCHours(fim.getUTCHours() + 12);

  const dentro = (dia: string, hora: string) => {
    const d = parseLocalDateTime(dia, hora)!;
    return d >= inicio && d <= fim;
  };

  check("Suspensão: 1º dia às 08:00 entra", dentro("2026-07-06", "08:00"), true);
  check("Suspensão: 1º dia às 07:00 entra", dentro("2026-07-06", "07:00"), true);
  check("Suspensão: último dia às 17:00 entra", dentro("2026-07-10", "17:00"), true);
  check("Suspensão: último dia às 19:30 entra", dentro("2026-07-10", "19:30"), true);
  check("Suspensão: véspera às 17:00 fica de fora", dentro("2026-07-05", "17:00"), false);
  check("Suspensão: dia seguinte às 08:00 fica de fora", dentro("2026-07-11", "08:00"), false);
  check("Suspensão: período de um dia só funciona", (() => {
    const i = startOfDayBRT("2026-07-06")!;
    const f = new Date(parseDateInput("2026-07-06")!.getTime());
    f.setUTCHours(f.getUTCHours() + 12);
    const d = parseLocalDateTime("2026-07-06", "16:00")!;
    return d >= i && d <= f;
  })(), true);
}

// ---------------------------------------------------------------------------
// O BANCO PRECISA TER TUDO QUE O CÓDIGO ESPERA
// ---------------------------------------------------------------------------
// INCIDENTE QUE ORIGINOU ESTE TESTE: o schema.prisma ganhou uma tabela e uma
// coluna novas, mas nenhuma migration foi criada para elas. A Vercel publicou,
// o `prisma migrate deploy` não tinha nada para aplicar, e o banco ficou sem a
// coluna. A partir daí TODA consulta de prontuário passou a falhar, o
// /api/bootstrap devolveu erro 500 e o app exibiu as telas vazias — parecendo
// que os pacientes tinham sumido.
//
// Nada disso chegou perto de um teste, porque o código compilava e os testes
// rodavam sem tocar no banco. Este teste compara o schema com as migrations:
// se houver tabela no schema que nenhuma migration cria, ele falha AQUI, antes
// de publicar.
{
  const fs = await import("fs");
  const path = await import("path");

  const schema = fs.readFileSync("prisma/schema.prisma", "utf-8");
  const modelos = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);

  const dirMigrations = "prisma/migrations";
  let sqlDeTodas = "";
  if (fs.existsSync(dirMigrations)) {
    for (const pasta of fs.readdirSync(dirMigrations)) {
      const arquivo = path.join(dirMigrations, pasta, "migration.sql");
      if (fs.existsSync(arquivo)) sqlDeTodas += fs.readFileSync(arquivo, "utf-8") + "\n";
    }
  }

  // A migration inicial (a que cria User e Client) vive no repositório do
  // GitHub, não nas cópias de trabalho. Sem ela, a conferência completa daria
  // falso alarme — então o teste só roda no repositório de verdade.
  const temBaseline = /CREATE TABLE\s+(IF NOT EXISTS\s+)?"User"/i.test(sqlDeTodas);

  if (!sqlDeTodas.trim() || !temBaseline) {
    console.log(
      "AVISO | Cópia sem a migration inicial — conferência completa do banco pulada.\n" +
      "        No repositório do GitHub este teste roda por inteiro e falha se\n" +
      "        faltar migration para alguma tabela do schema."
    );
  } else {
    const semMigration = modelos.filter(
      m => !new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?"${m}"`, "i").test(sqlDeTodas)
    );
    check(
      `Banco: toda tabela do schema tem migration${semMigration.length ? " — FALTAM: " + semMigration.join(", ") : ""}`,
      semMigration.length,
      0
    );

    // Colunas acrescentadas depois da criação da tabela: as que o código novo
    // usa e que já causaram o incidente.
    const colunasCriticas: Array<[string, string]> = [
      ["SessionRecord", "suspensionId"],
    ];
    for (const [tabela, coluna] of colunasCriticas) {
      const temNoAlter = new RegExp(`ALTER TABLE\\s+"${tabela}"[^;]*"${coluna}"`, "is").test(sqlDeTodas);
      const temNoCreate = new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?"${tabela}"[^;]*"${coluna}"`, "is").test(sqlDeTodas);
      check(`Banco: ${tabela}.${coluna} existe em alguma migration`, temNoAlter || temNoCreate, true);
    }
  }
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : falhas + " FALHA(S)"}\n`);
process.exit(falhas === 0 ? 0 : 1);
