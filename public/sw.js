/* eslint-disable no-restricted-globals */

/**
 * Service Worker do "Setor de Psicologia ALESC - PWA".
 *
 * DECISÃO DE SEGURANÇA — LEIA ANTES DE ALTERAR
 * ============================================
 * Este Service Worker NÃO faz cache de dados de paciente. Nunca.
 *
 * O padrão comum em PWAs é cachear respostas de API para funcionar offline.
 * Aqui isso seria uma falha grave: as respostas de /api/* trazem nome,
 * telefone, prontuário e evolução clínica DECRIPTADOS. Guardá-los no
 * Cache Storage significa deixar dado sensível em claro no disco do
 * dispositivo, legível por qualquer pessoa com acesso ao aparelho e
 * sobrevivente ao logout — exatamente o oposto do que a LGPD (Art. 46) e o
 * sigilo profissional (Art. 9º do Código de Ética Profissional do Psicólogo)
 * exigem.
 *
 * Portanto:
 *   - /api/*            -> SEMPRE rede, nunca cache.
 *   - assets estáticos  -> cache (JS/CSS/ícones com hash no nome).
 *   - navegação         -> rede primeiro, com o "casco" do app como reserva.
 *
 * O ganho do PWA aqui é instalação na tela inicial, abertura rápida e
 * resiliência a oscilação de rede — não operação offline com prontuário.
 */

const CACHE_VERSION = "alesc-psi-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  // NÃO chamamos skipWaiting aqui de propósito. Trocar a versão embaixo de
  // alguém que está escrevendo um prontuário causaria recarga no meio da
  // digitação. A versão nova fica esperando e o app avisa: quem decide a
  // hora de atualizar é o usuário (ver src/lib/pwa.ts).
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/**
 * Permite que a aplicação limpe todo o cache no logout, garantindo que nada
 * do "casco" fique associado à sessão anterior.
 */
self.addEventListener("message", (event) => {
  // A tela pediu para ativar a versão nova agora.
  if (event.data === "ATIVAR_AGORA") {
    self.skipWaiting();
    return;
  }
  if (event.data === "LIMPAR_CACHE") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Só interceptamos o que é da própria origem.
  if (url.origin !== self.location.origin) return;

  // ------------------------------------------------------------------
  // REGRA DE OURO: nada de /api/* toca o cache.
  // ------------------------------------------------------------------
  if (url.pathname.startsWith("/api/")) {
    return; // deixa passar direto para a rede, sem interceptação
  }

  if (request.method !== "GET") return;

  // Navegação (abrir uma rota do app): rede primeiro.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Assets estáticos: cache primeiro, atualizando em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
