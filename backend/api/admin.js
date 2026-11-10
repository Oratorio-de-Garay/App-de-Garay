import express from "express";
import { supabaseAdmin, requireAdmin, requireSuperadmin } from "./auth.js";
import { llamarRpc, responderError, responderRpc } from "./rpc.js";
import { mailSolicitudResuelta, urlDeLaApp } from "./mail.js";
import { enviarPush, PUSH_HABILITADO } from "./push.js";

// ========================================================
// ADMINISTRACIÓN: usuarios, roles, organizaciones y solicitudes
//
// Este router sólo decide quién entra a cada endpoint (admin o superadmin).
// Las reglas finas —scope de organizaciones, a quién puede modificar cada
// uno, auditoría— viven en las funciones SQL de
// supabase/migrations/20260926000000_roles_y_admin.sql y
// 20260928000000_solicitudes.sql, que reciben al actor (req.user.email) y
// rechazan cualquier cosa fuera de su alcance.
// ========================================================

const router = express.Router();

router.use(requireAdmin);

const ESTADOS_SOLICITUD = ["pendiente", "aceptada", "rechazada", "cancelada"];

function listaDeIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id) : [];
}

// ─────────────────────────────────────────────────────────
// Lecturas (admin y superadmin, filtradas por scope)
// ─────────────────────────────────────────────────────────

router.get("/organizaciones", (req, res) =>
  responderRpc(res, "Admin organizaciones", "admin_listar_organizaciones", {
    p_actor: req.user.email,
  })
);

router.get("/usuarios", (req, res) =>
  responderRpc(res, "Admin usuarios", "admin_listar_usuarios", {
    p_actor: req.user.email,
  })
);

router.get("/auditoria", (req, res) =>
  responderRpc(res, "Admin auditoría", "admin_listar_auditoria", {
    p_actor: req.user.email,
    p_limite: Number(req.query.limit) || 100,
  })
);

// ─────────────────────────────────────────────────────────
// Usuarios (admin y superadmin)
// ─────────────────────────────────────────────────────────

router.post("/usuarios", (req, res) =>
  responderRpc(res, "Admin alta usuario", "admin_alta_usuario", {
    p_actor: req.user.email,
    p_email: String(req.body?.email || ""),
    p_nombre: req.body?.nombre ?? null,
    p_organizaciones: listaDeIds(req.body?.organizaciones),
  }, 201)
);

router.patch("/usuarios/:id", (req, res) =>
  responderRpc(res, "Admin editar usuario", "admin_editar_usuario", {
    p_actor: req.user.email,
    p_id: req.params.id,
    // undefined → null: "no cambiar el nombre".
    p_nombre: req.body?.nombre ?? null,
    p_organizaciones: listaDeIds(req.body?.organizaciones),
  })
);

router.delete("/usuarios/:id", (req, res) =>
  responderRpc(res, "Admin quitar acceso", "admin_quitar_acceso", {
    p_actor: req.user.email,
    p_id: req.params.id,
  })
);

// ─────────────────────────────────────────────────────────
// Roles y organizaciones (sólo superadmin)
// ─────────────────────────────────────────────────────────

// Catálogo de roles: lo lee cualquier admin (para mostrar nombres), pero sólo
// el superadmin puede asignarlos.
router.get("/roles", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("roles")
      .select("codigo, nombre, descripcion, alcance, asignable_desde_panel")
      .order("nombre");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Admin roles error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Asigna un rol por email: sirve tanto para usuarios existentes como para
// habilitar a alguien nuevo directamente como admin.
router.post("/roles/asignaciones", requireSuperadmin, (req, res) =>
  responderRpc(res, "Admin asignar rol", "superadmin_asignar_rol", {
    p_actor: req.user.email,
    p_email: String(req.body?.email || ""),
    p_nombre: req.body?.nombre ?? null,
    p_rol: String(req.body?.rol || ""),
    p_organizaciones: listaDeIds(req.body?.organizaciones),
  })
);

router.delete("/usuarios/:id/roles/:rol", requireSuperadmin, (req, res) =>
  responderRpc(res, "Admin quitar rol", "superadmin_quitar_rol", {
    p_actor: req.user.email,
    p_id: req.params.id,
    p_rol: req.params.rol,
  })
);

router.post("/organizaciones", requireSuperadmin, (req, res) =>
  responderRpc(res, "Admin crear organización", "superadmin_guardar_organizacion", {
    p_actor: req.user.email,
    p_id: null,
    p_nombre: String(req.body?.nombre || ""),
  }, 201)
);

router.patch("/organizaciones/:id", requireSuperadmin, (req, res) =>
  responderRpc(res, "Admin renombrar organización", "superadmin_guardar_organizacion", {
    p_actor: req.user.email,
    p_id: req.params.id,
    p_nombre: String(req.body?.nombre || ""),
  })
);

// ─────────────────────────────────────────────────────────
// Solicitudes (admin y superadmin, filtradas por scope)
// ─────────────────────────────────────────────────────────

router.get("/solicitudes", (req, res) =>
  responderRpc(res, "Admin solicitudes", "admin_listar_solicitudes", {
    p_actor: req.user.email,
    p_estado: ESTADOS_SOLICITUD.includes(req.query.estado) ? req.query.estado : null,
  })
);

router.post("/solicitudes/:id/tomar", (req, res) =>
  responderRpc(res, "Admin tomar solicitud", "admin_tomar_solicitud", {
    p_actor: req.user.email,
    p_id: req.params.id,
  })
);

// Acepta o rechaza, y le avisa por mail al solicitante.
router.post("/solicitudes/:id/resolver", async (req, res) => {
  try {
    const solicitud = await llamarRpc("admin_resolver_solicitud", {
      p_actor: req.user.email,
      p_id: req.params.id,
      p_decision: String(req.body?.decision || ""),
      p_comentario: req.body?.comentario ?? null,
      p_organizacion_id: req.body?.organizacion_id || null,
      p_nombre_espacio: req.body?.nombre_espacio ?? null,
    });
    // aviso_error: por qué no salió el mail, para que el admin lo vea en el toast.
    const { notificados, motivo } = await mailSolicitudResuelta(solicitud, urlDeLaApp(req));
    res.json({ ...solicitud, notificados, aviso_error: motivo || null });
  } catch (error) {
    responderError(res, "Admin resolver solicitud", error);
  }
});

// ─────────────────────────────────────────────────────────
// Notificaciones push (admin y superadmin, dentro de su scope)
// ─────────────────────────────────────────────────────────

router.get("/notificaciones", (req, res) =>
  responderRpc(res, "Admin notificaciones", "admin_listar_notificaciones", {
    p_actor: req.user.email,
    p_organizacion_id: req.query.organizacion_id || null,
    p_limite: Number(req.query.limit) || 50,
  })
);

// Envío inmediato a todos los dispositivos del destinatario:
// preparar (valida scope y crea el registro) → enviar → cerrar (resultado).
router.post("/notificaciones", async (req, res) => {
  try {
    if (!PUSH_HABILITADO) {
      return res.status(503).json({ error: "Las notificaciones push no están configuradas" });
    }
    const { notificacion, dispositivos } = await llamarRpc("admin_preparar_notificacion", {
      p_actor: req.user.email,
      p_organizacion_id: req.body?.organizacion_id || null,
      p_destinatario: String(req.body?.destinatario_email || ""),
      p_titulo: String(req.body?.titulo || ""),
      p_texto: String(req.body?.texto || ""),
    });
    if (dispositivos.length === 0) {
      return res.status(201).json(notificacion);
    }

    const { exitosos, invalidos } = await enviarPush(dispositivos, {
      titulo: notificacion.titulo,
      texto: notificacion.texto,
    });
    const cerrada = await llamarRpc("admin_cerrar_notificacion", {
      p_actor: req.user.email,
      p_id: notificacion.id,
      p_exitosos: exitosos,
      p_invalidos: invalidos,
    });
    res.status(201).json(cerrada);
  } catch (error) {
    responderError(res, "Admin enviar notificación", error);
  }
});

export default router;
