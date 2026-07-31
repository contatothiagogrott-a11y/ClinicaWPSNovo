import { useEffect, useRef } from "react";

/**
 * Encerra a sessão na interface após um período de inatividade.
 *
 * O servidor já expira a sessão em 30 minutos sem uso (api/_lib/auth.ts).
 * Este hook cuida do outro lado do problema: a tela que ficou aberta com o
 * prontuário à mostra. Sem ele, o dado continuaria visível na sala mesmo com
 * a sessão morta no servidor.
 *
 * Sigilo profissional (Art. 9º do Código de Ética Profissional do Psicólogo):
 * o acesso é do profissional, não do computador em que ele trabalha.
 */
const IDLE_MINUTES = 25; // um pouco antes do servidor, para avisar em vez de dar erro
const WARNING_SECONDS = 60;

export function useIdleLogout(
  enabled: boolean,
  onLogout: () => void,
  onWarning?: (secondsLeft: number) => void
) {
  const timerRef = useRef<number | null>(null);
  const warningRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (warningRef.current) window.clearTimeout(warningRef.current);
    };

    const schedule = () => {
      clearTimers();
      const idleMs = IDLE_MINUTES * 60 * 1000;
      warningRef.current = window.setTimeout(() => {
        onWarning?.(WARNING_SECONDS);
      }, idleMs - WARNING_SECONDS * 1000);
      timerRef.current = window.setTimeout(onLogout, idleMs);
    };

    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    const handleActivity = () => {
      if (document.visibilityState === "hidden") return;
      schedule();
    };

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    schedule();

    return () => {
      clearTimers();
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [enabled, onLogout, onWarning]);
}
