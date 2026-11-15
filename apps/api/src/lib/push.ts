import { sendNotification, setVapidDetails } from "web-push";
import { env, PUSH_HABILITADO } from "../env";

// ========================================================
// PUSH: Web Push (VAPID)
//
// Si faltan las claves VAPID el server arranca igual, pero el push queda
// deshabilitado (503): no se rompe un deploy que todavía no las tiene.
// Las reglas de quién puede enviar a quién viven en SQL
// (supabase/migrations/20261106000000_notificaciones_push.sql).
// ========================================================

if (PUSH_HABILITADO) {
  setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
} else {
  console.warn("Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
}

// El server hace un POST a la URL (endpoint) que le manda el navegador. Para
// que un usuario no pueda usar eso contra servicios internos o de terceros
// (SSRF), sólo se aceptan los servicios push de los navegadores.
const HOSTS_PUSH = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Brave
  "push.services.mozilla.com", // Firefox (y subdominios)
  "push.apple.com", // Safari / iOS (web.push.apple.com y subdominios)
  "notify.windows.com", // Edge legado / WNS (subdominios)
];

export function endpointPermitido(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return HOSTS_PUSH.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

export interface Dispositivo {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Envía el aviso a cada dispositivo y espera a todos (la función serverless se
 * congela al responder). Devuelve los ids de los que salieron y los de los que
 * el servicio push dio por vencidos (404/410), que hay que borrar.
 */
export async function enviarPush(
  dispositivos: readonly Dispositivo[],
  aviso: { titulo: string; texto: string },
): Promise<{ exitosos: string[]; invalidos: string[] }> {
  const exitosos: string[] = [];
  const invalidos: string[] = [];
  const payload = JSON.stringify({ title: aviso.titulo, body: aviso.texto, url: "/" });

  await Promise.allSettled(
    dispositivos.map(async (d) => {
      if (!endpointPermitido(d.endpoint)) {
        console.error("Push: endpoint no permitido, dispositivo", d.id);
        return;
      }
      try {
        await sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
          timeout: 8000,
        });
        exitosos.push(d.id);
      } catch (error) {
        const { statusCode, code, message } = error as {
          statusCode?: number;
          code?: string;
          message?: string;
        };
        if (statusCode === 404 || statusCode === 410) {
          invalidos.push(d.id);
        } else {
          // Sin endpoint ni claves en el log: sólo el dispositivo y el status.
          console.error("Push: falló el envío al dispositivo", d.id, statusCode || code || message);
        }
      }
    }),
  );
  return { exitosos, invalidos };
}
