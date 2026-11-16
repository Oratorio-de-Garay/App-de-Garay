import type { Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./entorno";

const sinPersistencia = { auth: { persistSession: false, autoRefreshToken: false } };

export const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sinPersistencia);

const sesiones = new Map<string, Session>();

/**
 * Sesión real de Supabase para un mail, sin pasar por la pantalla de login ni
 * mandar mails: el admin de Auth genera el código y se canjea acá.
 * El flujo de login completo se prueba aparte (auth.spec.ts).
 */
export async function crearSesion(email: string): Promise<Session> {
  const cacheada = sesiones.get(email);
  if (cacheada) return cacheada;

  let link = await adminDb.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // Usuario que todavía no existe en Auth (base recién sembrada).
    const alta = await adminDb.auth.admin.createUser({ email, email_confirm: true });
    if (alta.error) throw alta.error;
    link = await adminDb.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_KEY, sinPersistencia);
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  if (error || !data.session) throw error ?? new Error(`No se pudo crear la sesión de ${email}`);
  sesiones.set(email, data.session);
  return data.session;
}

/** Access token para llamar a la API directamente. */
export async function tokenDe(email: string): Promise<string> {
  return (await crearSesion(email)).access_token;
}

/** Deja la sesión en el storage de supabase-js antes de que cargue la app. */
export async function iniciarSesion(page: Page, email: string): Promise<void> {
  const sesion = await crearSesion(email);
  const clave = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    },
    [clave, JSON.stringify(sesion)] as const,
  );
}
