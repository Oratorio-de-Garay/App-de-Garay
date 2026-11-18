import type { MiddlewareHandler } from "hono";
import { CacheTTL } from "../lib/cache";
import { ErrorHttp } from "../lib/errores";
import { db, rpc } from "../lib/supabase";
import type { AppEnv, Sesion, Usuario } from "../tipos";

// Caché en memoria (por instancia serverless caliente): sin él cada request
// pagaba dos viajes a Supabase antes de hacer nada útil. TTL corto: un cambio
// de roles o membresías tarda a lo sumo este tiempo en verse.
const TTL_MS = 30_000;
const MAXIMO = 500;
const sesiones = new CacheTTL<Sesion>(TTL_MS, MAXIMO);
const contextos = new CacheTTL<ContextoUsuario>(TTL_MS, MAXIMO);

/** Lo que devuelve la función SQL contexto_usuario. */
interface ContextoUsuario {
  registrado?: boolean;
  es_superadmin?: boolean;
  organizaciones?: { id: string; name: string }[];
  roles?: unknown[];
  organizaciones_admin?: string[];
}

interface Claims {
  email?: unknown;
  role?: unknown;
  user_metadata?: { full_name?: string; name?: string };
}

/**
 * Sólo vale un token de usuario con sesión iniciada (con email). La anon key y
 * la service role key son JWT válidos pero sin email: se rechazan.
 */
export function sesionDesdeClaims(claims: Claims | null | undefined): Sesion | null {
  if (!claims?.email || claims.role !== "authenticated") return null;
  const metadata = claims.user_metadata ?? {};
  return {
    email: String(claims.email).toLowerCase().trim(),
    nombreSugerido: metadata.full_name || metadata.name || null,
  };
}

/**
 * Valida el access token y devuelve la sesión o null.
 *
 * Camino rápido: getClaims verifica firma y vencimiento localmente contra las
 * claves públicas del proyecto (JWKS, que el cliente baja una vez), sin un
 * viaje a Auth por request. Sólo funciona con firma asimétrica (ES256/RS256),
 * que es lo que usa el proyecto.
 *
 * Respaldo: si la verificación local falla por cualquier motivo se consulta a
 * Auth con getUser, que es la fuente de verdad.
 *
 * Compromiso: con la verificación local un access token sigue valiendo hasta
 * que vence (1 h) aunque la sesión se haya cerrado en otro dispositivo.
 */
async function verificarToken(token: string): Promise<Sesion | null> {
  try {
    const { data, error } = await db.auth.getClaims(token);
    if (!error && data?.claims) return sesionDesdeClaims(data.claims as Claims);
  } catch (error) {
    console.warn("getClaims falló, se consulta a Auth:", error instanceof Error ? error.message : error);
  }

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return sesionDesdeClaims({
    email: data.user.email,
    role: "authenticated",
    user_metadata: data.user.user_metadata,
  });
}

async function leerSesion(autorizacion: string | undefined): Promise<Sesion> {
  const token = autorizacion?.startsWith("Bearer ") ? autorizacion.slice(7) : null;
  if (!token) throw new ErrorHttp(401, "No autenticado");

  let sesion = sesiones.get(token);
  if (!sesion) {
    sesion = (await verificarToken(token)) ?? undefined;
    if (!sesion) throw new ErrorHttp(401, "Sesión inválida o expirada");
    sesiones.set(token, sesion);
  }
  return sesion;
}

/**
 * Arma el usuario del request a partir de su contexto en la base.
 * `organizacionPedida` es el header X-Organization-Id: se valida contra las
 * membresías, porque sin eso bastaría con mandar otro id para ver datos ajenos.
 * Ser superadmin no da acceso a los datos de una organización.
 */
export function usuarioDesdeContexto(
  email: string,
  contexto: ContextoUsuario | null | undefined,
  organizacionPedida: string | undefined,
): Usuario {
  // El code le dice al frontend que muestre la pantalla de registro.
  if (!contexto?.registrado) {
    throw new ErrorHttp(403, "Tu cuenta todavía no tiene acceso a esta aplicación", "SIN_REGISTRO");
  }

  const organizations = contexto.organizaciones ?? [];
  const esSuperadmin = Boolean(contexto.es_superadmin);

  // El superadmin es un rol global: puede entrar sin organización, pero sólo al
  // panel de administración (ver requiereOrganizacion).
  if (!organizations.length && !esSuperadmin) {
    throw new ErrorHttp(403, "Tu cuenta todavía no está asignada a ninguna organización", "SIN_ORGANIZACION");
  }

  if (organizacionPedida && !organizations.some((org) => org.id === organizacionPedida)) {
    throw new ErrorHttp(403, "No pertenecés a esa organización");
  }

  return {
    email,
    organizationId: organizacionPedida || organizations[0]?.id || null,
    organizations,
    roles: contexto.roles ?? [],
    esSuperadmin,
    organizacionesAdministradas: contexto.organizaciones_admin ?? [],
  };
}

/** Admin de al menos una organización, o superadmin. */
export function puedeAdministrar(usuario: Usuario | undefined): boolean {
  return Boolean(usuario?.esSuperadmin || usuario?.organizacionesAdministradas.length);
}

/** Admin de esa organización puntual (no basta con serlo de otra). */
export function esAdminDeOrganizacion(usuario: Usuario | undefined, organizacionId: string): boolean {
  return Boolean(usuario?.organizacionesAdministradas.includes(organizacionId));
}

/** Corta con 403 si el usuario no administra la organización activa del request. */
export function exigirAdminDeOrganizacion(usuario: Usuario, organizacionId: string): void {
  if (!esAdminDeOrganizacion(usuario, organizacionId)) {
    throw new ErrorHttp(403, "Sólo un administrador de la organización puede hacer esto");
  }
}

/**
 * Exige una sesión válida de Supabase (Google o código por mail), sin exigir
 * que el email esté registrado. Deja `sesion` en el contexto. Sola la usan las
 * rutas de /api/registro: las de quien todavía no tiene acceso y lo pide.
 */
export const requiereSesion: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("sesion", await leerSesion(c.req.header("authorization")));
  await next();
};

/**
 * Exige una sesión cuyo email esté registrado en public.usuarios y resuelve la
 * organización activa y los roles. Deja `sesion` y `usuario` en el contexto.
 *
 * `ignorarOrganizacion` es para /api/auth/me: es la ruta con la que el frontend
 * averigua cuáles organizaciones son válidas, y un header viejo (de otro
 * usuario del mismo navegador) no puede dejar afuera a alguien habilitado.
 */
export function requiereUsuario(opciones: { ignorarOrganizacion?: boolean } = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sesion = await leerSesion(c.req.header("authorization"));
    c.set("sesion", sesion);

    // Usuario, membresías y roles en una sola consulta (función contexto_usuario).
    let contexto = contextos.get(sesion.email);
    if (!contexto) {
      contexto = await rpc<ContextoUsuario>("contexto_usuario", { p_email: sesion.email });
      contextos.set(sesion.email, contexto);
    }

    const pedida = opciones.ignorarOrganizacion ? undefined : c.req.header("x-organization-id");
    c.set("usuario", usuarioDesdeContexto(sesion.email, contexto, pedida));
    await next();
  };
}

/** Rutas de datos: exigen una organización activa. Deja `organizacionId`. */
export const requiereOrganizacion: MiddlewareHandler<AppEnv> = async (c, next) => {
  const organizacionId = c.get("usuario").organizationId;
  if (!organizacionId) {
    throw new ErrorHttp(403, "Tu cuenta todavía no está asignada a ninguna organización", "SIN_ORGANIZACION");
  }
  c.set("organizacionId", organizacionId);
  await next();
};

export const requiereAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!puedeAdministrar(c.get("usuario"))) throw new ErrorHttp(403, "No tenés permisos de administración");
  await next();
};

export const requiereSuperadmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("usuario").esSuperadmin) throw new ErrorHttp(403, "Sólo un superadmin puede hacer esto");
  await next();
};

/** Para los tests: vacía los cachés de sesión y contexto. */
export function vaciarCachesDeAuth(): void {
  sesiones.clear();
  contextos.clear();
}
