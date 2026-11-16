import { getRouteApi } from "@tanstack/react-router";
import { Clock, RefreshCw } from "lucide-react";
import { Fragment, useCallback } from "react";
import { Consulta } from "@/components/consulta";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import {
  Dato,
  EstadoVacio,
  Portada,
  Seccion,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/varios";
import { useSesion } from "@/features/auth/sesion";
import { formatoFechaHora, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  type Rol,
  useActividad,
  useOrganizaciones,
  useRoles,
  useSolicitudes,
  useUsuarios,
} from "./consultas";
import { Notificaciones } from "./notificaciones";
import { Organizaciones, Roles } from "./roles";
import { Solicitudes } from "./solicitudes";
import { textoDeActividad, type TonoDeActividad } from "./textos";
import { Usuarios } from "./usuarios";

const ruta = getRouteApi("/admin");

const PESTANAS = [
  { id: "usuarios", titulo: "Usuarios" },
  { id: "solicitudes", titulo: "Solicitudes" },
  { id: "roles", titulo: "Roles", soloSuperadmin: true },
  { id: "organizaciones", titulo: "Organizaciones", soloSuperadmin: true },
  { id: "notificaciones", titulo: "Notificaciones" },
  { id: "actividad", titulo: "Actividad" },
];

/**
 * Panel de administración. Qué pestañas se ven es sólo comodidad: la API
 * rechaza lo que el usuario no puede hacer.
 */
export function PaginaDeAdmin() {
  const { yo } = useSesion();
  const busqueda = ruta.useSearch();
  const navigate = ruta.useNavigate();

  const usuarios = useUsuarios();
  const organizaciones = useOrganizaciones();
  const roles = useRoles();
  const solicitudes = useSolicitudes();

  const pestanas = PESTANAS.filter((p) => !p.soloSuperadmin || yo.es_superadmin);
  const tab = pestanas.some((p) => p.id === busqueda.tab) ? busqueda.tab! : "usuarios";
  const pendientes = solicitudes.data?.filter((s) => s.estado === "pendiente").length ?? 0;
  const admins = new Set(
    usuarios.data?.filter((u) => u.roles.some((r) => r.rol === "admin")).map((u) => u.email),
  ).size;
  const nombres = organizaciones.data?.map((o) => o.nombre) ?? [];

  // El link de un mail trae la solicitud en la URL: una vez abierta se limpia.
  const limpiarLink = useCallback(
    () => void navigate({ search: { tab: "solicitudes" }, replace: true }),
    [navigate],
  );

  return (
    <>
      <Portada
        etiqueta="Panel de administración"
        titulo="Usuarios y permisos"
        datos={
          <>
            <Dato
              valor={usuarios.data?.length ?? "–"}
              leyenda={usuarios.data?.length === 1 ? "usuario" : "usuarios"}
            />
            <Dato
              valor={organizaciones.data?.length ?? "–"}
              leyenda={organizaciones.data?.length === 1 ? "organización" : "organizaciones"}
            />
            <Dato valor={usuarios.data ? admins : "–"} leyenda={admins === 1 ? "admin" : "admins"} />
          </>
        }
      >
        {yo.es_superadmin
          ? "Sos superadministrador: gestionás usuarios, roles y organizaciones de toda la aplicación."
          : nombres.length
            ? `Administrás ${nombres.join(", ")}. Podés dar de alta usuarios y modificar sus accesos dentro de ${
                nombres.length > 1 ? "esas organizaciones" : "esa organización"
              }.`
            : "Cargando tus permisos…"}
      </Portada>

      <Tabs value={tab} onValueChange={(nueva) => void navigate({ search: { tab: nueva } })}>
        <TabsList aria-label="Secciones del panel">
          {pestanas.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.titulo}
              {p.id === "solicitudes" && pendientes > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-white"
                  aria-label={plural(pendientes, "pendiente", "pendientes")}
                >
                  {pendientes}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="usuarios">
          <Consulta consulta={usuarios}>
            {(lista) => <Usuarios usuarios={lista} organizaciones={organizaciones.data ?? []} />}
          </Consulta>
        </TabsContent>

        <TabsContent value="solicitudes">
          <Consulta consulta={solicitudes}>
            {(lista) => (
              <Solicitudes
                solicitudes={lista}
                organizaciones={organizaciones.data ?? []}
                // Recién cuando están las organizaciones se puede resolver una solicitud.
                abrirId={organizaciones.data ? busqueda.solicitud : undefined}
                alAbrirPorLink={limpiarLink}
              />
            )}
          </Consulta>
        </TabsContent>

        {yo.es_superadmin && (
          <>
            <TabsContent value="roles">
              <Consulta consulta={usuarios}>
                {(lista) => (
                  <Roles
                    usuarios={lista}
                    organizaciones={organizaciones.data ?? []}
                    roles={roles.data ?? []}
                  />
                )}
              </Consulta>
            </TabsContent>
            <TabsContent value="organizaciones">
              <Consulta consulta={organizaciones}>
                {(lista) => <Organizaciones organizaciones={lista} />}
              </Consulta>
            </TabsContent>
          </>
        )}

        <TabsContent value="notificaciones">
          <Notificaciones usuarios={usuarios.data ?? []} organizaciones={organizaciones.data ?? []} />
        </TabsContent>

        <TabsContent value="actividad">
          <ActividadReciente roles={roles.data ?? []} />
        </TabsContent>
      </Tabs>
    </>
  );
}

const COLOR_DE_ACTIVIDAD: Record<TonoDeActividad, string> = {
  neutro: "border-l-border",
  quita: "border-l-danger",
  rol: "border-l-warning",
  organizacion: "border-l-info",
  solicitud: "border-l-brand-500",
};

function ActividadReciente({ roles }: { roles: Rol[] }) {
  const { yo } = useSesion();
  const actividad = useActividad();

  return (
    <>
      <Seccion
        titulo="Actividad reciente"
        descripcion={
          yo.es_superadmin
            ? "Todos los cambios de administración."
            : "Cambios en las organizaciones que administrás."
        }
        acciones={
          <Button variant="outline" cargando={actividad.isFetching} onClick={() => void actividad.refetch()}>
            <RefreshCw aria-hidden />
            Actualizar
          </Button>
        }
      />
      <Consulta consulta={actividad}>
        {(filas) => (
          <Listado
            clave="admin-actividad"
            titulo="Actividad"
            items={filas}
            idDe={(a) => a.id ?? `${a.created_at}-${a.accion}-${a.objetivo_email}`}
            vacio={
              <EstadoVacio icono={<Clock />} titulo="Sin actividad todavía">
                Acá vas a ver cada alta, cambio de acceso y asignación de roles.
              </EstadoVacio>
            }
            columnas={[
              {
                titulo: "Actividad",
                celda: (a) => {
                  const { tramos, tono } = textoDeActividad(a, roles);
                  return (
                    <p className={cn("border-l-4 pl-3 text-left text-pretty", COLOR_DE_ACTIVIDAD[tono])}>
                      {tramos.map((tramo, i) =>
                        typeof tramo === "string" ? (
                          <Fragment key={i}>{tramo}</Fragment>
                        ) : (
                          <strong key={i}>{tramo.fuerte}</strong>
                        ),
                      )}
                    </p>
                  );
                },
              },
              {
                titulo: "Cuándo",
                celda: (a) => <span className="whitespace-nowrap">{formatoFechaHora(a.created_at)}</span>,
              },
              { titulo: "Por", celda: (a) => a.actor_email },
            ]}
          />
        )}
      </Consulta>
    </>
  );
}
