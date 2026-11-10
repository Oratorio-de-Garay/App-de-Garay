import express from "express";
import { setVapidDetails, sendNotification } from "web-push";
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "./entorno.js";
import { llamarRpc, responderError } from "./rpc.js";

// ========================================================
// PUSH: Web Push (VAPID)
//
// - Router /api/push: cada usuario registra y quita sus propios dispositivos.
//   El email sale siempre de la sesión (req.user), nunca del body.
// - enviarPush(): lo usa el panel de administración (admin.js) para mandar la
//   notificación. Las reglas de quién puede enviar a quién viven en
//   supabase/migrations/20261106000000_notificaciones_push.sql.
//
// Si faltan las claves VAPID el server arranca igual, pero el push queda
// deshabilitado (503): no se rompe un deploy que todavía no las tiene.
// ========================================================

export const PUSH_HABILITADO = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (PUSH_HABILITADO) {
  setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
}

// El server hace un POST a la URL (endpoint) que le manda el navegador. Para que
// un usuario no pueda usar eso contra servicios internos o de terceros (SSRF),
// sólo se aceptan los servicios push de los navegadores.
const HOSTS_PUSH = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Brave
  "push.services.mozilla.com", // Firefox (y subdominios: updates., etc.)
  "push.apple.com", // Safari / iOS (web.push.apple.com y subdominios)
  "notify.windows.com", // Edge legado / WNS (subdominios)
];

export function endpointPermitido(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return HOSTS_PUSH.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/**
 * Envía el payload a cada dispositivo ({id, endpoint, p256dh, auth}) y espera a
 * todos (la función serverless se congela al responder).
 * Devuelve { exitosos, invalidos } con ids de dispositivos; invalidos son los
 * que el servicio push dio por vencidos (404/410) y hay que borrar.
 */
export async function enviarPush(dispositivos, { titulo, texto }) {
  const exitosos = [];
  const invalidos = [];
  const payload = JSON.stringify({ title: titulo, body: texto });

  await Promise.allSettled(
    dispositivos.map(async (d) => {
      if (!endpointPermitido(d.endpoint)) {
        console.error("Push: endpoint no permitido, dispositivo", d.id);
        return;
      }
      try {
        await sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "high", timeout: 8000 }
        );
        exitosos.push(d.id);
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          invalidos.push(d.id);
        } else {
          // Sin endpoint ni claves en el log: sólo el dispositivo y el status.
          console.error("Push: falló el envío al dispositivo", d.id, error.statusCode || error.code || error.message);
        }
      }
    })
  );
  return { exitosos, invalidos };
}

const router = express.Router();

router.use((req, res, next) => {
  if (!PUSH_HABILITADO) return res.status(503).json({ error: "Las notificaciones push no están configuradas" });
  next();
});

// Registra (o actualiza) el dispositivo de quien llama. Body: la PushSubscription
// del navegador ({ endpoint, keys: { p256dh, auth } }).
router.post("/suscripciones", async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    if (!endpointPermitido(endpoint)) {
      return res.status(400).json({ error: "Suscripción inválida" });
    }
    const resultado = await llamarRpc("push_registrar_dispositivo", {
      p_email: req.user.email,
      p_endpoint: endpoint,
      p_p256dh: String(req.body?.keys?.p256dh || ""),
      p_auth: String(req.body?.keys?.auth || ""),
      p_user_agent: req.get("user-agent") || null,
    });
    res.status(201).json(resultado);
  } catch (error) {
    responderError(res, "Push registrar dispositivo", error);
  }
});

// Quita el dispositivo de quien llama. Body: { endpoint }.
router.delete("/suscripciones", async (req, res) => {
  try {
    res.json(await llamarRpc("push_quitar_dispositivo", {
      p_email: req.user.email,
      p_endpoint: String(req.body?.endpoint || ""),
    }));
  } catch (error) {
    responderError(res, "Push quitar dispositivo", error);
  }
});

export default router;
