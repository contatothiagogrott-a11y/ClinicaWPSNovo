import { api } from "./api";

/**
 * Ativação das notificações push no navegador.
 *
 * LIMITAÇÃO IMPORTANTE — iPhone:
 * o iOS só entrega Web Push a partir da versão 16.4 E somente quando o app
 * foi instalado na tela de início (Compartilhar → "Adicionar à Tela de
 * Início"). Aberto pelo Safari como site comum, não funciona — e o navegador
 * nem oferece a permissão. Por isso detectamos e explicamos, em vez de deixar
 * o botão falhar em silêncio.
 */

export type EstadoPush =
  | "nao_suportado"
  | "precisa_instalar_ios"
  | "nao_configurado"
  | "bloqueado"
  | "desativado"
  | "ativado";

function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** No iOS, push só funciona com o app instalado na tela de início. */
function estaInstaladoNaTelaInicial(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export async function verificarEstado(): Promise<EstadoPush> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return ehIOS() && !estaInstaladoNaTelaInicial() ? "precisa_instalar_ios" : "nao_suportado";
  }
  if (ehIOS() && !estaInstaladoNaTelaInicial()) return "precisa_instalar_ios";

  const { enabled } = await api.get<{ publicKey: string | null; enabled: boolean }>(
    "/api/push/public-key"
  );
  if (!enabled) return "nao_configurado";

  if (Notification.permission === "denied") return "bloqueado";

  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  return inscricao ? "ativado" : "desativado";
}

function base64ParaUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const saida = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) saida[i] = raw.charCodeAt(i);
  return saida;
}

export async function ativarNotificacoes(): Promise<EstadoPush> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desativado";

  const { publicKey } = await api.get<{ publicKey: string | null }>("/api/push/public-key");
  if (!publicKey) return "nao_configurado";

  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.subscribe({
    userVisibleOnly: true, // exigido pelos navegadores: nada de push silencioso
    applicationServerKey: base64ParaUint8Array(publicKey),
  });

  const bruto = inscricao.toJSON() as any;
  await api.post("/api/push/subscribe", {
    endpoint: bruto.endpoint,
    keys: bruto.keys,
  });
  return "ativado";
}

export async function desativarNotificacoes(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  if (inscricao) {
    await api.post("/api/push/unsubscribe", { endpoint: inscricao.endpoint }).catch(() => {});
    await inscricao.unsubscribe();
  }
  return "desativado";
}

export async function enviarTeste(): Promise<number> {
  const { enviados } = await api.post<{ enviados: number }>("/api/push/test");
  return enviados;
}
