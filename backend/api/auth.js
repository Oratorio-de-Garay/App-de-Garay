import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS, used only server-side to verify
// tokens and check the allowed_emails table. Never expose this key to
// the frontend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Express middleware: requires a valid Supabase session (Google SSO)
 * whose email is present in the allowed_emails table.
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

    req.user = { email };
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ error: "Error verificando autenticación" });
  }
}

export { supabaseAdmin };
