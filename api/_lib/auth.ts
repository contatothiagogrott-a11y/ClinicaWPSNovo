import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

const COOKIE_NAME = "clinica_session";

/**
 * SESSÃO
 * ------
 * Antes: um único token de 12 horas. Quem esquecesse a tela aberta na
 * recepção deixava um prontuário acessível a tarde inteira.
 *
 * Agora: janela de INATIVIDADE de 30 minutos, renovada a cada requisição
 * autenticada (sessão deslizante), com um teto ABSOLUTO de 12 horas por
 * login. Depois do teto, é preciso autenticar de novo mesmo com uso contínuo.
 *
 * LGPD Art. 46 e sigilo profissional (Art. 9º do Código de Ética Profissional
 * do Psicólogo): o acesso ao prontuário deve ser restrito ao profissional, e
 * uma sessão que não expira transfere esse acesso a qualquer um que passe
 * pelo computador.
 */
const IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 minutos sem uso
const ABSOLUTE_TIMEOUT_SECONDS = 12 * 60 * 60; // 12 horas por login

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET não configurado (ou muito curto). Defina uma string aleatória longa na Vercel."
    );
  }
  return secret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AppRole = "SUPERVISOR" | "ADMIN" | "PSICO";

export interface SessionPayload {
  userId: string;
  role: AppRole;
  name: string;
  /** Epoch (segundos) do login original — base do teto absoluto de sessão. */
  loginAt: number;
}

export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: IDLE_TIMEOUT_SECONDS });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  });
  return out;
}

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    // Strict: o cookie não acompanha navegação vinda de outro site, o que
    // elimina a superfície de CSRF nesta aplicação (não há fluxo de terceiros).
    "SameSite=Strict",
    `Max-Age=${IDLE_TIMEOUT_SECONDS}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

export function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`
  );
}

export function getSession(req: Request): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as SessionPayload;
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Teto absoluto: nem o uso contínuo estende a sessão para sempre.
    if (!payload.loginAt || nowSeconds - payload.loginAt > ABSOLUTE_TIMEOUT_SECONDS) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Renova a janela de inatividade preservando o instante do login original. */
export function refreshSessionCookie(res: Response, session: SessionPayload) {
  setSessionCookie(res, createSessionToken(session));
}

/**
 * Exige sessão válida. Opcionalmente restringe a papéis.
 * Como efeito colateral desejado, renova a janela de inatividade.
 */
export function requireSession(
  req: Request,
  res: Response,
  allowedRoles?: AppRole[]
): SessionPayload | null {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Sessão expirada por inatividade. Faça login novamente." });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    res.status(403).json({ error: "Sem permissão para esta ação." });
    return null;
  }
  refreshSessionCookie(res, session);
  return session;
}

export const SESSION_LIMITS = {
  idleSeconds: IDLE_TIMEOUT_SECONDS,
  absoluteSeconds: ABSOLUTE_TIMEOUT_SECONDS,
};
