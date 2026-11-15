import { noEncontrado } from "../../lib/errores";
import { datos, dbSinTipos } from "../../lib/supabase";

/**
 * Alta, edición y baja de un catálogo de buffet (productos, combos,
 * presupuestos): la misma operación sobre tablas distintas.
 *
 * El filtro por organización va SIEMPRE además del id: sin él, conociendo un
 * UUID se podría editar o borrar una fila de otra organización.
 */
export function crudDeCatalogo(tabla: string, mensajeNoEncontrado: string) {
  return {
    async crear(organizacionId: string, valores: Record<string, unknown>): Promise<{ id: string }> {
      return datos(
        await dbSinTipos
          .from(tabla)
          .insert({ ...valores, organizacion_id: organizacionId })
          .select("id")
          .single(),
      ) as { id: string };
    },

    async editar(
      organizacionId: string,
      id: string,
      valores: Record<string, unknown>,
    ): Promise<{ id: string }> {
      const fila = datos(
        await dbSinTipos
          .from(tabla)
          .update(valores)
          .eq("id", id)
          .eq("organizacion_id", organizacionId)
          .select("id")
          .maybeSingle(),
      ) as { id: string } | null;
      if (!fila) throw noEncontrado(mensajeNoEncontrado);
      return fila;
    },

    async borrar(organizacionId: string, id: string): Promise<void> {
      datos(await dbSinTipos.from(tabla).delete().eq("id", id).eq("organizacion_id", organizacionId));
    },
  };
}
