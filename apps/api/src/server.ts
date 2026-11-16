import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { crearApp } from "./app";
import { env, ES_BASE_LOCAL } from "./env";

// Servidor local. En Vercel no se usa: allá los archivos de la app los sirve
// el CDN y la función importa la API directamente (ver api/index.ts).
//
//   npm run dev    → sólo la API en el 3001; la app la sirve Vite en el 3000
//                    (con recarga al guardar) y le reenvía /api.
//   npm run start  → la API y la app ya compilada (apps/web/dist) en un solo
//                    puerto, como en producción. Es lo que usan los e2e.

const soloApi = process.argv.includes("--solo-api");
const puerto = soloApi ? Number(process.env.API_PORT) || 3001 : env.PORT;

const app = crearApp();

if (!soloApi) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (!existsSync(path.join(dist, "index.html"))) {
    throw new Error("No está compilada la app (apps/web/dist). Corré `npm run build` o usá `npm run dev`.");
  }
  const raiz = path.relative(process.cwd(), dist) || ".";
  // Los archivos con hash en el nombre no cambian nunca.
  app.use(
    "/assets/*",
    serveStatic({
      root: raiz,
      onFound: (_ruta, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use("*", serveStatic({ root: raiz }));
  // Cualquier otra dirección es una pantalla de la app: la resuelve el router.
  app.get("*", serveStatic({ root: raiz, path: "index.html" }));
}

serve({ fetch: app.fetch, port: puerto }, ({ port }) => {
  console.info(
    soloApi
      ? `API en http://localhost:${port} (la app: http://localhost:3000)`
      : `App en http://localhost:${port}`,
  );
  console.info(
    ES_BASE_LOCAL
      ? `Base de datos: LOCAL (${env.SUPABASE_URL})`
      : `⚠️  Base de datos: PRODUCCIÓN (${env.SUPABASE_URL}). Todo lo que hagas en la app modifica datos reales.`,
  );
});
