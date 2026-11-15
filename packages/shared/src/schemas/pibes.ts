import { z } from "zod";
import { fechaISO, textoONulo, textoRequerido, uuid } from "./comunes";

/** La ficha llega como booleano o, desde planillas viejas, como "Sí"/"Si". */
const aFicha = (v: unknown) => v === true || v === "Sí" || v === "Si";
const entregoFicha = z.unknown().optional().transform(aFicha);

/** En la base es numérico: se guardan sólo los dígitos. */
const telefono = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    const digitos = String(v ?? "").replace(/\D/g, "");
    return digitos ? Number(digitos) : null;
  });

const idCatalogo = (mensaje: string) => z.coerce.number(mensaje).int(mensaje).positive(mensaje);

export const pibeCrearSchema = z.object({
  nombre: textoRequerido("Ingresá el nombre."),
  apellido: textoRequerido("Ingresá el apellido."),
  grado_id: idCatalogo("Seleccioná un grado."),
  edad_id: idCatalogo("Seleccioná una categoría."),
  entrego_ficha: entregoFicha,
  telefono_emergencia: telefono,
  observaciones: textoONulo,
  /** Si viene, el alta también marca el presente de ese día. */
  fecha: z.preprocess((v) => v || undefined, fechaISO.optional()),
});
export type PibeCrearInput = z.input<typeof pibeCrearSchema>;

export const pibeEditarSchema = z.object({
  // Ausente = no cambiar (no es lo mismo que "no la trajo").
  entrego_ficha: z
    .unknown()
    .optional()
    .transform((v) => (v === undefined ? undefined : aFicha(v))),
  observaciones: z.union([z.string(), z.null()]).optional(),
});
export type PibeEditarInput = z.input<typeof pibeEditarSchema>;

export const pibesBusquedaQuerySchema = z.object({
  q: z.string().optional(),
  date: z.string().optional(),
});

export const asistenciaSchema = z.object({
  student_id: uuid,
  fecha: fechaISO,
});
export type AsistenciaInput = z.input<typeof asistenciaSchema>;

export const asistenciaCheckQuerySchema = z.object({ student_id: uuid, date: fechaISO });
export const asistenciaPorFechaQuerySchema = z.object({ date: fechaISO });
export const anioQuerySchema = z.object({ year: z.string().optional() });
