import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Service-role client: bypasses RLS, used only server-side to verify
// tokens and check the allowed_emails table. Never expose this key to
// the frontend.
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
 * Express middleware: requires a valid Supabase session (Google SSO)
 * whose email is present in the allowed_emails table, and resolves the
 * organization the request operates on.
 *
 * Leaves on req.user:
 *   email, organizationId (the active one), organizations (all memberships)
 */
export async function requireAllowedUser(req, res, next) {
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

    const email = userData.user.email.toLowerCase().trim();

    const { data: allowed, error: allowedError } = await supabaseAdmin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (allowedError) throw allowedError;

    if (!allowed) {
      return res.status(403).json({ error: "No tenés acceso a esta aplicación" });
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organizacion_miembros")
      .select("organizacion_id, organizaciones(id, nombre)")
      .eq("email", email);

    if (membershipError) throw membershipError;

    const organizations = (memberships || [])
      .filter((row) => row.organizaciones)
      .map((row) => ({ id: row.organizaciones.id, name: row.organizaciones.nombre }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // El code permite al frontend distinguir esto de "email no autorizado".
    if (!organizations.length) {
      return res.status(403).json({
        error: "Tu cuenta todavía no está asignada a ninguna organización",
        code: "SIN_ORGANIZACION",
      });
    }

    // La organización activa la elige el cliente, pero se valida contra sus
    // membresías: sin esto bastaría con mandar otro id para ver datos ajenos.
    const requested = req.headers["x-organization-id"];
    if (requested && !organizations.some((org) => org.id === requested)) {
      return res.status(403).json({ error: "No pertenecés a esa organización" });
    }

    req.user = {
      email,
      organizationId: requested || organizations[0].id,
      organizations,
    };
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ error: "Error verificando autenticación" });
  }
}

export { supabaseAdmin };
