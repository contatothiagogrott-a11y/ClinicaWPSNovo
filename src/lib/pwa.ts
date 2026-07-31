/**
 * Registro do Service Worker (PWA).
 *
 * O SW só é registrado em produção (HTTPS). Em desenvolvimento ele atrapalha
 * o hot reload do Vite e não traz benefício algum.
 *
 * Ver public/sw.js: por decisão de segurança, nenhuma resposta de /api/*
 * é cacheada — o app é instalável, não "offline com prontuário".
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Falha ao registrar o Service Worker:", err);
    });
  });
}

/**
 * Limpa o cache do app no logout. Não há dado de paciente no cache (ver
 * public/sw.js), mas zerar o "casco" evita que a próxima pessoa a usar o
 * dispositivo receba uma versão presa à sessão anterior.
 */
export function clearAppCache() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage("LIMPAR_CACHE");
  }
}
