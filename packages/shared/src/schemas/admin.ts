import { z } from "zod";

// Panel de administración, registro y push. Acá los esquemas sólo aseguran la
// FORMA del pedido: las reglas (quién puede qué, emails válidos, estados) las
// aplican las funciones SQL, que devuelven su propio mensaje en español. Ver
// docs/ROLES_Y_PERMISOS.md.

const texto = z.preprocess((v) => (v === undefined || v === null ? "" : v), z.coerce.string());
const textoOpcional = z.union([z.string(), z.null()]).optional();
const listaDeIds = z
  .unknown()
  .optional()
  .transform((v) =>
    Array.isArray(v) ? v.filter((id): id is string => typeof id === "string" && id !== "") : [],
  );

export const usuarioAltaSchema = z.object({
  email: texto,
  nombre: textoOpcional,
  organizaciones: listaDeIds,
});
export type UsuarioAltaInput = z.input<typeof usuarioAltaSchema>;

export const usuarioEditarSchema = z.object({
  nombre: textoOpcional,
  organizaciones: listaDeIds,
});
export type UsuarioEditarInput = z.input<typeof usuarioEditarSchema>;

export const rolAsignarSchema = z.object({
  email: texto,
  nombre: textoOpcional,
  rol: texto,
  organizaciones: listaDeIds,
});
export type RolAsignarInput = z.input<typeof rolAsignarSchema>;

export const organizacionSchema = z.object({ nombre: texto });
export type OrganizacionInput = z.input<typeof organizacionSchema>;

export const ESTADOS_SOLICITUD = ["pendiente", "aceptada", "rechazada", "cancelada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const solicitudResolverSchema = z.object({
  decision: texto,
  comentario: textoOpcional,
  organizacion_id: textoOpcional,
  nombre_espacio: textoOpcional,
});
export type SolicitudResolverInput = z.input<typeof solicitudResolverSchema>;

export const notificacionSchema = z.object({
  organizacion_id: textoOpcional,
  destinatarios_email: z.array(z.coerce.string()).optional(),
  destinatario_email: z.string().optional(),
  titulo: texto,
  texto: texto,
  programada_para: z
    .union([z.string(), z.null()])
    .optional()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "La fecha de envío no es válida"),
});
export type NotificacionInput = z.input<typeof notificacionSchema>;

export const solicitudCrearSchema = z.object({
  nombre: texto,
  organizacion_id: textoOpcional,
  nombre_espacio: textoOpcional,
});
export type SolicitudCrearInput = z.input<typeof solicitudCrearSchema>;

export const suscripcionPushSchema = z.object({
  endpoint: texto,
  keys: z.object({ p256dh: texto, auth: texto }).partial().optional(),
});
export const suscripcionQuitarSchema = z.object({ endpoint: texto });
