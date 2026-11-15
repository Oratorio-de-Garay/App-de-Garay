import {
  ESTADOS_SOLICITUD,
  type EstadoSolicitud,
  notificacionSchema,
  organizacionSchema,
  rolAsignarSchema,
  solicitudResolverSchema,
  usuarioAltaSchema,
  usuarioEditarSchema,
} from "@garay/shared";
import { Hono } from "hono";
import { PUSH_HABILITADO } from "../../env";
import { ErrorHttp } from "../../lib/errores";
import { mailSolicitudResuelta, type Solicitud, urlDeLaApp } from "../../lib/mail";
import { type Dispositivo, enviarPush } from "../../lib/push";
import { datos, db, rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import { requiereSuperadmin } from "../../middleware/auth";
import type { AppEnv } from "../../tipos";

// ========================================================
// ADMINISTRACIÓN: usuarios, roles, organizaciones, solicitudes y notificaciones
//
// Este router sólo decide quién entra a cada endpoint (admin, al montarlo, o
// superadmin). Las reglas finas —scope de organizaciones, a quién puede
// modificar cada uno, auditoría— viven en las funciones SQL de
// supabase/migrations/20260926000000_roles_y_admin.sql y siguientes, que
// reciben al actor (el email de la sesión) y rechazan lo que esté fuera de su
// alcance. Por eso casi todas las rutas son una llamada a una función.
// ========================================================

type Notificacion = { id: string; titulo: string; texto: string } & Record<string, unknown>;

interface LoteDeNotificaciones {
  lote_id: string;
  items: { notificacion: Notificacion; dispositivos: Dispositivo[] }[];
  rechazados: object;
}

const esEstado = (valor: string | undefined): valor is EstadoSolicitud =>
  ESTADOS_SOLICITUD.includes(valor as EstadoSolicitud);

export const adminRoutes = new Hono<AppEnv>()
  // ── Lecturas (filtradas por el scope del actor) ─────────
  .get("/organizaciones", async (c) =>
    c.json(await rpc<object>("admin_listar_organizaciones", { p_actor: c.var.usuario.email })),
  )
  .get("/usuarios", async (c) =>
    c.json(await rpc<object>("admin_listar_usuarios", { p_actor: c.var.usuario.email })),
  )
  .get("/auditoria", async (c) =>
    c.json(
      await rpc<object>("admin_listar_auditoria", {
        p_actor: c.var.usuario.email,
        p_limite: Number(c.req.query("limit")) || 100,
      }),
    ),
  )

  // ── Usuarios ────────────────────────────────────────────
  .post("/usuarios", validar("json", usuarioAltaSchema), async (c) => {
    const { email, nombre, organizaciones } = c.req.valid("json");
    return c.json(
      await rpc<object>("admin_alta_usuario", {
        p_actor: c.var.usuario.email,
        p_email: email,
        p_nombre: nombre ?? null,
        p_organizaciones: organizaciones,
      }),
      201,
    );
  })
  .patch("/usuarios/:id", validar("json", usuarioEditarSchema), async (c) => {
    const { nombre, organizaciones } = c.req.valid("json");
    return c.json(
      await rpc<object>("admin_editar_usuario", {
        p_actor: c.var.usuario.email,
        p_id: c.req.param("id"),
        // null: "no cambiar el nombre".
        p_nombre: nombre ?? null,
        p_organizaciones: organizaciones,
      }),
    );
  })
  .delete("/usuarios/:id", async (c) =>
    c.json(
      await rpc<object>("admin_quitar_acceso", { p_actor: c.var.usuario.email, p_id: c.req.param("id") }),
    ),
  )

  // ── Roles y organizaciones (sólo superadmin) ────────────
  // El catálogo de roles lo lee cualquier admin (para mostrar nombres), pero
  // sólo el superadmin puede asignarlos.
  .get("/roles", async (c) =>
    c.json(
      datos(
        await db
          .from("roles")
          .select("codigo, nombre, descripcion, alcance, asignable_desde_panel")
          .order("nombre"),
      ),
    ),
  )
  // Asigna un rol por email: sirve tanto para usuarios existentes como para
  // habilitar a alguien nuevo directamente como admin.
  .post("/roles/asignaciones", requiereSuperadmin, validar("json", rolAsignarSchema), async (c) => {
    const { email, nombre, rol, organizaciones } = c.req.valid("json");
    return c.json(
      await rpc<object>("superadmin_asignar_rol", {
        p_actor: c.var.usuario.email,
        p_email: email,
        p_nombre: nombre ?? null,
        p_rol: rol,
        p_organizaciones: organizaciones,
      }),
    );
  })
  .delete("/usuarios/:id/roles/:rol", requiereSuperadmin, async (c) =>
    c.json(
      await rpc<object>("superadmin_quitar_rol", {
        p_actor: c.var.usuario.email,
        p_id: c.req.param("id"),
        p_rol: c.req.param("rol"),
      }),
    ),
  )
  .post("/organizaciones", requiereSuperadmin, validar("json", organizacionSchema), async (c) =>
    c.json(
      await rpc<object>("superadmin_guardar_organizacion", {
        p_actor: c.var.usuario.email,
        p_id: null,
        p_nombre: c.req.valid("json").nombre,
      }),
      201,
    ),
  )
  .patch("/organizaciones/:id", requiereSuperadmin, validar("json", organizacionSchema), async (c) =>
    c.json(
      await rpc<object>("superadmin_guardar_organizacion", {
        p_actor: c.var.usuario.email,
        p_id: c.req.param("id"),
        p_nombre: c.req.valid("json").nombre,
      }),
    ),
  )

  // ── Solicitudes de acceso ───────────────────────────────
  .get("/solicitudes", async (c) => {
    const estado = c.req.query("estado");
    return c.json(
      await rpc<object>("admin_listar_solicitudes", {
        p_actor: c.var.usuario.email,
        p_estado: esEstado(estado) ? estado : null,
      }),
    );
  })
  .post("/solicitudes/:id/tomar", async (c) =>
    c.json(
      await rpc<object>("admin_tomar_solicitud", {
        p_actor: c.var.usuario.email,
        p_id: c.req.param("id"),
      }),
    ),
  )
  // Acepta o rechaza, y le avisa por mail al solicitante.
  .post("/solicitudes/:id/resolver", validar("json", solicitudResolverSchema), async (c) => {
    const pedido = c.req.valid("json");
    const solicitud = await rpc<Solicitud & Record<string, unknown>>("admin_resolver_solicitud", {
      p_actor: c.var.usuario.email,
      p_id: c.req.param("id"),
      p_decision: pedido.decision,
      p_comentario: pedido.comentario ?? null,
      p_organizacion_id: pedido.organizacion_id || null,
      p_nombre_espacio: pedido.nombre_espacio ?? null,
    });
    // aviso_error: por qué no salió el mail, para que el admin lo vea.
    const { notificados, motivo } = await mailSolicitudResuelta(solicitud, urlDeLaApp(c));
    return c.json({ ...solicitud, notificados, aviso_error: motivo || null });
  })

  // ── Notificaciones push ─────────────────────────────────
  .get("/notificaciones", async (c) =>
    c.json(
      await rpc<object>("admin_listar_notificaciones", {
        p_actor: c.var.usuario.email,
        p_organizacion_id: c.req.query("organizacion_id") || null,
        p_limite: Number(c.req.query("limit")) || 50,
      }),
    ),
  )
  // Dispositivos con push activado de los usuarios del scope (sin claves ni endpoint).
  .get("/dispositivos", async (c) =>
    c.json(
      await rpc<object>("admin_listar_dispositivos", {
        p_actor: c.var.usuario.email,
        p_organizacion_id: c.req.query("organizacion_id") || null,
      }),
    ),
  )
  // Envía a uno o varios destinatarios, ahora o programado.
  //   - Sin programada_para: crea los registros (valida scope por
  //     destinatario), envía a todos los dispositivos y cierra cada uno.
  //   - Con programada_para: sólo crea los registros 'programada'; los envía el
  //     despachador (POST /api/push/despachar, lo dispara pg_cron).
  // La fecha tiene que ser posterior a ahora: la autoridad es la función SQL.
  .post("/notificaciones", validar("json", notificacionSchema), async (c) => {
    if (!PUSH_HABILITADO) throw new ErrorHttp(503, "Las notificaciones push no están configuradas");

    const actor = c.var.usuario.email;
    const pedido = c.req.valid("json");
    const destinatarios =
      pedido.destinatarios_email ?? (pedido.destinatario_email ? [pedido.destinatario_email] : []);
    const programadaPara = pedido.programada_para ? new Date(pedido.programada_para).toISOString() : null;

    const { lote_id, items, rechazados } = await rpc<LoteDeNotificaciones>("admin_crear_notificaciones", {
      p_actor: actor,
      p_organizacion_id: pedido.organizacion_id || null,
      p_destinatarios: destinatarios,
      p_titulo: pedido.titulo,
      p_texto: pedido.texto,
      p_programada_para: programadaPara,
    });

    const notificaciones = programadaPara
      ? items.map((item) => item.notificacion)
      : await Promise.all(
          items.map(async ({ notificacion, dispositivos }) => {
            if (dispositivos.length === 0) return notificacion; // sin_dispositivos: ya quedó cerrada
            try {
              const { exitosos, invalidos } = await enviarPush(dispositivos, notificacion);
              return await rpc<Notificacion>("admin_cerrar_notificacion", {
                p_actor: actor,
                p_id: notificacion.id,
                p_exitosos: exitosos,
                p_invalidos: invalidos,
              });
            } catch (error) {
              // Un destinatario que falla no tira abajo al resto del lote.
              console.error("Admin enviar notificación: falló", notificacion.id, (error as Error).message);
              return notificacion;
            }
          }),
        );

    return c.json({ lote_id, notificaciones, rechazados }, 201);
  })
  // Cancela una notificación programada (sólo mientras siga 'programada').
  .delete("/notificaciones/:id", async (c) =>
    c.json(
      await rpc<object>("admin_cancelar_notificacion", {
        p_actor: c.var.usuario.email,
        p_id: c.req.param("id"),
      }),
    ),
  );
