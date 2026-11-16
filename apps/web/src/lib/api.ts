import type { ApiRoutes } from "@garay/api";
import { hc } from "hono/client";
import { supabase } from "./supabase";

// Cliente de la API. Conoce rutas, parámetros y respuestas por el tipo
// `ApiRoutes` que exporta apps/api: si cambia un endpoint, el frontend deja de
// compilar donde lo usa.
//
//   const productos = await pedir(api.buffet.products.$get());

/** Error de la API, con el mensaje para mostrarle a la persona. */
export class ErrorDeApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    /** SIN_REGISTRO, SIN_ORGANIZACION… */
    readonly code?: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeApi";
  }
}

let organizacionActiva: string | null = null;

/** La fija el proveedor de sesión; viaja en cada pedido de datos. */
export function usarOrganizacion(id: string | null): void {
  organizacionActiva = id;
}

export async function fetchConSesion(
  entrada: RequestInfo | URL,
  opciones: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(opciones.headers);
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // /api/auth/me no lleva organización: es justamente la que dice cuáles son
  // válidas, y una guardada de otro usuario del mismo navegador daría 403.
  const ruta = new URL(
    typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
    location.origin,
  ).pathname;
  if (organizacionActiva && ruta !== "/api/auth/me") headers.set("X-Organization-Id", organizacionActiva);

  return fetch(entrada, { ...opciones, headers });
}

export const api = hc<ApiRoutes>("/api", { fetch: fetchConSesion });

/**
 * El cuerpo de las respuestas exitosas de una ruta: lo que devuelve su json()
 * sin la forma `{ error }` de los rechazos de validación.
 */
type Exito<R> = R extends { json(): Promise<infer T> } ? Exclude<T, { error: string }> : never;

/** Convierte una respuesta en datos, o lanza un ErrorDeApi con su mensaje. */
export async function pedir<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  pedido: Promise<R>,
): Promise<Exito<R>> {
  let respuesta: R;
  try {
    respuesta = await pedido;
  } catch {
    throw new ErrorDeApi("No se pudo conectar. Revisá tu conexión e intentá de nuevo.", 0);
  }
  // Un error de la plataforma puede venir como HTML: no tiene que romper acá.
  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!respuesta.ok) {
    throw new ErrorDeApi(cuerpo?.error || `Error ${respuesta.status}`, respuesta.status, cuerpo?.code);
  }
  return cuerpo as Exito<R>;
}

/** Mensaje de cualquier error, para un toast o un formulario. */
export function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
