import { solicitudCrearSchema } from "@garay/shared";
import { Hono } from "hono";
import { mailNuevaSolicitud, type Solicitud, urlDeLaApp } from "../../lib/mail";
import { rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import type { AppEnv } from "../../tipos";

// ========================================================
// REGISTRO: quien inició sesión pero todavía no tiene acceso
//
// Sólo exige una sesión válida (requiereSesion, al montar el router): es
// justamente la pantalla para pedir el acceso. Todo se hace sobre el email de
// la sesión, así que nadie puede crear ni cancelar solicitudes a nombre de
// otro. Las reglas están en supabase/migrations/20260928000000_solicitudes.sql.
// ========================================================

export const registroRoutes = new Hono<AppEnv>()
  // Estado de la pantalla de registro: última solicitud y espacios elegibles.
  .get("/", async (c) => {
    const { email, nombreSugerido } = c.var.sesion;
    const estado = await rpc<Record<string, unknown>>("registro_estado", { p_email: email });
    return c.json({ email, nombre_sugerido: nombreSugerido, ...estado });
  })

  // Crea la solicitud y avisa a los aprobadores (superadmins + admins del espacio).
  .post("/solicitudes", validar("json", solicitudCrearSchema), async (c) => {
    const pedido = c.req.valid("json");
    const { solicitud, notificar } = await rpc<{ solicitud: Solicitud; notificar: string[] }>(
      "registro_crear_solicitud",
      {
        p_email: c.var.sesion.email,
        p_nombre: pedido.nombre,
        p_organizacion_id: pedido.organizacion_id || null,
        p_nombre_espacio: pedido.nombre_espacio ?? null,
      },
    );
    // El motivo de un envío fallido no se le muestra al solicitante: queda en el log.
    const { notificados } = await mailNuevaSolicitud(solicitud, notificar, urlDeLaApp(c));
    return c.json({ ...solicitud, notificados }, 201);
  })

  .post("/solicitudes/:id/cancelar", async (c) =>
    c.json(
      await rpc<Record<string, unknown>>("registro_cancelar_solicitud", {
        p_email: c.var.sesion.email,
        p_id: c.req.param("id"),
      }),
    ),
  );
