import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

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

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return res.status(401).json({ error: "Sesión inválida o expirada" });
    }

    const metadata = userData.user.user_metadata || {};
    req.auth = {
      email: userData.user.email.toLowerCase().trim(),
      nombreSugerido: metadata.full_name || metadata.name || null,
    };
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
    const { data: contexto, error: contextoError } = await supabaseAdmin
      .rpc("contexto_usuario", { p_email: email });

    if (contextoError) throw contextoError;

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
