// Build de producción para Vercel (comando de build del proyecto, ver
// vercel.json y docs/SETUP.md#deploy-vercel).
//
// Escribe el resultado con la Build Output API v3 de Vercel
// (https://vercel.com/docs/build-output-api):
//
//   .vercel/output/
//     config.json                 rutas y cabeceras
//     static/                     la app compilada (la sirve el CDN)
//     functions/api.func/         la API, empaquetada en un solo archivo
//
// Por qué así y no con una carpeta `api/`: la API importa código TypeScript de
// otros paquetes del repo (`@garay/shared`). Empaquetándola acá con esbuild el
// resultado no depende de cómo Vercel compile un monorepo, y se puede probar
// en una PC: `npm run vercel-build` y mirar `.vercel/output`.

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const salida = path.join(raiz, ".vercel/output");
const funcion = path.join(salida, "functions/api.func");

/** Región de la función: São Paulo, al lado de la base (sa-east-1). */
const REGION = "gru1";

rmSync(salida, { recursive: true, force: true });
mkdirSync(funcion, { recursive: true });

// 1. La app (Vite). Toma SUPABASE_URL, SUPABASE_KEY y VAPID_PUBLIC_KEY de las
//    variables del proyecto en Vercel, o de .env.local en una PC.
execSync("npm run build -w @garay/web", { cwd: raiz, stdio: "inherit" });
const dist = path.join(raiz, "apps/web/dist");
if (!existsSync(path.join(dist, "index.html"))) throw new Error("El build de la app no generó index.html");
cpSync(dist, path.join(salida, "static"), {
  recursive: true,
  // Los mapas de código no se publican.
  filter: (origen) => !origen.endsWith(".map"),
});

// 2. La API: un solo archivo con todas sus dependencias adentro.
await build({
  entryPoints: [path.join(raiz, "apps/api/src/vercel.ts")],
  outfile: path.join(funcion, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
  // El lanzador de Vercel espera la función como export directo del módulo.
  footer: { js: "module.exports = module.exports.default;" },
});

// El paquete es CommonJS aunque el repo sea "type": "module".
writeFileSync(path.join(funcion, "package.json"), JSON.stringify({ type: "commonjs" }));

writeFileSync(
  path.join(funcion, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.js",
      launcherType: "Nodejs",
      // La app lee el pedido crudo (lo parsea Hono), sin los helpers de Vercel.
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      regions: [REGION],
      // Mandar push espera a cada dispositivo (hasta 8 s) antes de responder.
      maxDuration: 60,
    },
    null,
    2,
  ),
);

// 3. Rutas. El orden importa: cabeceras, API, archivos, y al final la app.
writeFileSync(
  path.join(salida, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Los archivos de /assets llevan un hash en el nombre: no cambian nunca.
        {
          src: "^/assets/.*$",
          headers: { "Cache-Control": "public, max-age=31536000, immutable" },
          continue: true,
        },
        // El service worker y el HTML se revalidan siempre, para que un deploy
        // nuevo llegue enseguida.
        {
          src: "^/(sw\\.js|index\\.html)?$",
          headers: { "Cache-Control": "no-cache" },
          continue: true,
        },
        // Toda la API es una sola función.
        { src: "^/api(?:/.*)?$", dest: "/api" },
        { handle: "filesystem" },
        // Un archivo de /assets que no existe es un 404, no la app.
        { src: "^/assets/.*$", status: 404 },
        // Cualquier otra dirección es una pantalla: la resuelve el router.
        { src: "^/.*$", dest: "/index.html", headers: { "Cache-Control": "no-cache" } },
      ],
    },
    null,
    2,
  ),
);

console.info(`\nListo: ${path.relative(raiz, salida)} (función en ${REGION}).`);
