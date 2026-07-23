// Sistema de cores por CONTAGEM de sessões (não percentual) — pensado para
// controle rápido de gestão: de 1 a 8 sessões é verde (tranquilo), 9-10
// amarelo (atenção), 11-15 laranja (acompanhar de perto), 16+ vermelho
// (caso de longa duração, vale revisão clínica/administrativa).

export interface SessionTier {
  label: string;
  textColor: string;
  bgColor: string;
  dotColor: string;
}

export function getSessionTier(completedSessions: number): SessionTier {
  const n = completedSessions || 0;
  if (n <= 0) {
    return { label: "Sem sessões ainda", textColor: "#64748b", bgColor: "#f1f5f9", dotColor: "#94a3b8" };
  }
  if (n <= 8) {
    return { label: `${n} sessões`, textColor: "#15803d", bgColor: "#dcfce7", dotColor: "#22c55e" };
  }
  if (n <= 10) {
    return { label: `${n} sessões`, textColor: "#a16207", bgColor: "#fef9c3", dotColor: "#eab308" };
  }
  if (n <= 15) {
    return { label: `${n} sessões`, textColor: "#c2410c", bgColor: "#ffedd5", dotColor: "#f97316" };
  }
  return { label: `${n} sessões`, textColor: "#b91c1c", bgColor: "#fee2e2", dotColor: "#ef4444" };
}

export const SESSION_TIER_LEGEND = [
  { range: "1 – 8", ...getSessionTier(1) },
  { range: "9 – 10", ...getSessionTier(9) },
  { range: "11 – 15", ...getSessionTier(11) },
  { range: "16+", ...getSessionTier(16) },
];
