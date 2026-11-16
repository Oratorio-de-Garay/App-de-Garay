import { getRequestListener } from "@hono/node-server";
import { crearApp } from "./app";

// Entrada de la función de Vercel. `scripts/vercel-build.mjs` empaqueta este
// archivo (con todas sus dependencias) en un solo JS: la función recibe los
// pedidos a /api/* con su dirección original y los atiende la misma app que
// corre en local.
export default getRequestListener(crearApp().fetch);
