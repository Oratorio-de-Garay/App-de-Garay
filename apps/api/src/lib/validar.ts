import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

interface Problema {
  code: string;
  path: PropertyKey[];
  message: string;
}

/** Mensaje para la persona: el del esquema, o cuál campo falta si no vino. */
export function mensajeDeValidacion(problemas: readonly Problema[]): string {
  const primero = problemas[0];
  if (!primero) return "Datos inválidos.";
  const campo = primero.path.map(String).join(".");
  // Los esquemas dan mensaje propio a las reglas; un tipo equivocado o un campo
  // ausente cae acá con el mensaje genérico de zod, que no nombra el campo.
  if (primero.code === "invalid_type" && campo && /^(Entrada inválida|Invalid input)/.test(primero.message)) {
    return `Falta o es inválido el campo "${campo}".`;
  }
  return primero.message;
}

/**
 * Valida una parte del pedido (json, query, param) con un esquema de
 * @garay/shared. Si no pasa responde 400 `{ error }`; si pasa, el handler lee
 * el valor ya tipado y transformado con `c.req.valid(...)`.
 */
export const validar = <Target extends keyof ValidationTargets, Esquema extends z.ZodType>(
  target: Target,
  esquema: Esquema,
) =>
  zValidator(target, esquema, (resultado, c) => {
    if (!resultado.success) {
      return c.json({ error: mensajeDeValidacion(resultado.error.issues) }, 400);
    }
  });
