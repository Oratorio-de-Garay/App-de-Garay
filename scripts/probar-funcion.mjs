// Prueba en una PC la función que `npm run vercel-build` empaquetó para
// Vercel: la carga igual que el lanzador de Vercel (un `(req, res)` exportado
// por el módulo) y le hace pedidos reales.
//
//   npm run vercel-build && node --env-file=.env.local scripts/probar-funcion.mjs

import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const funcion = require("../.vercel/output/functions/api.func/index.js");

if (typeof funcion !== "function") {
  console.error("El módulo no exporta una función:", typeof funcion);
  process.exit(1);
}

const servidor = http.createServer(funcion);
await new Promise((resolve) => servidor.listen(0, resolve));
const base = `http://localhost:${servidor.address().port}`;

const casos = [
  ["GET", "/api/health", 200],
  ["GET", "/api/auth/me", 401],
  ["GET", "/api/no-existe", 404],
  ["POST", "/api/buffet/products", 401, "{mal json"],
];

let fallas = 0;
for (const [metodo, ruta, esperado, cuerpo] of casos) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo ? { "content-type": "application/json" } : {},
    body: cuerpo,
    signal: AbortSignal.timeout(10_000),
  });
  const texto = (await respuesta.text()).slice(0, 80);
  const ok = respuesta.status === esperado;
  if (!ok) fallas++;
  console.info(
    `${ok ? "ok " : "MAL"} ${metodo} ${ruta} → ${respuesta.status} (esperado ${esperado}) ${texto}`,
  );
}

servidor.closeAllConnections();
servidor.close();
process.exitCode = fallas ? 1 : 0;
