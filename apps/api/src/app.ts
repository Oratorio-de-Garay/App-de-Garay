import { Hono } from "hono";
import { manejarError } from "./lib/errores";
import {
  puedeAdministrar,
  requiereAdmin,
  requiereOrganizacion,
  requiereSesion,
  requiereUsuario,
} from "./middleware/auth";
import { adminRoutes } from "./modules/admin/routes";
import { asistenciaRoutes } from "./modules/asistencia/routes";
import { buffetRoutes } from "./modules/buffet/routes";
import { catalogosRoutes, pibesRoutes } from "./modules/pibes/routes";
import { pushRoutes } from "./modules/push/routes";
import { registroRoutes } from "./modules/registro/routes";
import type { AppEnv } from "./tipos";

// ========================================================
// La API. Cada grupo declara acá qué exige para entrar:
//
//   /api/health      nada (monitoreo)
//   /api/registro    sesión válida (quien todavía no tiene acceso)
//   /api/push        usuario registrado, salvo /despachar (secreto de cron)
//   /api/auth/me     usuario registrado
//   /api/admin       usuario registrado + admin de algo (o superadmin)
//   el resto         usuario registrado + organización activa
//
// /auth/me y /admin no exigen organización: un superadmin sin membresías
// tiene que poder entrar al panel.
// ========================================================

const usuario = requiereUsuario();

const rutas = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ status: "ok" }))

  // Confirma que el token es válido y devuelve organizaciones y roles. El
  // frontend la llama apenas hay sesión.
  .get("/auth/me", requiereUsuario({ ignorarOrganizacion: true }), (c) => {
    const u = c.var.usuario;
    return c.json({
      email: u.email,
      organizacion_id: u.organizationId,
      organizations: u.organizations,
      roles: u.roles,
      es_superadmin: u.esSuperadmin,
      organizaciones_admin: u.organizacionesAdministradas,
      puede_administrar: puedeAdministrar(u),
    });
  })

  .route("/registro", new Hono<AppEnv>().use(requiereSesion).route("/", registroRoutes))
  .route("/push", pushRoutes)
  .route("/admin", new Hono<AppEnv>().use(usuario, requiereAdmin).route("/", adminRoutes))

  .route("/buffet", new Hono<AppEnv>().use(usuario, requiereOrganizacion).route("/", buffetRoutes))
  .route("/lookups", new Hono<AppEnv>().use(usuario, requiereOrganizacion).route("/", catalogosRoutes))
  .route("/students", new Hono<AppEnv>().use(usuario, requiereOrganizacion).route("/", pibesRoutes))
  .route("/attendance", new Hono<AppEnv>().use(usuario, requiereOrganizacion).route("/", asistenciaRoutes));

export function crearApp() {
  const app = new Hono<AppEnv>();
  app.onError(manejarError);
  app.route("/api", rutas);
  // Una ruta de /api que no existe responde JSON, como el resto de la API.
  app.all("/api/*", (c) => c.json({ error: "No encontrado" }, 404));
  return app;
}

/** Tipo de la API para el cliente tipado del frontend (hono/client). */
export type ApiRoutes = typeof rutas;
