import { MARCA } from "./entorno";
import { adminDb } from "./sesion";

/**
 * Borra de la base local lo que crearon los tests (todo lleva la marca E2E).
 * No toca nada más: los datos cargados a mano quedan como estaban.
 */
export default async function limpiar(): Promise<void> {
  const { data: pibes } = await adminDb.from("pibes").select("id").eq("nombre", MARCA);
  const ids = (pibes ?? []).map((p) => p.id);
  if (ids.length) {
    await adminDb.from("asistencias").delete().in("pibe_id", ids);
    await adminDb.from("pibes").delete().in("id", ids);
  }
  // Las ventas primero: referencian a los eventos y a los productos.
  const { data: eventos } = await adminDb.from("buffet_eventos").select("id").like("nombre", `${MARCA} %`);
  const eventoIds = (eventos ?? []).map((e) => e.id);
  if (eventoIds.length) {
    await adminDb.from("buffet_sales").delete().in("event_id", eventoIds);
    await adminDb.from("buffet_eventos").delete().in("id", eventoIds);
  }
  await adminDb.from("buffet_products").delete().like("name", `${MARCA} %`);
  await adminDb.from("usuarios").delete().like("email", `${MARCA.toLowerCase()}-%@local.test`);
}
