import type { SessionRecord } from "../types";
import { toDateOnly } from "./datetime";

/**
 * NUMERAÇÃO DOS ENCONTROS DE GRUPO
 * ================================
 *
 * O número é CALCULADO na leitura, não guardado no banco.
 *
 * Por que mudou: antes o número era gravado na criação do registro, e havia
 * DUAS fontes que discordavam entre si — o agendamento contava os registros
 * coletivos anteriores, enquanto o preenchimento retroativo usava a ordem dos
 * agendamentos. O mesmo encontro aparecia como "Sessão 3" numa tela e
 * "Sessão 5" noutra.
 *
 * Havia ainda um problema de fundo: número congelado não acompanha a
 * realidade. Cancelar o segundo encontro deixava a sequência 1, 3, 4, 5 — ou
 * pior, dois encontros diferentes com o mesmo número.
 *
 * Calculando na leitura, a sequência é sempre a posição cronológica real do
 * encontro dentro daquele grupo. Cancelou um? Os seguintes renumeram sozinhos.
 *
 * Encontros que NÃO ACONTECERAM (cancelados, reagendados) ficam de fora da
 * contagem: não são sessões do grupo.
 */

const NAO_CONTAM = [
  "CANCELADO_PACIENTE",
  "CANCELADO_PROFISSIONAL",
  "REAGENDADO",
];

/**
 * Devolve um mapa `idDaSessao -> número do encontro` para um grupo.
 *
 * Todos os participantes de um mesmo dia recebem o MESMO número — é o mesmo
 * encontro do grupo, visto pela ficha de cada pessoa.
 */
export function numerarEncontrosDoGrupo(
  sessoesDoGrupo: SessionRecord[]
): Map<string, number> {
  // Datas distintas dos encontros que de fato ocorrem, em ordem cronológica.
  const datas = Array.from(
    new Set(
      sessoesDoGrupo
        .filter(s => !NAO_CONTAM.includes(s.attendance ?? ""))
        .map(s => toDateOnly(s.date))
        .filter(Boolean)
    )
  ).sort();

  const posicaoPorData = new Map<string, number>();
  datas.forEach((d, i) => posicaoPorData.set(d, i + 1));

  const resultado = new Map<string, number>();
  for (const s of sessoesDoGrupo) {
    const n = posicaoPorData.get(toDateOnly(s.date));
    if (n) resultado.set(s.id, n);
  }
  return resultado;
}

/**
 * Numera os encontros de TODOS os grupos de uma vez.
 * Chave do resultado: id da sessão.
 */
export function numerarTodosOsGrupos(sessoes: SessionRecord[]): Map<string, number> {
  const porGrupo = new Map<string, SessionRecord[]>();
  for (const s of sessoes) {
    if (!s.groupId) continue;
    porGrupo.set(s.groupId, [...(porGrupo.get(s.groupId) ?? []), s]);
  }

  const total = new Map<string, number>();
  for (const [, lista] of porGrupo) {
    for (const [id, n] of numerarEncontrosDoGrupo(lista)) total.set(id, n);
  }
  return total;
}
