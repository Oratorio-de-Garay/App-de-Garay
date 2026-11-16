// localStorage puede no estar (modo privado, storage bloqueado): nada de la
// app depende de él para funcionar, sólo guarda comodidades.

export function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function guardar(clave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin storage no se recuerda, y listo.
  }
}

// ─────────────────────────────────────────────────────────
// Volver al link original después del login
//
// Si alguien abre un link (ej: el de una solicitud en un mail) sin sesión, al
// empezar el login se guarda a dónde quería ir. Hace falta porque Google no
// vuelve a la misma URL: vuelve a la raíz. localStorage y no sessionStorage:
// un código abierto en otra pestaña también tiene que encontrarlo.
// ─────────────────────────────────────────────────────────

const CLAVE_RETORNO = "oratorio.retorno";
// Un login que se abandona no debería mandar a nadie a un link viejo.
const VIGENCIA_RETORNO_MS = 30 * 60 * 1000;

/** Sólo rutas de este sitio: "//otro.com" o "/\otro.com" serían otro dominio. */
export function esRutaInterna(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}

export function guardarRetorno(ruta: string, ahora = Date.now()): void {
  guardar(CLAVE_RETORNO, JSON.stringify({ url: ruta, guardado: ahora }));
}

/** Devuelve (y borra) la ruta guardada, si sigue vigente y es de este sitio. */
export function tomarRetorno(ahora = Date.now()): string | null {
  const crudo = leer(CLAVE_RETORNO);
  if (!crudo) return null;
  guardar(CLAVE_RETORNO, null);
  try {
    const { url, guardado } = JSON.parse(crudo) as { url?: unknown; guardado?: unknown };
    if (typeof guardado !== "number" || !(ahora - guardado < VIGENCIA_RETORNO_MS)) return null;
    return esRutaInterna(url) ? url : null;
  } catch {
    return null;
  }
}

// Organización activa. El backend la valida contra las membresías del usuario,
// así que guardar otra acá no da acceso a nada: sólo devuelve 403.
const CLAVE_ORGANIZACION = "oratorio.organization_id";
export const leerOrganizacion = () => leer(CLAVE_ORGANIZACION);
export const guardarOrganizacion = (id: string | null) => guardar(CLAVE_ORGANIZACION, id);
