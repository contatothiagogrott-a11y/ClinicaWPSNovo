import type { Request, Response, NextFunction } from "express";

/**
 * Cabeçalhos de segurança aplicados a TODA resposta da API.
 *
 * LGPD Art. 46 (medidas técnicas de proteção) e boas práticas OWASP.
 * Os cabeçalhos do front-end (HTML/JS) são definidos em vercel.json, porque
 * aqueles arquivos são servidos pela CDN e não passam por este Express.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Nenhuma resposta da API pode ser cacheada por proxy/CDN/navegador:
  // todas carregam dado pessoal sensível de paciente.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY"); // impede clickjacking / embed em iframe
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // Sinaliza a proxies e ferramentas que a resposta não deve ser indexada.
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  next();
}

/** Extrai o IP do cliente respeitando o proxy da Vercel. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0];
  return req.socket?.remoteAddress ?? undefined;
}
