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

export const ROLE_LABELS: Record<Role, string> = {
  SUPERVISOR: "Supervisor",
  PSICO: "Psicólogo",
  ADMIN: "Administrativo",
};

export function roleLabel(role: Role | undefined | null): string {
  return role ? ROLE_LABELS[role] ?? role : "";
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
