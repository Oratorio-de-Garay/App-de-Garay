import type {
  NotificacionInput,
  OrganizacionInput,
  RolAsignarInput,
  SolicitudResolverInput,
  UsuarioAltaInput,
  UsuarioEditarInput,
} from "@garay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, pedir } from "@/lib/api";

// Panel de administración. Las respuestas las arman funciones SQL (JSON hecho
// a mano), así que sus formas se declaran acá. El panel trabaja sobre todas
// las organizaciones que el usuario administra: no lleva organización activa.

export interface OrganizacionRef {
  id: string;
  nombre: string;
}

export interface RolDeUsuario {
  rol: string;
  nombre: string;
  organizacion_id: string | null;
  organizacion_nombre: string | null;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string | null;
  roles: RolDeUsuario[];
  organizaciones: OrganizacionRef[];
  /** false: sólo un superadmin puede modificarlo (es administrador). */
  editable: boolean;
}

export interface Organizacion extends OrganizacionRef {
  miembros: number;
  admins: number;
}

export interface Rol {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  alcance: string;
  asignable_desde_panel: boolean;
}

export type EstadoDeSolicitud = "pendiente" | "aceptada" | "rechazada" | "cancelada";

export interface Solicitud {
  id: string;
  numero: number;
  estado: EstadoDeSolicitud;
  solicitante_nombre: string;
  solicitante_email: string;
  organizacion_nombre: string | null;
  created_at: string;
  resuelta_at: string | null;
  aprobador_id: string | null;
  aprobador_nombre: string | null;
  aprobador_email: string | null;
  comentario_aprobador: string | null;
  datos: { espacio_nuevo?: boolean; nombre_espacio?: string; organizacion_creada?: boolean } | null;
}

export interface Notificacion {
  id: string;
  titulo: string;
  texto: string;
  estado: string;
  destinatario_nombre: string | null;
  destinatario_email: string;
  organizacion_nombre: string;
  remitente_email: string;
  created_at: string;
  programada_para: string | null;
  dispositivos_total: number;
  enviados: number;
  motivo: string | null;
}

export interface Dispositivo {
  user_agent: string | null;
  servicio: string | null;
  created_at: string;
  ultimo_uso_at: string | null;
  desactivado_at: string | null;
}

export interface UsuarioConDispositivos {
  email: string;
  nombre: string | null;
  organizaciones: OrganizacionRef[];
  dispositivos: Dispositivo[];
}

export interface Actividad {
  id?: string | number;
  created_at: string;
  accion: string;
  actor_email: string;
  objetivo_email: string | null;
  organizacion_id: string | null;
  organizacion_nombre: string | null;
  detalle: Record<string, string | number | null> | null;
}

/** Las funciones SQL devuelven JSON sin tipo: se le pone el que corresponde. */
const como = <T>(pedido: Promise<object>) => pedido as Promise<T>;

const RAIZ = ["admin"] as const;

export const useUsuarios = () =>
  useQuery({
    queryKey: [...RAIZ, "usuarios"],
    queryFn: () => como<Usuario[]>(pedir(api.admin.usuarios.$get())),
  });

export const useOrganizaciones = () =>
  useQuery({
    queryKey: [...RAIZ, "organizaciones"],
    queryFn: () => como<Organizacion[]>(pedir(api.admin.organizaciones.$get())),
  });

export const useRoles = () =>
  useQuery({
    queryKey: [...RAIZ, "roles"],
    queryFn: () => como<Rol[]>(pedir(api.admin.roles.$get())),
    staleTime: 10 * 60_000,
  });

export const useSolicitudes = () =>
  useQuery({
    queryKey: [...RAIZ, "solicitudes"],
    queryFn: () => como<Solicitud[]>(pedir(api.admin.solicitudes.$get())),
  });

export const useNotificaciones = (activa = true) =>
  useQuery({
    queryKey: [...RAIZ, "notificaciones"],
    queryFn: () => como<Notificacion[]>(pedir(api.admin.notificaciones.$get({ query: { limit: "100" } }))),
    enabled: activa,
  });

export const useDispositivos = (organizacionId: string, activa = true) =>
  useQuery({
    queryKey: [...RAIZ, "dispositivos", organizacionId],
    queryFn: () =>
      como<UsuarioConDispositivos[]>(
        pedir(
          api.admin.dispositivos.$get({ query: organizacionId ? { organizacion_id: organizacionId } : {} }),
        ),
      ),
    enabled: activa,
  });

export const useActividad = (activa = true) =>
  useQuery({
    queryKey: [...RAIZ, "actividad"],
    queryFn: () => como<Actividad[]>(pedir(api.admin.auditoria.$get({ query: { limit: "150" } }))),
    enabled: activa,
  });

/**
 * Cualquier cambio del panel puede mover usuarios, roles, conteos y la
 * actividad: se invalida todo el panel. Son pocas consultas y poco uso.
 */
function useCambio<Variables, Resultado>(cambiar: (variables: Variables) => Promise<Resultado>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cambiar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RAIZ }),
  });
}

export const useAltaDeUsuario = () =>
  useCambio((json: UsuarioAltaInput) =>
    como<{ creado?: boolean; organizaciones_agregadas?: number }>(pedir(api.admin.usuarios.$post({ json }))),
  );

export const useEditarUsuario = () =>
  useCambio(({ id, json }: { id: string; json: UsuarioEditarInput }) =>
    como<{ eliminado?: boolean }>(pedir(api.admin.usuarios[":id"].$patch({ param: { id }, json }))),
  );

export const useQuitarAcceso = () =>
  useCambio((id: string) =>
    como<{ eliminado?: boolean }>(pedir(api.admin.usuarios[":id"].$delete({ param: { id } }))),
  );

export const useAsignarRol = () =>
  useCambio((json: RolAsignarInput) => pedir(api.admin.roles.asignaciones.$post({ json })));

export const useQuitarRol = () =>
  useCambio(({ id, rol }: { id: string; rol: string }) =>
    pedir(api.admin.usuarios[":id"].roles[":rol"].$delete({ param: { id, rol } })),
  );

export const useGuardarOrganizacion = () =>
  useCambio(({ id, json }: { id?: string; json: OrganizacionInput }) =>
    id
      ? pedir(api.admin.organizaciones[":id"].$patch({ param: { id }, json }))
      : pedir(api.admin.organizaciones.$post({ json })),
  );

export const useTomarSolicitud = () =>
  useCambio((id: string) => pedir(api.admin.solicitudes[":id"].tomar.$post({ param: { id } })));

export interface SolicitudResuelta extends Solicitud {
  notificados: number;
  aviso_error: string | null;
}

export const useResolverSolicitud = () =>
  useCambio(({ id, json }: { id: string; json: SolicitudResolverInput }) =>
    como<SolicitudResuelta>(pedir(api.admin.solicitudes[":id"].resolver.$post({ param: { id }, json }))),
  );

export interface ResultadoDeEnvio {
  notificaciones: { estado: string }[];
  rechazados: unknown[];
}

export const useEnviarNotificacion = () =>
  useCambio((json: NotificacionInput) =>
    como<ResultadoDeEnvio>(pedir(api.admin.notificaciones.$post({ json }))),
  );

export const useCancelarNotificacion = () =>
  useCambio((id: string) => pedir(api.admin.notificaciones[":id"].$delete({ param: { id } })));
