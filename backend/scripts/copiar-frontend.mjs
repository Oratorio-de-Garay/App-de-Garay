// Copia ../frontend a backend/public para que Vercel lo sirva desde su CDN
// (@vercel/static-build, ver vercel.json) en vez de hacerlo la función Express.
// La carpeta public/ es un artefacto de build: no se commitea (.gitignore).
//
// Sólo corre en el build de Vercel (script "vercel-build"). En local Express
// sigue sirviendo ../frontend directamente, así que no hace falta correrlo.
//
// config.js NO se copia a propósito: es dinámico (depende de las variables de
// entorno) y lo sigue respondiendo la función. Si existiera acá, el filesystem
// de Vercel lo serviría congelado y pisaría al de la función.

import { cp, rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const origen = path.resolve(raiz, "../../frontend");
const destino = path.resolve(raiz, "../public");

try {
  await stat(origen);
} catch {
  console.error(`No existe ${origen}. ¿Está activado "Include source files outside of the Root Directory" en Vercel?`);
  process.exit(1);
}

await rm(destino, { recursive: true, force: true });
await cp(origen, destino, {
  recursive: true,
  filter: (archivo) => path.basename(archivo) !== "config.js",
});

const archivos = await readdir(destino);
if (!archivos.includes("index.html")) {
  console.error("public/ quedó sin index.html: algo salió mal al copiar el frontend.");
  process.exit(1);
}
console.log(`Frontend copiado a ${destino} (${archivos.length} archivos).`);
