import type { Appointment, GroupRecord, SessionRecord } from "../types";
import { toDateOnly } from "./datetime";

/**
 * NUMERAÇÃO DOS ENCONTROS DE GRUPO
 * ================================
 *
 * O número identifica O ENCONTRO DO GRUPO, não a participação da pessoa.
 * "Sessão 14" é o décimo quarto encontro daquele grupo — e vale igual para
 * todo mundo que estava lá, inclusive para quem entrou no meio do processo.
 *
 * ERRO CORRIGIDO
 * --------------
 * A versão anterior numerava a partir das SESSÕES DO PACIENTE. Quem entrou
 * depois do início do grupo só tinha registros a partir da sua entrada, então
 * a contagem começava do zero para ele: no 14º encontro do grupo, alguém que
 * entrou no 5º via "Sessão 10". Cada participante via um número diferente
 * para o mesmo dia.
 *
 * A linha do tempo correta vem dos ENCONTROS DO GRUPO — os agendamentos e os
 * registros coletivos — e não das fichas individuais.
 *
 * Encontros que não aconteceram (cancelados, reagendados) ficam fora da
 * contagem: não são sessões do grupo. E como o número é calculado na leitura,
 * cancelar um encontro renumera os seguintes automaticamente, sem deixar
 * buracos na sequência.
 */

const NAO_CONTAM = ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL", "REAGENDADO"];

export interface FontesDeEncontro {
  /** Agendamentos do grupo — a fonte primária da linha do tempo. */
  appointments?: Appointment[];
  /** Registros coletivos, para encontros lançados fora da agenda. */
  groupRecords?: GroupRecord[];
  /** Sessões individuais, como último recurso. */
  sessions?: SessionRecord[];
}

/**
 * Linha do tempo de um grupo: as datas dos encontros que de fato ocorreram,
 * em ordem cronológica.
 */
function datasDosEncontros(groupId: string, fontes: FontesDeEncontro): string[] {
  const datas = new Set<string>();

  for (const a of fontes.appointments ?? []) {
    if (a.groupId !== groupId) continue;
    if (NAO_CONTAM.includes(a.attendance ?? "")) continue;
    const d = toDateOnly(a.date);
    if (d) datas.add(d);
  }

  for (const r of fontes.groupRecords ?? []) {
    if (r.groupId !== groupId) continue;
    const d = toDateOnly(r.sessionDate);
    if (d) datas.add(d);
  }

  // Sessões individuais completam a linha do tempo quando o encontro não tem
  // agendamento nem registro coletivo (casos antigos, lançados na mão).
  for (const s of fontes.sessions ?? []) {
    if (s.groupId !== groupId) continue;
    if (NAO_CONTAM.includes(s.attendance ?? "")) continue;
    const d = toDateOnly(s.date);
    if (d) datas.add(d);
  }

  return Array.from(datas).sort();
}

/** Mapa `data (YYYY-MM-DD) -> número do encontro` para um grupo. */
export function numerarDatasDoGrupo(
  groupId: string,
  fontes: FontesDeEncontro
): Map<string, number> {
  const mapa = new Map<string, number>();
  datasDosEncontros(groupId, fontes).forEach((d, i) => mapa.set(d, i + 1));
  return mapa;
}

/**
 * Numera as sessões individuais de TODOS os grupos.
 * Chave do resultado: id da sessão.
 *
 * Como a numeração vem da linha do tempo do GRUPO, dois participantes do mesmo
 * encontro recebem sempre o mesmo número — independentemente de quando cada um
 * entrou.
 */
export function numerarTodosOsGrupos(
  sessions: SessionRecord[],
  fontes: Omit<FontesDeEncontro, "sessions"> = {}
): Map<string, number> {
  const gruposEnvolvidos = new Set(
    sessions.filter(s => s.groupId).map(s => s.groupId as string)
  );

  const resultado = new Map<string, number>();

  for (const groupId of gruposEnvolvidos) {
    const porData = numerarDatasDoGrupo(groupId, { ...fontes, sessions });
    for (const s of sessions) {
      if (s.groupId !== groupId) continue;
      if (NAO_CONTAM.includes(s.attendance ?? "")) continue;
      const n = porData.get(toDateOnly(s.date));
      if (n) resultado.set(s.id, n);
    }
  }

  return resultado;
}
