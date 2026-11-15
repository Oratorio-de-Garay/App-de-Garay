import { z } from "zod";
import { fechaISO, monto, textoONulo, textoRequerido, uuid, uuidONulo } from "./comunes";

export const productoSchema = z.object({
  name: textoRequerido("El nombre es obligatorio."),
  category_id: uuidONulo,
  unit_id: uuidONulo,
  // El stock puede ser negativo: en las ferias se vende lo donado sin cargarlo.
  stock_current: z.coerce.number("El stock tiene que ser un número.").default(0),
  sale_price: monto.default(0),
  observation: textoONulo,
  active: z.boolean().default(true),
  is_donated: z.boolean().default(false),
});
export type ProductoInput = z.input<typeof productoSchema>;

export const comboSchema = z.object({
  name: textoRequerido("El nombre es obligatorio."),
  description: textoONulo,
  sale_price: monto.default(0),
  active: z.boolean().default(true),
});
export type ComboInput = z.input<typeof comboSchema>;

export const presupuestoSchema = z.object({
  title: textoRequerido("El título es obligatorio."),
  client_name: textoONulo,
  observation: textoONulo,
  status: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || "borrador"),
  total_amount: monto.default(0),
});
export type PresupuestoInput = z.input<typeof presupuestoSchema>;

const nombreEvento = textoRequerido("El nombre del evento es obligatorio.");
const estadoEvento = z.string().trim().min(1);

export const eventoCrearSchema = z.object({
  nombre: nombreEvento,
  fecha: z.preprocess((v) => v || undefined, fechaISO.optional()),
  estado: z.preprocess((v) => v || undefined, estadoEvento.default("abierto")),
  observacion: textoONulo,
});
export type EventoCrearInput = z.input<typeof eventoCrearSchema>;

/** Edición parcial: sólo se cambia lo que viene. */
export const eventoEditarSchema = z.object({
  nombre: nombreEvento.optional(),
  fecha: fechaISO.optional(),
  estado: estadoEvento.optional(),
  observacion: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null)),
});
export type EventoEditarInput = z.input<typeof eventoEditarSchema>;

export const eventosQuerySchema = z.object({ q: z.string().trim().optional() });

/** Ítem tal como lo manda el carrito; se normaliza con normalizarItemsVenta. */
export const ventaItemSchema = z.object({
  product_id: z.string().nullish(),
  combo_id: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.union([z.number(), z.string()]).nullish(),
  unit_price: z.union([z.number(), z.string()]).nullish(),
});
export type VentaItemInput = z.input<typeof ventaItemSchema>;

const cabeceraVenta = {
  payment_method: z.preprocess((v) => v || undefined, z.string().trim().default("efectivo")),
  observation: textoONulo,
  items: z.array(ventaItemSchema, "La venta debe tener al menos un ítem.").default([]),
};

export const ventaCrearSchema = z.object({
  event_id: z.preprocess((v) => v || undefined, uuid.optional()),
  sale_date: z.preprocess((v) => v || null, fechaISO.nullable()),
  ...cabeceraVenta,
});
export type VentaCrearInput = z.input<typeof ventaCrearSchema>;

export const ventaEditarSchema = z.object(cabeceraVenta);
export type VentaEditarInput = z.input<typeof ventaEditarSchema>;

export const ventasQuerySchema = z.object({
  event_id: uuid.optional(),
  from: fechaISO.optional(),
  to: fechaISO.optional(),
  event: z.string().trim().optional(),
});
