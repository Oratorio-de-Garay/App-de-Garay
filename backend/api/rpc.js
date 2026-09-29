import { supabaseAdmin } from "./auth.js";

// Llamadas a las funciones SQL del panel y del registro, y traducción de sus
// errores a HTTP (ver docs/ROLES_Y_PERMISOS.md#errores-de-las-funciones).

// SQLSTATE que levantan las funciones → status HTTP.
const HTTP_POR_SQLSTATE = {
  42501: 403, // sin permiso
  22023: 400, // dato inválido
  P0002: 404, // no encontrado
  23505: 409, // duplicado
  55000: 409, // estado que no permite la operación (ej: solicitud ya resuelta)
  "22P02": 400, // id con formato inválido (ej: uuid mal armado en la URL)
};

/** Llama a una función y devuelve su resultado, o lanza el error de la base. */
export async function llamarRpc(funcion, params) {
  const { data, error } = await supabaseAdmin.rpc(funcion, params);
  if (error) throw error;
  return data;
}

/**
 * Responde un error de una función. Los esperables (permiso, validación, etc.)
 * salen con su mensaje en español tal cual lo arma la base; el resto es 500.
 */
export function responderError(res, contexto, error) {
  const httpStatus = HTTP_POR_SQLSTATE[error.code];
  if (httpStatus) {
    // 22P02 lo levanta Postgres (no nuestras funciones): su mensaje es técnico.
    const mensaje = error.code === "22P02" ? "Identificador inválido" : error.message;
    return res.status(httpStatus).json({ error: mensaje });
  }
  console.error(`${contexto} error:`, error);
  res.status(500).json({ error: error.message });
}

/** Llama a una función y responde con su resultado. */
export async function responderRpc(res, contexto, funcion, params, status = 200) {
  try {
    res.status(status).json(await llamarRpc(funcion, params));
  } catch (error) {
    responderError(res, contexto, error);
  }
}
