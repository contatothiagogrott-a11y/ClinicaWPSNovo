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

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : falhas + " FALHA(S)"}\n`);
process.exit(falhas === 0 ? 0 : 1);
