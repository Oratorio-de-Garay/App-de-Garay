import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Service-role client: bypasses RLS, used only server-side to verify
// tokens and read users/roles. Never expose this key to the frontend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

// Cache en memoria (por instancia serverless caliente). Cada request pagaba dos
// viajes a Supabase (auth.getUser + contexto_usuario) antes de hacer nada útil.
// TTL corto: un cambio de roles/membresías tarda a lo sumo este tiempo en verse.
const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_CACHE_MAX = 500;
const sesionCache = new Map(); // token -> { exp, value }
const contextoCache = new Map(); // email -> { exp, value }

function cacheGet(map, key) {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(map, key, value) {
  if (map.size >= AUTH_CACHE_MAX) map.delete(map.keys().next().value);
  map.set(key, { exp: Date.now() + AUTH_CACHE_TTL_MS, value });
}

function authDesdeClaims(claims) {
  // Sólo vale un token de usuario con sesión iniciada (con email). La anon key y
  // la service role key son JWT válidos pero sin email: se rechazan.
  if (!claims?.email || claims.role !== "authenticated") return null;
  const metadata = claims.user_metadata || {};
  return {
    email: String(claims.email).toLowerCase().trim(),
    nombreSugerido: metadata.full_name || metadata.name || null,
  };
}

/**
 * Valida el access token y devuelve { email, nombreSugerido } o null.
 *
 * Camino rápido: getClaims verifica la firma y el vencimiento localmente contra
 * las claves públicas del proyecto (JWKS, que el cliente baja una vez y deja en
 * memoria), sin un viaje a Auth por cada request. Sólo funciona con claves de
 * firma asimétricas (ES256/RS256), que es lo que usa el proyecto.
 *
 * Respaldo: si la verificación local falla por cualquier motivo (claves no
 * disponibles, algoritmo simétrico, error transitorio) se consulta a Auth con
 * getUser, que es la fuente de verdad. Así un problema al bajar las claves no
 * deja afuera a nadie; un token realmente inválido igual termina en null.
 *
 * Compromiso: con la verificación local, un access token sigue valiendo hasta
 * que vence (jwt_expiry, 1 h) aunque el usuario haya cerrado sesión en otro
 * dispositivo; getUser lo rechazaba apenas se revocaba la sesión.
 */
async function verificarToken(token) {
  try {
    const { data, error } = await supabaseAdmin.auth.getClaims(token);
    if (!error && data?.claims) {
      return authDesdeClaims(data.claims);
    }
  } catch (error) {
    console.warn("getClaims falló, se consulta a Auth:", error?.message || error);
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.email) return null;

  const metadata = userData.user.user_metadata || {};
  return {
    email: userData.user.email.toLowerCase().trim(),
    nombreSugerido: metadata.full_name || metadata.name || null,
  };
}

/** Invalida el contexto cacheado de un usuario (tras cambiarle roles/membresías). */
export function invalidarContextoUsuario(email) {
  if (email) contextoCache.delete(String(email).toLowerCase().trim());
}

/**
 * Valida la sesión de Supabase (Google o código por mail) sin exigir que el
 * email esté registrado. Deja en req.auth: email y nombreSugerido (el nombre
 * que trae la cuenta de Google, si hay).
 *
 * Sola la usan las rutas de /api/registro: las de quien todavía no tiene
 * acceso y está pidiéndolo.
 */
export async function requireSession(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "No autenticado" });
    }

    let auth = cacheGet(sesionCache, token);
    if (!auth) {
      auth = await verificarToken(token);
      if (!auth) {
        return res.status(401).json({ error: "Sesión inválida o expirada" });
      }
      cacheSet(sesionCache, token, auth);
    }

    req.auth = { ...auth };
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ error: "Error verificando autenticación" });
  }
}

/**
 * Express middleware: requires a valid Supabase session whose email is
 * registered in public.usuarios, and resolves the organization the request
 * operates on plus the user's roles.
 *
 * Leaves on req.user:
 *   email, organizationId (the active one, null for a superadmin without
 *   memberships), organizations (all memberships), roles,
 *   esSuperadmin, organizacionesAdministradas (ids; all orgs for a superadmin)
 */
export function requireAllowedUser(req, res, next) {
  return requireSession(req, res, () => resolverUsuario(req, res, next));
}

async function resolverUsuario(req, res, next) {
  try {
    const { email } = req.auth;

    // Usuario, membresías y roles en una sola consulta (ver contexto_usuario
    // en supabase/migrations/20260926000000_roles_y_admin.sql).
    let contexto = cacheGet(contextoCache, email);
    if (!contexto) {
      const { data, error: contextoError } = await supabaseAdmin
        .rpc("contexto_usuario", { p_email: email });

      if (contextoError) throw contextoError;
      contexto = data;
      cacheSet(contextoCache, email, contexto);
    }

    // El code le dice al frontend que muestre la pantalla de registro
    // (solicitar sumarse a un espacio) en vez de un error.
    if (!contexto?.registrado) {
      return res.status(403).json({
        error: "Tu cuenta todavía no tiene acceso a esta aplicación",
        code: "SIN_REGISTRO",
      });
    }

    const organizations = contexto.organizaciones || [];
    const esSuperadmin = Boolean(contexto.es_superadmin);

    // El code permite al frontend distinguir esto de "email no autorizado".
    // El superadmin es un rol global: puede entrar sin organización, pero sólo
    // al panel de administración (ver requireOrganization).
    if (!organizations.length && !esSuperadmin) {
      return res.status(403).json({
        error: "Tu cuenta todavía no está asignada a ninguna organización",
        code: "SIN_ORGANIZACION",
      });
    }

    // La organización activa la elige el cliente, pero se valida contra sus
    // membresías: sin esto bastaría con mandar otro id para ver datos ajenos.
    // Ser superadmin no da acceso a los datos de una organización.
    // En /auth/me se ignora: es la ruta con la que el frontend averigua cuáles
    // son válidas, y un header viejo (de otro usuario del mismo navegador) no
    // puede dejar afuera a alguien habilitado.
    const esAuthMe = req.originalUrl.split("?")[0] === "/api/auth/me";
    const requested = esAuthMe ? undefined : req.headers["x-organization-id"];
    if (requested && !organizations.some((org) => org.id === requested)) {
      return res.status(403).json({ error: "No pertenecés a esa organización" });
    }

    req.user = {
      email,
      organizationId: requested || organizations[0]?.id || null,
      organizations,
      roles: contexto.roles || [],
      esSuperadmin,
      organizacionesAdministradas: contexto.organizaciones_admin || [],
    };
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ error: "Error verificando autenticación" });
  }
}

/** Rutas de datos: exigen una organización activa. */
export function requireOrganization(req, res, next) {
  if (!req.user?.organizationId) {
    return res.status(403).json({
      error: "Tu cuenta todavía no está asignada a ninguna organización",
      code: "SIN_ORGANIZACION",
    });
  }
  next();
}

/** Admin de al menos una organización, o superadmin. */
export function puedeAdministrar(user) {
  return Boolean(user?.esSuperadmin || user?.organizacionesAdministradas?.length);
}

export function requireAdmin(req, res, next) {
  if (!puedeAdministrar(req.user)) {
    return res.status(403).json({ error: "No tenés permisos de administración" });
  }
  next();
}

export function requireSuperadmin(req, res, next) {
  if (!req.user?.esSuperadmin) {
    return res.status(403).json({ error: "Sólo un superadmin puede hacer esto" });
  }
  next();
}

export { supabaseAdmin };
