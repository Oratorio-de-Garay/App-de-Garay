import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Un solo lugar decide cómo se ve un error hacia afuera: siempre
// `{ error: "mensaje" }` (y `code` cuando el frontend tiene que distinguirlo).
// Las rutas no arman respuestas de error: lanzan y `manejarError` responde.

/** Error esperable, con el status y el mensaje que ve el usuario. */
export class ErrorHttp extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    mensaje: string,
    readonly code?: string,
  ) {
    super(mensaje);
    this.name = "ErrorHttp";
  }
}

export const noEncontrado = (mensaje: string) => new ErrorHttp(404, mensaje);
export const pedidoInvalido = (mensaje: string) => new ErrorHttp(400, mensaje);

/** Error que devolvió Postgres/PostgREST, con su SQLSTATE. */
export class ErrorDeBase extends Error {
  readonly code: string;
  constructor(origen: { message: string; code?: string }) {
    super(origen.message);
    this.name = "ErrorDeBase";
    this.code = origen.code ?? "";
  }
}

// SQLSTATE que levantan las funciones SQL → status HTTP
// (ver docs/ROLES_Y_PERMISOS.md#errores-de-las-funciones).
const HTTP_POR_SQLSTATE: Record<string, ContentfulStatusCode> = {
  "42501": 403, // sin permiso
  "22023": 400, // dato inválido
  P0002: 404, // no encontrado
  "23505": 409, // duplicado
  "55000": 409, // estado que no permite la operación (ej: solicitud ya resuelta)
  "22P02": 400, // id con formato inválido
  "23503": 409, // lo referencia otra fila (ej: borrar un producto con ventas)
};

// Estos los levanta Postgres, no nuestras funciones: su mensaje es técnico.
const MENSAJE_POR_SQLSTATE: Record<string, string> = {
  "22P02": "Identificador inválido",
  "23503": "No se puede completar: hay datos que dependen de esto.",
};

export function respuestaDeError(error: unknown): {
  status: ContentfulStatusCode;
  body: { error: string; code?: string };
} {
  if (error instanceof ErrorHttp) {
    return {
      status: error.status,
      body: { error: error.message, ...(error.code ? { code: error.code } : {}) },
    };
  }
  if (error instanceof HTTPException) {
    const status = error.status as ContentfulStatusCode;
    return { status, body: { error: status === 400 ? "El pedido no es un JSON válido" : error.message } };
  }
  if (error instanceof ErrorDeBase) {
    const status = HTTP_POR_SQLSTATE[error.code];
    if (status) return { status, body: { error: MENSAJE_POR_SQLSTATE[error.code] ?? error.message } };
  }
  // Inesperado: el detalle queda en el log, no viaja al navegador.
  return { status: 500, body: { error: "Ocurrió un error inesperado. Intentá de nuevo." } };
}

export function manejarError(error: Error, c: Context): Response {
  const { status, body } = respuestaDeError(error);
  if (status >= 500) console.error(`${c.req.method} ${c.req.path} error:`, error);
  return c.json(body, status);
}
