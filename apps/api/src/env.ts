import { z } from "zod";

// ========================================================
// ENTORNO: a qué Supabase apunta este server
//
// Las variables las pone quien lanza el proceso, nunca un default:
//   npm run dev       → .env.local      (Supabase local)
//   npm run dev:prod  → .env.production (producción, a propósito)
//   Vercel            → Settings → Environment Variables
// Si falta alguna obligatoria el server no arranca: antes se caía en
// producción en silencio y un `npm run dev` modificaba datos reales.
// ========================================================

const opcional = z.string().optional().default("");

const esquema = z.object({
  SUPABASE_URL: z.url(),
  /** Publishable (anon) key: pública por diseño, la usa el navegador. */
  SUPABASE_KEY: z.string().min(1),
  /** Sólo del lado del servidor: saltea RLS. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** URL pública de la app, para los links de los mails. */
  APP_URL: opcional,
  // Mails (opcionales: sin SMTP_HOST no se manda nada).
  SMTP_HOST: opcional,
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: opcional,
  SMTP_PASS: opcional,
  MAIL_FROM: opcional,
  // Web Push (opcionales: sin el par VAPID el push queda deshabilitado).
  VAPID_PUBLIC_KEY: opcional,
  VAPID_PRIVATE_KEY: opcional,
  VAPID_SUBJECT: z.string().optional().default("mailto:oratoriogarayy@gmail.com"),
  /** Secreto compartido con pg_cron para POST /api/push/despachar. */
  CRON_SECRET: opcional,
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const faltan = resultado.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(
    `Variables de entorno faltantes o inválidas: ${faltan}.\n` +
      "En local usá `npm run dev` (lee .env.local). Ver docs/DESARROLLO_LOCAL.md.",
  );
}

export const env = resultado.data;

export const ES_BASE_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.SUPABASE_URL);
export const PUSH_HABILITADO = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
