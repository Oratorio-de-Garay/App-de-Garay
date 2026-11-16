import crypto from "node:crypto";
import { suscripcionPushSchema, suscripcionQuitarSchema } from "@garay/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { env, PUSH_HABILITADO } from "../../env";
import { ErrorHttp, pedidoInvalido } from "../../lib/errores";
import { type Dispositivo, endpointPermitido, enviarPush } from "../../lib/push";
import { rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import { requiereUsuario } from "../../middleware/auth";
import type { AppEnv } from "../../tipos";

// ========================================================
// /api/push: cada usuario registra y quita sus propios dispositivos (el email
// sale siempre de la sesión, nunca del body), y el despachador de las
// notificaciones programadas.
// ========================================================

const pushHabilitado: MiddlewareHandler = async (_c, next) => {
  if (!PUSH_HABILITADO) throw new ErrorHttp(503, "Las notificaciones push no están configuradas");
  await next();
};

/** Comparación en tiempo constante (se hashea para que ambos midan lo mismo). */
export function secretoValido(recibido: string, esperado: string): boolean {
  const hash = (valor: string) => crypto.createHash("sha256").update(valor).digest();
  return crypto.timingSafeEqual(hash(recibido), hash(esperado));
}

interface NotificacionVencida {
  notificacion: { id: string; titulo: string; texto: string };
  dispositivos: Dispositivo[];
}

export const pushRoutes = new Hono<AppEnv>()
  // Lo llama pg_cron (vía pg_net) cuando hay notificaciones programadas
  // vencidas. No hay un usuario detrás: se autentica con el secreto compartido
  // y no confía en nada del body.
  // Toma hasta 20 vencidas (for update skip locked: dos despachos simultáneos
  // no envían dos veces), envía y cierra cada una. Si quedan más, el cron vuelve
  // a llamar al minuto siguiente. Una que falle al cerrarse queda 'enviando' y
  // la base la devuelve a la cola a los 10 minutos.
  .post("/despachar", pushHabilitado, async (c) => {
    if (!env.CRON_SECRET) {
      throw new ErrorHttp(503, "El despacho de notificaciones programadas no está configurado");
    }
    const autorizacion = c.req.header("authorization") ?? "";
    if (!autorizacion.startsWith("Bearer ") || !secretoValido(autorizacion.slice(7), env.CRON_SECRET)) {
      throw new ErrorHttp(401, "No autorizado");
    }

    const vencidas = await rpc<NotificacionVencida[]>("push_tomar_vencidas", { p_limite: 20 });
    await Promise.allSettled(
      vencidas.map(async ({ notificacion, dispositivos }) => {
        try {
          const { exitosos, invalidos } = await enviarPush(dispositivos, notificacion);
          await rpc("push_cerrar_programada", {
            p_id: notificacion.id,
            p_exitosos: exitosos,
            p_invalidos: invalidos,
          });
        } catch (error) {
          console.error("Push despachar: falló la notificación", notificacion.id, (error as Error).message);
        }
      }),
    );
    return c.json({ procesadas: vencidas.length });
  })

  // Registra (o actualiza) el dispositivo de quien llama. Body: la
  // PushSubscription del navegador ({ endpoint, keys: { p256dh, auth } }).
  .post(
    "/suscripciones",
    requiereUsuario(),
    pushHabilitado,
    validar("json", suscripcionPushSchema),
    async (c) => {
      const { endpoint, keys } = c.req.valid("json");
      if (!endpointPermitido(endpoint)) throw pedidoInvalido("Suscripción inválida");

      const resultado = await rpc<Record<string, unknown>>("push_registrar_dispositivo", {
        p_email: c.var.usuario.email,
        p_endpoint: endpoint,
        p_p256dh: keys?.p256dh ?? "",
        p_auth: keys?.auth ?? "",
        p_user_agent: c.req.header("user-agent") ?? null,
      });
      return c.json(resultado, 201);
    },
  )

  // Quita el dispositivo de quien llama. Body: { endpoint }.
  .delete(
    "/suscripciones",
    requiereUsuario(),
    pushHabilitado,
    validar("json", suscripcionQuitarSchema),
    async (c) =>
      c.json(
        await rpc<Record<string, unknown>>("push_quitar_dispositivo", {
          p_email: c.var.usuario.email,
          p_endpoint: c.req.valid("json").endpoint,
        }),
      ),
  );
