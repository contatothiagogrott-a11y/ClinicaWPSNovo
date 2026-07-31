import type { Role, User } from "../types";

/**
 * Papéis do sistema — fonte única da verdade no front-end.
 *
 * REGRA DE NEGÓCIO (definida com o Setor de Psicologia):
 * O SUPERVISOR não é apenas gestor. Ele é psicólogo com CRP ativo e ATENDE
 * pacientes, exatamente como o perfil PSICO. Por isso qualquer lista de
 * "profissionais atribuíveis" deve usar `isClinician`, nunca comparar
 * `role === "PSICO"` diretamente.
 *
 * O perfil ADMIN (Administrativo) NÃO é profissional de psicologia: cuida de
 * cadastro, agenda e fluxo, e não tem CRP nem acesso a conteúdo clínico
 * (sigilo profissional — Art. 9º do Código de Ética Profissional do Psicólogo).
 */

export type Gender = "FEMININO" | "MASCULINO" | "NAO_INFORMADO";

/**
 * Título profissional flexionado.
 *
 * Importa de verdade nos documentos: um atestado assinado como
 * "Psicólogo Maria Silva" identifica errado quem o emitiu, e documento
 * psicológico é assinado com título e CRP (Resolução CFP nº 06/2019).
 *
 * Sem gênero informado, usa-se a forma neutra — ninguém é obrigado a declarar
 * gênero para usar o sistema.
 */
const ROLE_LABELS_BY_GENDER: Record<Role, Record<Gender, string>> = {
  PSICO: {
    FEMININO: "Psicóloga",
    MASCULINO: "Psicólogo",
    NAO_INFORMADO: "Psicólogo(a)",
  },
  SUPERVISOR: {
    FEMININO: "Supervisora",
    MASCULINO: "Supervisor",
    NAO_INFORMADO: "Supervisor(a)",
  },
  ADMIN: {
    FEMININO: "Administrativa",
    MASCULINO: "Administrativo",
    NAO_INFORMADO: "Administrativo(a)",
  },
};

/** Rótulo do papel, flexionado quando o gênero for conhecido. */
export function roleLabel(role: Role | undefined | null, gender?: Gender | null): string {
  if (!role) return "";
  const porGenero = ROLE_LABELS_BY_GENDER[role];
  if (!porGenero) return role;
  return porGenero[gender ?? "NAO_INFORMADO"] ?? porGenero.NAO_INFORMADO;
}

/**
 * Título usado na ASSINATURA de documentos psicológicos.
 *
 * O Supervisor assina como psicólogo, não como supervisor: quem responde pelo
 * documento é o profissional inscrito no CRP. "Supervisora" é função interna,
 * não título profissional.
 */
export function signatureTitle(
  user: Pick<User, "role" | "gender" | "title"> | null | undefined
): string {
  if (!user) return "";
  // Título personalizado (ex.: "Psicóloga Organizacional") tem precedência.
  if (user.title && user.title.trim()) return user.title.trim();
  if (!isClinician(user)) return roleLabel(user.role, user.gender);
  return roleLabel("PSICO", user.gender);
}

/** Profissionais que atendem pacientes e assinam documentos: PSICO e SUPERVISOR. */
export function isClinician(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "PSICO" || user?.role === "SUPERVISOR";
}

/** Papéis que exigem CRP obrigatório no cadastro. */
export function requiresCrp(role: Role | undefined | null): boolean {
  return role === "PSICO" || role === "SUPERVISOR";
}

/** Lista de profissionais que podem ser responsáveis por pacientes/grupos. */
export function clinicians<T extends Pick<User, "role">>(users: T[]): T[] {
  return users.filter(isClinician);
}

/** Somente Supervisor e Administrativo podem transferir um caso (RBAC item 4). */
export function canTransferClient(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "SUPERVISOR" || user?.role === "ADMIN";
}

/** Quem pode ler a trilha de auditoria de um paciente. */
export function canViewAuditTrail(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "SUPERVISOR" || user?.role === "ADMIN";
}

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "NAO_INFORMADO", label: "Prefiro não informar" },
  { value: "FEMININO", label: "Feminino" },
  { value: "MASCULINO", label: "Masculino" },
];
