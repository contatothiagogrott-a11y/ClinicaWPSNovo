/**
 * SITUAÇÕES DE PRESENÇA — FONTE ÚNICA DA VERDADE
 * ==============================================
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * A lista de situações em que "o encontro não aconteceu" estava copiada e
 * colada em NOVE lugares diferentes do sistema: na agenda, no painel, na
 * numeração dos grupos, no contador de sessões e em quatro rotas de
 * manutenção. Toda vez que uma situação nova era criada, era preciso lembrar
 * de alterar os nove — e bastava esquecer um para o sistema passar a se
 * contradizer.
 *
 * Foi exatamente o que aconteceu com os reagendamentos: alguns apareciam na
 * ficha do paciente e outros não, porque lugares diferentes do código tinham
 * entendimentos diferentes sobre o que significa "reagendado".
 *
 * A partir daqui existe UM lugar só. Criar uma situação nova é acrescentar uma
 * linha aqui, e o sistema inteiro passa a tratá-la do mesmo jeito.
 *
 * ⚠️ Este arquivo tem uma cópia idêntica em `src/lib/attendance.ts` — o
 * front-end e o servidor têm compiladores separados e não compartilham pasta.
 * O teste `npm run verificar` compara os dois byte a byte e falha se
 * divergirem, então não é possível alterar um e esquecer o outro.
 *
 * CONFORMIDADE
 * ------------
 * LGPD Art. 6º, V (qualidade dos dados): o mesmo fato clínico — "a sessão não
 * ocorreu" — passa a ter uma definição única em todo o sistema, eliminando a
 * possibilidade de dois relatórios darem números diferentes para o mesmo
 * paciente. Resolução CFP nº 001/2009, art. 1º: o registro precisa refletir
 * fielmente o que aconteceu, e contagens divergentes de sessão comprometem a
 * fidedignidade do prontuário.
 */

export type Attendance =
  | "PENDENTE"
  | "COMPARECEU"
  | "FALTA_JUSTIFICADA"
  | "FALTA_INJUSTIFICADA"
  | "CANCELADO_PACIENTE"
  | "CANCELADO_PROFISSIONAL"
  | "REAGENDADO"
  /**
   * SUSPENSO_PACIENTE — o paciente se afastou (férias, viagem, licença).
   * SUSPENSO_PROFISSIONAL — a agenda do profissional parou.
   *
   * São duas situações separadas porque produzem indicadores opostos: a
   * primeira fala da disponibilidade do paciente, a segunda da capacidade do
   * serviço. Somadas num rótulo só, o setor perderia a única informação que
   * importa para planejar escala.
   */
  | "SUSPENSO_PACIENTE"
  | "SUSPENSO_PROFISSIONAL"
  /** Valor antigo, anterior à separação. Mantido para os registros já gravados. */
  | "SUSPENSO";

/**
 * O ENCONTRO NÃO ACONTECEU — e não por ausência do paciente.
 *
 * Consequências, iguais para todos os itens desta lista:
 *   - o horário e a sala ficam LIVRES para outro agendamento;
 *   - não entra na linha do tempo do grupo (não vira "encontro nº X");
 *   - o rascunho de prontuário em branco é removido — não houve ato clínico;
 *   - não consome sessão do pacote do paciente.
 *
 * SUSPENSO (férias ou afastamento do profissional) está aqui e NÃO em
 * cancelamento de propósito: cancelamento é decisão sobre aquele atendimento,
 * suspensão é indisponibilidade do serviço. Misturar os dois faria os
 * indicadores de adesão do setor acusarem abandono onde houve férias.
 */
export const SUSPENSOES: readonly Attendance[] = [
  "SUSPENSO_PACIENTE",
  "SUSPENSO_PROFISSIONAL",
  "SUSPENSO",
] as const;

export const CANCELAMENTOS: readonly Attendance[] = [
  "CANCELADO_PACIENTE",
  "CANCELADO_PROFISSIONAL",
] as const;

export const NAO_OCORREU: readonly Attendance[] = [
  ...CANCELAMENTOS,
  "REAGENDADO",
  ...SUSPENSOES,
] as const;

/** O paciente não compareceu. É dado clínico e PERMANECE no prontuário. */
export const FALTAS: readonly Attendance[] = [
  "FALTA_JUSTIFICADA",
  "FALTA_INJUSTIFICADA",
] as const;

/**
 * Não consome sessão do pacote contratado nem cobra evolução escrita.
 * Faltas entram aqui: o setor decidiu que ausência não gasta sessão.
 */
export const NAO_CONSOME_SESSAO: readonly Attendance[] = [
  ...FALTAS,
  ...NAO_OCORREU,
] as const;

/** Mesma regra: sem encontro e sem presença, não há evolução a escrever. */
export const NAO_EXIGE_EVOLUCAO = NAO_CONSOME_SESSAO;

/** Situações que liberam a sala e o horário para outro agendamento. */
export const LIBERA_HORARIO = NAO_OCORREU;

export function naoOcorreu(a?: string | null): boolean {
  return !!a && (NAO_OCORREU as readonly string[]).includes(a);
}

export function ehSuspensao(a?: string | null): boolean {
  return !!a && (SUSPENSOES as readonly string[]).includes(a);
}

export function ehCancelamento(a?: string | null): boolean {
  return !!a && (CANCELAMENTOS as readonly string[]).includes(a);
}

export function consomeSessao(a?: string | null): boolean {
  return !a || !(NAO_CONSOME_SESSAO as readonly string[]).includes(a);
}

export function exigeEvolucao(a?: string | null): boolean {
  return !a || !(NAO_EXIGE_EVOLUCAO as readonly string[]).includes(a);
}

export function liberaHorario(a?: string | null): boolean {
  return naoOcorreu(a);
}

/** Rótulos exibidos ao usuário. */
export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  PENDENTE: "Pendente",
  COMPARECEU: "Compareceu",
  FALTA_JUSTIFICADA: "Falta justificada",
  FALTA_INJUSTIFICADA: "Falta sem justificativa",
  CANCELADO_PACIENTE: "Cancelado pelo paciente",
  CANCELADO_PROFISSIONAL: "Cancelado pelo serviço",
  REAGENDADO: "Reagendado",
  SUSPENSO_PACIENTE: "Suspenso — afastamento do paciente",
  SUSPENSO_PROFISSIONAL: "Suspenso — afastamento do profissional",
  SUSPENSO: "Suspenso (férias/afastamento)",
};

/**
 * TEXTO DO REGISTRO AUTOMÁTICO NO PRONTUÁRIO.
 *
 * Todo desfecho que não é comparecimento deixa uma entrada no prontuário. O
 * art. 1º da Resolução CFP nº 001/2009 trata o prontuário como registro do
 * CURSO do acompanhamento: um intervalo sem explicação é lacuna documental.
 *
 * O texto é descritivo e NÃO interpreta. "Cancelado pelo paciente" é fato
 * verificável; "paciente resistente ao processo" seria interpretação clínica,
 * que cabe ao profissional escrever — nunca ao sistema.
 */
export const TEXTO_DO_REGISTRO: Partial<Record<Attendance, string>> = {
  FALTA_JUSTIFICADA: "Paciente não compareceu ao atendimento — falta justificada.",
  FALTA_INJUSTIFICADA: "Paciente não compareceu ao atendimento — falta sem justificativa.",
  CANCELADO_PACIENTE: "Atendimento cancelado pelo paciente. Não houve encontro.",
  CANCELADO_PROFISSIONAL: "Atendimento cancelado pelo serviço. Não houve encontro.",
  REAGENDADO: "Atendimento reagendado para outra data. Não houve encontro nesta.",
  SUSPENSO_PACIENTE: "Atendimento suspenso por afastamento do paciente.",
  SUSPENSO_PROFISSIONAL: "Atendimento suspenso por afastamento do profissional.",
  SUSPENSO: "Atendimento suspenso.",
};

/**
 * Rótulo curto exibido no lugar do número da sessão, quando o encontro não
 * aconteceu. O número de sessão pertence só ao que foi efetivamente realizado.
 */
export const ROTULO_NAO_REALIZADA: Partial<Record<Attendance, string>> = {
  FALTA_JUSTIFICADA: "Falta justificada",
  FALTA_INJUSTIFICADA: "Falta",
  CANCELADO_PACIENTE: "Cancelada pelo paciente",
  CANCELADO_PROFISSIONAL: "Cancelada pelo serviço",
  REAGENDADO: "Reagendada",
  SUSPENSO_PACIENTE: "Suspensa",
  SUSPENSO_PROFISSIONAL: "Suspensa",
  SUSPENSO: "Suspensa",
};

/** Lista para uso direto em consultas Prisma (`in:`), que não aceita readonly. */
export const NAO_CONSOME_SESSAO_SQL: string[] = [...NAO_CONSOME_SESSAO];
export const NAO_OCORREU_SQL: string[] = [...NAO_OCORREU];

/**
 * NUMERAÇÃO DAS SESSÕES NO PRONTUÁRIO
 * ===================================
 *
 * DEFEITO CORRIGIDO: o número exibido em cada registro era a POSIÇÃO NA LISTA,
 * não a contagem de atendimentos. Uma falta aparecia como "Sessão 7" mesmo sem
 * contar no Controle de Sessões — o documento e o contador se contradiziam, e
 * é o contador que define alta e renovação de pacote.
 *
 * Com os cancelamentos passando a aparecer no prontuário, manter a posição
 * como número pioraria o problema: cada cancelamento empurraria toda a
 * numeração para cima.
 *
 * Aqui o número é dado APENAS a quem consumiu sessão, em ordem cronológica.
 * O resto recebe `null` e é exibido com o rótulo do desfecho.
 *
 * Chave do resultado: id do registro.
 */
export function numerarSessoesRealizadas(
  registros: Array<{ id: string; date: string; attendance?: string | null; isDraft?: boolean }>
): Map<string, number | null> {
  const emOrdem = [...registros].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const mapa = new Map<string, number | null>();
  let n = 0;
  for (const r of emOrdem) {
    if (r.isDraft) { mapa.set(r.id, null); continue; }   // ainda não realizada
    if (!consomeSessao(r.attendance)) { mapa.set(r.id, null); continue; }
    n += 1;
    mapa.set(r.id, n);
  }
  return mapa;
}

/** Rótulo a exibir quando o registro não recebe número de sessão. */
export function rotuloDoRegistro(r: { attendance?: string | null; isDraft?: boolean }): string {
  if (r.isDraft) return "Aguardando evolução";
  const a = r.attendance as Attendance | undefined;
  if (a && ROTULO_NAO_REALIZADA[a]) return ROTULO_NAO_REALIZADA[a]!;
  return "Não realizada";
}
