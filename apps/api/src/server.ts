import { serve } from "@hono/node-server";
import { crearApp } from "./app";
import { env, ES_BASE_LOCAL } from "./env";
import { servirFrontendAnterior } from "./frontend-anterior";

// Servidor local (npm run dev). En Vercel no se usa: la función importa la app
// directamente.
const app = crearApp();
servirFrontendAnterior(app);

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.info(`API server running on http://localhost:${port}`);
  console.info(
    ES_BASE_LOCAL
      ? `Base de datos: LOCAL (${env.SUPABASE_URL})`
      : `⚠️  Base de datos: PRODUCCIÓN (${env.SUPABASE_URL}). Todo lo que hagas en la app modifica datos reales.`,
  );
});
