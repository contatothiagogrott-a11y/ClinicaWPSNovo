import webpush from "web-push";
import { prisma } from "./prisma.js";

/**
 * NOTIFICAÇÕES PUSH
 * =================
 *
 * SIGILO — a decisão mais importante deste arquivo
 * ------------------------------------------------
 * O conteúdo do Web Push trafega criptografado de ponta a ponta (VAPID +
 * aes128gcm): o servidor de push do Google ou da Apple entrega o pacote sem
 * conseguir abri-lo. Isso protege o dado em trânsito.
 *
 * O que NÃO fica protegido é o texto exibido: ele aparece na TELA DE BLOQUEIO
 * do aparelho, visível a qualquer pessoa que olhe o celular de relance — na
 * fila do café, numa reunião, em cima da mesa.
 *
 * Por isso a notificação NUNCA identifica o paciente. Ela diz que existe um
 * atendimento e a que horas; quem é a pessoa, o profissional consulta dentro
 * do aplicativo, com sessão autenticada.
 *
 * Fundamento: sigilo profissional (Art. 9º do Código de Ética Profissional do
 * Psicólogo) e princípio da necessidade da LGPD (Art. 6º, III). Revelar que
 * fulano é paciente de psicologia é, por si só, expor dado de saúde.
 *
 * Se algum dia o setor decidir o contrário, a mudança é consciente e única:
 * a constante abaixo. Não espalhe nome de paciente pelas mensagens.
 */
const INCLUIR_NOME_DO_PACIENTE = false;

let configured = false;

/** Configura o VAPID sob demanda; devolve false se as chaves não existirem. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:psicologia@alesc.sc.gov.br";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface NotificationPayload {
  title: string;
  body: string;
  /** Rota aberta ao tocar na notificação. */
  url?: string;
  /** Agrupa notificações do mesmo assunto, evitando empilhar repetidas. */
  tag?: string;
}

/**
 * Envia para todos os dispositivos de um usuário.
 *
 * Inscrições mortas (aparelho formatado, permissão revogada, app desinstalado)
 * respondem 404 ou 410 e são REMOVIDAS na hora. Sem essa limpeza, a tabela
 * acumularia lixo e cada disparo ficaria mais lento com o tempo.
 */
export async function sendToUser(userId: string, payload: NotificationPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let enviados = 0;

  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        enviados++;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Inscrição definitivamente morta.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          // Falha temporária (rede, servidor de push fora do ar).
          // Depois de 5 seguidas, considera-se perdida.
          const next = (sub.failureCount ?? 0) + 1;
          if (next >= 5) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            await prisma.pushSubscription
              .update({ where: { id: sub.id }, data: { failureCount: next } })
              .catch(() => {});
          }
        }
      }
    })
  );

  return enviados;
}

// ---------------------------------------------------------------------------
// Mensagens do sistema — todas sem identificar paciente
// ---------------------------------------------------------------------------

export function lembreteDeAtendimento(hora: string, sala?: string, nomePaciente?: string): NotificationPayload {
  const detalhe = sala ? ` · Sala ${sala}` : "";
  return {
    title: "Atendimento em breve",
    body: INCLUIR_NOME_DO_PACIENTE && nomePaciente
      ? `${nomePaciente} às ${hora}${detalhe}`
      : `Você tem um atendimento às ${hora}${detalhe}`,
    url: "/agenda",
    tag: `lembrete-${hora}`,
  };
}

export function resumoDoDia(quantidade: number, primeiroHorario?: string): NotificationPayload {
  return {
    title: "Sua agenda de hoje",
    body:
      quantidade === 0
        ? "Nenhum atendimento marcado para hoje."
        : `${quantidade} atendimento(s) hoje${primeiroHorario ? `, o primeiro às ${primeiroHorario}` : ""}.`,
    url: "/agenda",
    tag: "resumo-do-dia",
  };
}

export function pacienteAtribuido(): NotificationPayload {
  return {
    title: "Novo paciente sob sua responsabilidade",
    body: "Um caso foi atribuído a você. Abra o aplicativo para ver os detalhes.",
    url: "/active",
    tag: "atribuicao",
  };
}

export function cadastrosParaRevisar(quantidade: number): NotificationPayload {
  return {
    title: "Cadastros aguardando revisão",
    body: `${quantidade} cadastro(s) importado(s) precisam de conferência.`,
    url: "/waitlist?revisar=1",
    tag: "revisao-importacao",
  };
}
