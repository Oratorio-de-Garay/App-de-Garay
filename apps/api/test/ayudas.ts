import { marcaUnica, USUARIOS } from "../../../e2e/support/entorno";
import { adminDb, tokenDe } from "../../../e2e/support/sesion";
import { crearApp } from "../src/app";

// Los tests de integración le hablan a la app en memoria (sin puerto ni
// servidor) con tokens reales de Supabase y contra la base local.

export { adminDb, marcaUnica, tokenDe, USUARIOS };

/** Marca de todo lo que crean estos tests, para poder limpiarlo. */
export const MARCA = "ITEST";

const app = crearApp();

interface Opciones {
  /** Email del usuario que hace el pedido. Sin esto, va sin sesión. */
  como?: string;
  /** Organización activa (header X-Organization-Id). */
  org?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Respuesta<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pedir<T = any>(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  ruta: string,
  opciones: Opciones = {},
): Promise<Respuesta<T>> {
  const headers: Record<string, string> = { ...opciones.headers };
  if (opciones.como) headers.Authorization = `Bearer ${await tokenDe(opciones.como)}`;
  if (opciones.org) headers["X-Organization-Id"] = opciones.org;
  if (opciones.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await app.request(ruta, {
    method: metodo,
    headers,
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  const texto = await res.text();
  let body: unknown = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    // No era JSON: se devuelve el texto.
  }
  return { status: res.status, body: body as T, headers: res.headers };
}

interface Yo {
  organizacion_id: string;
  organizations: { id: string; name: string }[];
}

/** Organizaciones del usuario según la propia API. */
export async function organizacionesDe(email: string): Promise<{ id: string; name: string }[]> {
  const { body } = await pedir<Yo>("GET", "/api/auth/me", { como: email });
  return body.organizations;
}

/** Borra lo que crearon los tests de integración (y nada más). */
export async function limpiar(): Promise<void> {
  const { data: pibes } = await adminDb.from("pibes").select("id").eq("nombre", MARCA);
  const ids = (pibes ?? []).map((p) => p.id);
  if (ids.length) {
    await adminDb.from("asistencias").delete().in("pibe_id", ids);
    await adminDb.from("pibes").delete().in("id", ids);
  }
  const { data: eventos } = await adminDb.from("buffet_eventos").select("id").like("nombre", `${MARCA} %`);
  const eventoIds = (eventos ?? []).map((e) => e.id);
  if (eventoIds.length) {
    await adminDb.from("buffet_sales").delete().in("event_id", eventoIds);
    await adminDb.from("buffet_eventos").delete().in("id", eventoIds);
  }
  await adminDb.from("buffet_products").delete().like("name", `${MARCA} %`);
  await adminDb.from("buffet_combos").delete().like("name", `${MARCA} %`);
  await adminDb.from("buffet_budgets").delete().like("title", `${MARCA} %`);

  const patron = `${MARCA.toLowerCase()}-%@local.test`;
  await adminDb.from("solicitudes").delete().like("solicitante_email", patron);
  await adminDb.from("usuarios").delete().like("email", patron);
  const { data: lista } = await adminDb.auth.admin.listUsers({ perPage: 1000 });
  for (const usuario of lista?.users ?? []) {
    if (usuario.email?.startsWith(`${MARCA.toLowerCase()}-`) && usuario.email.endsWith("@local.test")) {
      await adminDb.auth.admin.deleteUser(usuario.id);
    }
  }
}
