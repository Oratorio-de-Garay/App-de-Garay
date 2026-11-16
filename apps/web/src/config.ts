// Configuración pública, resuelta al armar el bundle (ver vite.config.ts).
// Son valores públicos por diseño: la publishable key de Supabase y la clave
// pública VAPID.

declare const __CONFIG__: {
  supabaseUrl: string;
  supabaseKey: string;
  vapidPublicKey: string;
  baseLocal: boolean;
};

export const config = __CONFIG__;

const enEstaMaquina = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname ?? "");

/** Corriendo en una PC contra la base de producción (npm run dev:prod). */
export const PRODUCCION_DESDE_LOCAL = enEstaMaquina && !config.baseLocal;
