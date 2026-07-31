/**
 * Limitação de tentativas de login (anti força-bruta).
 *
 * Implementação em memória do processo. Em serverless a memória não é
 * compartilhada entre instâncias, então isto NÃO é uma barreira absoluta —
 * é uma primeira camada que já elimina o ataque trivial de um único cliente
 * disparando milhares de tentativas contra a mesma instância quente.
 *
 * Se no futuro o volume justificar, o mesmo contrato pode ser reimplementado
 * sobre uma tabela no Neon ou um Redis, sem mudar as chamadas em app.ts.
 *
 * LGPD Art. 46: obrigação de adotar medidas de segurança aptas a proteger os
 * dados de acessos não autorizados.
 */

interface Bucket {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 8; // tentativas falhas na janela
const BLOCK_MS = 15 * 60 * 1000; // bloqueio após estourar

function cleanup(now: number) {
  if (buckets.size < 500) return;
  for (const [key, b] of buckets) {
    if (now - b.firstAttempt > WINDOW_MS && now > b.blockedUntil) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Consulta (sem consumir) se a chave pode tentar novamente. */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 };
  if (now < bucket.blockedUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Registra uma tentativa que FALHOU. */
export function registerFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.firstAttempt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAttempt: now, blockedUntil: 0 });
    return;
  }
  bucket.count += 1;
  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    bucket.count = 0;
    bucket.firstAttempt = now;
  }
}

/** Zera o contador após um login bem-sucedido. */
export function registerSuccess(key: string): void {
  buckets.delete(key);
}

/** Chave do balde: IP + e-mail, para não punir uma instituição inteira atrás de um NAT. */
export function rateLimitKey(ip: string | undefined, email: string | undefined): string {
  return `${ip ?? "sem-ip"}::${(email ?? "").toLowerCase().trim()}`;
}
