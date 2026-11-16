import type { Database } from "@garay/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { ErrorDeBase } from "./errores";

// Único cliente de Supabase del servidor. Usa la service role key (saltea RLS)
// porque las rutas ya validan sesión y organización: TODA consulta a una tabla
// con organizacion_id tiene que filtrar por ella explícitamente. Nunca exponer
// esta clave al frontend.
export const db: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * El mismo cliente sin los tipos de las tablas, para el código genérico que
 * recibe el nombre de la tabla como dato (ver modules/buffet/crud.ts).
 */
export const dbSinTipos = db as unknown as SupabaseClient;

interface Respuesta<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

/**
 * Desempaqueta una respuesta de Supabase: devuelve los datos o lanza. El tipo
 * que devuelve es el de la rama exitosa (sin el `null` de la rama de error).
 */
export function datos<R extends Respuesta<unknown>>(respuesta: R): Extract<R, { error: null }>["data"] {
  if (respuesta.error) throw new ErrorDeBase(respuesta.error);
  return respuesta.data;
}

type LlamadaRpc = (funcion: string, params?: Record<string, unknown>) => PromiseLike<Respuesta<unknown>>;

/**
 * Llama a una función SQL y devuelve su resultado, o lanza el error de la
 * base (que `manejarError` traduce a HTTP). El tipo del resultado lo declara
 * quien llama: las funciones devuelven JSON armado a mano en SQL.
 */
export async function rpc<T = unknown>(funcion: string, params: Record<string, unknown> = {}): Promise<T> {
  const llamar = db.rpc.bind(db) as unknown as LlamadaRpc;
  return datos(await llamar(funcion, params)) as T;
}
