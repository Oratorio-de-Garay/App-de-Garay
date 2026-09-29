import express from "express";
import { requireSession } from "./auth.js";
import { llamarRpc, responderError, responderRpc } from "./rpc.js";
import { mailNuevaSolicitud, urlDeLaApp } from "./mail.js";

// ========================================================
// REGISTRO: quien inició sesión pero todavía no tiene acceso
//
// Sólo exige una sesión válida (no estar en public.usuarios): es justamente la
// pantalla para pedir el acceso. Todo se hace sobre el email de la sesión, así
// que nadie puede crear ni cancelar solicitudes a nombre de otro. Las reglas
// están en supabase/migrations/20260928000000_solicitudes.sql.
// ========================================================

const router = express.Router();

router.use(requireSession);

// Estado de la pantalla de registro: última solicitud y espacios elegibles.
router.get("/", async (req, res) => {
  try {
    const estado = await llamarRpc("registro_estado", { p_email: req.auth.email });
    res.json({ email: req.auth.email, nombre_sugerido: req.auth.nombreSugerido, ...estado });
  } catch (error) {
    responderError(res, "Registro estado", error);
  }
});

// Crea la solicitud y avisa a los aprobadores (superadmins + admins del espacio).
router.post("/solicitudes", async (req, res) => {
  try {
    const { solicitud, notificar } = await llamarRpc("registro_crear_solicitud", {
      p_email: req.auth.email,
      p_nombre: String(req.body?.nombre || ""),
      p_organizacion_id: req.body?.organizacion_id || null,
      p_nombre_espacio: req.body?.nombre_espacio ?? null,
    });
    // El motivo de un envío fallido no se le muestra al solicitante: queda en el log.
    const { notificados } = await mailNuevaSolicitud(solicitud, notificar, urlDeLaApp(req));
    res.status(201).json({ ...solicitud, notificados });
  } catch (error) {
    responderError(res, "Registro crear solicitud", error);
  }
});

router.post("/solicitudes/:id/cancelar", (req, res) =>
  responderRpc(res, "Registro cancelar solicitud", "registro_cancelar_solicitud", {
    p_email: req.auth.email,
    p_id: req.params.id,
  })
);

export default router;
