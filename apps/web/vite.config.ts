import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");

/**
 * La app y la API leen las MISMAS variables (SUPABASE_URL, SUPABASE_KEY,
 * VAPID_PUBLIC_KEY). Acá se eligen, una por una, las que pueden viajar al
 * navegador; el resto (service role, SMTP, secretos) nunca entra al bundle.
 *
 * De dónde salen:
 *   - Vercel: de las variables del proyecto (process.env).
 *   - Local: SIEMPRE de .env.local (la base local), también al compilar.
 *   - Producción desde una PC: sólo pidiéndolo a propósito con el modo
 *     "produccion" (`npm run dev:prod`) o ENTORNO=produccion: lee .env.production.
 *
 * El modo de Vite (development/production) NO elige la base: `vite build`
 * corre en modo production y antes eso alcanzaba para compilar una app local
 * apuntando a la base real.
 */
function configPublica(mode: string) {
  // "produccion" (en castellano) es un modo propio y deliberado; el "production"
  // de Vite es sólo "compilar optimizado" y no cuenta.
  const aProduccion = mode === "produccion" || process.env.ENTORNO === "produccion";
  const nombre = aProduccion ? ".env.production" : ".env.local";
  const archivo = path.join(raiz, nombre);
  const delArchivo = existsSync(archivo) ? parseEnv(readFileSync(archivo, "utf8")) : {};
  const leer = (variable: string) => process.env[variable] ?? delArchivo[variable] ?? "";

  const supabaseUrl = leer("SUPABASE_URL");
  const baseLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(supabaseUrl);
  if (!supabaseUrl || !leer("SUPABASE_KEY")) {
    throw new Error(
      `Faltan SUPABASE_URL y SUPABASE_KEY para armar el frontend. En local van en ${nombre} (ver docs/DESARROLLO_LOCAL.md).`,
    );
  }
  // En una PC, la base real sólo a propósito. (Vercel define VERCEL=1.)
  if (!baseLocal && !aProduccion && !process.env.VERCEL) {
    throw new Error(
      "El frontend se iba a armar apuntando a una base que no es la local. " +
        "Si es a propósito, usá `npm run dev:prod`.",
    );
  }
  return {
    supabaseUrl,
    supabaseKey: leer("SUPABASE_KEY"),
    vapidPublicKey: leer("VAPID_PUBLIC_KEY"),
    baseLocal,
  };
}

export default defineConfig(({ mode }) => {
  const config = configPublica(mode);
  const puertoApi = process.env.API_PORT ?? "3001";

  return {
    root: aqui,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.join(aqui, "src") } },
    define: { __CONFIG__: JSON.stringify(config) },
    server: {
      // El login de Supabase sólo vuelve a localhost:3000 (ver config.toml).
      port: 3000,
      strictPort: true,
      proxy: { "/api": `http://localhost:${puertoApi}` },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      // Las librerías cambian mucho menos que la app: en archivos aparte, un
      // deploy nuevo no obliga a los celulares a volver a bajarlas.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
              { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/, priority: 2 },
              { name: "librerias", test: /node_modules[\\/]/, priority: 1 },
            ],
          },
        },
      },
    },
  };
});
