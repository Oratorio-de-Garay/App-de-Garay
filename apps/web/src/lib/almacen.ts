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

// Última organización en la que trabajó cada usuario en este dispositivo. Se
// guarda por usuario (dos personas en el mismo navegador no se pisan) y
// sobrevive al cierre de sesión: es justamente lo que se quiere recordar.
// Es sólo una preferencia, nunca una autorización: el valor se valida contra
// las membresías reales (`resolverOrganizacion`) y la API vuelve a validar el
// header X-Organization-Id en cada request, así que editarlo a mano no da
// acceso a nada.
const claveOrganizacion = (usuarioId: string) => `oratorio.organization_id.${usuarioId}`;
export const leerOrganizacion = (usuarioId: string) => leer(claveOrganizacion(usuarioId));
export const guardarOrganizacion = (usuarioId: string, id: string) =>
  guardar(claveOrganizacion(usuarioId), id);

/**
 * Organización con la que arrancar: la recordada sólo si el usuario sigue
 * perteneciendo a ella; si no (valor manipulado, acceso revocado), la que
 * resolvió la API.
 */
export function resolverOrganizacion(
  recordada: string | null,
  organizaciones: { id: string }[],
  porDefecto: string | null,
): string | null {
  return recordada !== null && organizaciones.some((org) => org.id === recordada) ? recordada : porDefecto;
}
