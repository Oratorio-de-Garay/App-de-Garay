import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { env, ES_BASE_LOCAL } from "./env";
import type { AppEnv } from "./tipos";

// TRANSITORIO (fase 2 de la migración): sirve el frontend anterior (`frontend/`)
// desde el server nuevo, para comprobar que la API en Hono es compatible con
// él. Se borra junto con `frontend/` cuando esté la app en React (fase 4).

const carpeta = path.relative(
  process.cwd(),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend"),
);

export function servirFrontendAnterior(app: Hono<AppEnv>): void {
  // Configuración pública del frontend según el entorno (la publishable key es
  // pública por diseño).
  app.get("/config.js", (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Content-Type", "application/javascript; charset=utf-8");
    return c.body(
      `window.API_URL = "";\n` +
        `window.SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL)};\n` +
        `window.SUPABASE_ANON_KEY = ${JSON.stringify(env.SUPABASE_KEY)};\n` +
        `window.BASE_LOCAL = ${ES_BASE_LOCAL};\n` +
        `window.VAPID_PUBLIC_KEY = ${JSON.stringify(env.VAPID_PUBLIC_KEY)};\n`,
    );
  });
  app.use("*", serveStatic({ root: carpeta || "." }));
}
