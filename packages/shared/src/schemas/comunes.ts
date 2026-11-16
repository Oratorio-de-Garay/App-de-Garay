import { z } from "zod";
import { es } from "zod/locales";
import { esFechaISO } from "../fechas";

// Mensajes de validación en español para todo lo que no tenga uno propio. Se
// importa sólo este idioma: `z.locales` arrastra todos al bundle del navegador.
z.config(es());

export const uuid = z.uuid("Identificador inválido.");

/** Id opcional: "", null o ausente quedan en null (los <select> mandan ""). */
export const uuidONulo = z.preprocess((v) => (v === "" || v === undefined ? null : v), uuid.nullable());

export const fechaISO = z.string().refine(esFechaISO, "La fecha debe tener formato AAAA-MM-DD.");

/** Texto opcional: se recorta y, si queda vacío, se guarda null. */
export const textoONulo = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => v?.trim() || null);

/** Texto obligatorio, recortado. */
export const textoRequerido = (mensaje: string) => z.string(mensaje).trim().min(1, mensaje);

export const monto = z.coerce.number("Tiene que ser un número.").min(0, "No puede ser negativo.");
