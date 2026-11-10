// ========================================================
// ENTORNO: a qué Supabase apunta este server
//
// Las variables las pone quien lanza el proceso, nunca un default:
//   npm run dev       → backend/.env.local      (Supabase local)
//   npm run dev:prod  → backend/.env.production (producción, a propósito)
//   Vercel            → Settings → Environment Variables
// Si falta alguna, el server no arranca. Antes se caía en producción en
// silencio y un `npm run dev` modificaba datos reales.
//
// Tiene que ser el primer import de index.js: auth.js crea su cliente de
// Supabase al cargarse.
// ========================================================

const REQUERIDAS = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

const faltan = REQUERIDAS.filter((nombre) => !process.env[nombre]);
if (faltan.length) {
  throw new Error(
    `Faltan variables de entorno: ${faltan.join(", ")}.\n` +
    "En local usá `npm run dev` (lee backend/.env.local). Ver docs/DESARROLLO_LOCAL.md."
  );
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
// Notificaciones push (Web Push). Opcionales: sin ellas el push queda
// deshabilitado pero el resto de la app funciona. Generarlas con
// `npx web-push generate-vapid-keys`. Ver docs/SETUP.md.
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:oratoriogarayy@gmail.com";
export const ES_BASE_LOCAL =/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SUPABASE_URL);
