/**
 * Registro do Service Worker (PWA) e aviso de nova versão.
 *
 * O SW só é registrado em produção (HTTPS). Em desenvolvimento ele atrapalha
 * o hot reload do Vite e não traz benefício algum.
 *
 * Ver public/sw.js: por decisão de segurança, nenhuma resposta de /api/*
 * é cacheada — o app é instalável, não "offline com prontuário".
 */

let onUpdateAvailable: (() => void) | null = null;
let waitingWorker: ServiceWorker | null = null;

/** A tela chama isto para saber quando existe versão nova esperando. */
export function setUpdateHandler(handler: () => void) {
  onUpdateAvailable = handler;
  if (waitingWorker) handler();
}

/**
 * Ativa a versão nova e recarrega.
 *
 * Sem isto, o navegador só troca de versão quando TODAS as abas do app são
 * fechadas — que é exatamente o motivo de um F5 comum não resolver: ele
 * recarrega a página, mas o Service Worker antigo continua no comando.
 */
export function applyUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage("ATIVAR_AGORA");
  waitingWorker = null;
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Já existe uma versão nova parada esperando (aba aberta desde antes
        // do deploy).
        if (registration.waiting) {
          waitingWorker = registration.waiting;
          onUpdateAvailable?.();
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorker = installing;
              onUpdateAvailable?.();
            }
          });
        });

        // Procura versão nova ao voltar para a aba e a cada 15 minutos.
        const checkForUpdate = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", checkForUpdate);
        window.setInterval(checkForUpdate, 15 * 60 * 1000);
      })
      .catch((err) => {
        console.warn("Falha ao registrar o Service Worker:", err);
      });

    // Quando o SW novo assume, recarrega uma única vez.
    let recarregou = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recarregou) return;
      recarregou = true;
      window.location.reload();
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
