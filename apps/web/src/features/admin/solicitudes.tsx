import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DialogoDeFormulario } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/campos";
import { Avatar, Badge, EstadoVacio, Persona, Seccion, type TonoBadge } from "@/components/ui/varios";
import { useSesion } from "@/features/auth/sesion";
import { mensajeDeError } from "@/lib/api";
import { formatoFechaHora } from "@/lib/formato";
import { ChipDeOrganizacion, OpcionConDetalle } from "./comunes";
import {
  type EstadoDeSolicitud,
  type Organizacion,
  type Solicitud,
  useResolverSolicitud,
  useTomarSolicitud,
} from "./consultas";

const ESTADOS: Record<EstadoDeSolicitud, { nombre: string; plural: string; tono: TonoBadge }> = {
  pendiente: { nombre: "Pendiente", plural: "Pendientes", tono: "aviso" },
  aceptada: { nombre: "Aceptada", plural: "Aceptadas", tono: "exito" },
  rechazada: { nombre: "Rechazada", plural: "Rechazadas", tono: "peligro" },
  cancelada: { nombre: "Cancelada", plural: "Canceladas", tono: "neutro" },
};

const InsigniaDeEstado = ({ estado }: { estado: EstadoDeSolicitud }) => (
  <Badge tono={ESTADOS[estado]?.tono}>{ESTADOS[estado]?.nombre ?? estado}</Badge>
);

/** "Quiere sumarse a X" / "Quiere crear el espacio Y" (o lo que resultó). */
function Pedido({ solicitud: s }: { solicitud: Solicitud }) {
  if (!s.datos?.espacio_nuevo) {
    return (
      <>
        Quiere sumarse a <ChipDeOrganizacion nombre={s.organizacion_nombre} />
      </>
    );
  }
  const pedido = (
    <>
      Quiere crear el espacio <strong>{s.datos.nombre_espacio}</strong>
    </>
  );
  if (s.estado !== "aceptada") {
    return (
      <>
        {pedido} <Badge tono="info">Espacio nuevo</Badge>
      </>
    );
  }
  return s.datos.organizacion_creada ? (
    <>
      {pedido}: se creó <ChipDeOrganizacion nombre={s.organizacion_nombre} /> y quedó como admin
    </>
  ) : (
    <>
      {pedido}: se sumó a <ChipDeOrganizacion nombre={s.organizacion_nombre} />, que ya existía
    </>
  );
}

function Seguimiento({ solicitud: s }: { solicitud: Solicitud }) {
  const quien = s.aprobador_nombre || s.aprobador_email || "un administrador";
  const nota = "text-[13px] text-muted-foreground";
  if (s.estado === "pendiente") return s.aprobador_id ? <p className={nota}>Tomada por {quien}</p> : null;
  if (s.estado === "cancelada") {
    return <p className={nota}>La canceló el solicitante · {formatoFechaHora(s.resuelta_at)}</p>;
  }
  return (
    <>
      <p className={nota}>
        {ESTADOS[s.estado].nombre} por {quien} · {formatoFechaHora(s.resuelta_at)}
      </p>
      {s.comentario_aprobador && <p className="text-[13px] italic">“{s.comentario_aprobador}”</p>}
    </>
  );
}

interface Props {
  solicitudes: Solicitud[];
  organizaciones: Organizacion[];
  /** Solicitud a abrir al entrar (link de un mail). */
  abrirId?: string;
  alAbrirPorLink: () => void;
}

export function Solicitudes({ solicitudes, organizaciones, abrirId, alAbrirPorLink }: Props) {
  const { yo } = useSesion();
  const tomar = useTomarSolicitud();
  const [filtro, setFiltro] = useState<EstadoDeSolicitud | "">("pendiente");
  const [abierta, setAbierta] = useState<Solicitud>();

  // Link de un mail: se abre esa solicitud una sola vez.
  useEffect(() => {
    if (!abrirId) return;
    const solicitud = solicitudes.find((s) => s.id === abrirId);
    if (solicitud) {
      if (solicitud.estado !== "pendiente") setFiltro("");
      setAbierta(solicitud);
    } else {
      toast.error("No se encontró la solicitud, o no tenés permiso para verla.");
    }
    alAbrirPorLink();
  }, [abrirId, solicitudes, alAbrirPorLink]);

  const cuenta = (estado: string) => solicitudes.filter((s) => !estado || s.estado === estado).length;
  const visibles = solicitudes.filter((s) => !filtro || s.estado === filtro);

  return (
    <>
      <Seccion
        titulo="Solicitudes"
        descripcion={
          yo.es_superadmin
            ? "Pedidos de acceso a cualquier espacio y de espacios nuevos."
            : "Pedidos de acceso a los espacios que administrás."
        }
        acciones={
          <Select
            className="w-52"
            aria-label="Filtrar por estado"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as EstadoDeSolicitud | "")}
          >
            {(Object.keys(ESTADOS) as EstadoDeSolicitud[]).map((codigo) => (
              <option key={codigo} value={codigo}>
                {ESTADOS[codigo].plural} ({cuenta(codigo)})
              </option>
            ))}
            <option value="">Todas ({cuenta("")})</option>
          </Select>
        }
      />
      <Listado
        clave="admin-solicitudes"
        titulo="Solicitudes"
        items={visibles}
        idDe={(s) => s.id}
        vacio={
          filtro === "pendiente" ? (
            <EstadoVacio icono={<Inbox />} titulo="No hay solicitudes pendientes">
              Cuando alguien se registre y pida sumarse, te llega un mail y aparece acá.
            </EstadoVacio>
          ) : (
            <EstadoVacio icono={<Inbox />} titulo="Sin solicitudes">
              No hay solicitudes en este estado.
            </EstadoVacio>
          )
        }
        columnas={[
          {
            titulo: "Solicitante",
            celda: (s) => (
              <Persona
                nombre={s.solicitante_nombre}
                semilla={s.solicitante_email}
                secundario={`${s.solicitante_email} · #${s.numero} · ${formatoFechaHora(s.created_at)}`}
              />
            ),
          },
          {
            titulo: "Pedido",
            celda: (s) => (
              <div className="grid gap-0.5">
                <div>
                  <Pedido solicitud={s} />
                </div>
                <Seguimiento solicitud={s} />
              </div>
            ),
          },
          { titulo: "Estado", celda: (s) => <InsigniaDeEstado estado={s.estado} /> },
          {
            titulo: "",
            acciones: true,
            celda: (s) => {
              const pendiente = s.estado === "pendiente";
              return (
                <>
                  {pendiente && s.aprobador_email !== yo.email && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tomar.isPending}
                      onClick={() =>
                        tomar.mutate(s.id, {
                          onSuccess: () => toast.success(`Tomaste la solicitud #${s.numero}.`),
                          onError: (error) => toast.error(mensajeDeError(error)),
                        })
                      }
                    >
                      {s.aprobador_id ? "Reasignarme" : "Tomar"}
                    </Button>
                  )}
                  <Button variant={pendiente ? "default" : "outline"} size="sm" onClick={() => setAbierta(s)}>
                    {pendiente ? "Revisar" : "Ver"}
                  </Button>
                </>
              );
            },
          },
        ]}
      />
      {abierta && (
        <DetalleDeSolicitud
          solicitud={abierta}
          organizaciones={organizaciones}
          alCerrar={() => setAbierta(undefined)}
        />
      )}
    </>
  );
}

/** Detalle de una solicitud: si está pendiente, para aceptarla o rechazarla. */
function DetalleDeSolicitud({
  solicitud,
  organizaciones,
  alCerrar,
}: {
  solicitud: Solicitud;
  organizaciones: Organizacion[];
  alCerrar: () => void;
}) {
  const resolver = useResolverSolicitud();
  const pendiente = solicitud.estado === "pendiente";
  const pideEspacioNuevo = Boolean(solicitud.datos?.espacio_nuevo);
  const [comentario, setComentario] = useState("");
  const [destino, setDestino] = useState<"crear" | "existente">("crear");
  const [nombreEspacio, setNombreEspacio] = useState(solicitud.datos?.nombre_espacio ?? "");
  const [organizacionExistente, setOrganizacionExistente] = useState(organizaciones[0]?.id ?? "");

  async function decidir(decision: "aceptar" | "rechazar") {
    const json: Parameters<typeof resolver.mutateAsync>[0]["json"] = {
      decision,
      comentario: comentario.trim() || null,
    };
    if (decision === "aceptar" && pideEspacioNuevo) {
      if (destino === "existente") {
        json.organizacion_id = organizacionExistente;
      } else {
        json.nombre_espacio = nombreEspacio.trim();
        if (!json.nombre_espacio) throw new Error("El nombre del espacio es obligatorio.");
      }
    }
    const r = await resolver.mutateAsync({ id: solicitud.id, json });
    const aviso = r.notificados
      ? "Le avisamos por mail."
      : `No se pudo mandar el mail de aviso${r.aviso_error ? `: ${r.aviso_error}` : ""}.`;
    const mensaje =
      decision === "aceptar"
        ? `${r.solicitante_nombre} ya tiene acceso a ${r.organizacion_nombre}. ${aviso}`
        : `Solicitud #${r.numero} rechazada. ${aviso}`;
    if (r.notificados) toast.success(mensaje);
    else toast.warning(mensaje);
  }

  const detalle = (
    <div className="grid gap-2 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <Avatar nombre={solicitud.solicitante_nombre} semilla={solicitud.solicitante_email} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            {solicitud.solicitante_nombre}
            <InsigniaDeEstado estado={solicitud.estado} />
          </div>
          <div className="truncate text-[13px] text-muted-foreground">{solicitud.solicitante_email}</div>
        </div>
      </div>
      <div className="text-sm">
        <Pedido solicitud={solicitud} />
      </div>
      <p className="text-[13px] text-muted-foreground">Pedida el {formatoFechaHora(solicitud.created_at)}</p>
      <Seguimiento solicitud={solicitud} />
    </div>
  );

  if (!pendiente) {
    return (
      <DialogoDeFormulario
        abierto
        alCerrar={alCerrar}
        titulo={`Solicitud #${solicitud.numero}`}
        textoEnviar="Cerrar"
        textoCancelar={null}
        alEnviar={() => undefined}
      >
        {detalle}
      </DialogoDeFormulario>
    );
  }

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={`Solicitud #${solicitud.numero}`}
      textoEnviar="Aceptar"
      alEnviar={() => decidir("aceptar")}
      accionSecundaria={{ texto: "Rechazar", destructivo: true, alTocar: () => decidir("rechazar") }}
    >
      {detalle}
      {pideEspacioNuevo && (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Al aceptar</legend>
          <OpcionConDetalle
            nombre="destino"
            marcada={destino === "crear"}
            alElegir={() => setDestino("crear")}
            titulo="Crear el espacio"
            detalle="Queda como admin del espacio nuevo."
          />
          {destino === "crear" && (
            <Input
              maxLength={80}
              autoComplete="off"
              aria-label="Nombre del espacio nuevo"
              value={nombreEspacio}
              onChange={(e) => setNombreEspacio(e.target.value)}
            />
          )}
          <OpcionConDetalle
            nombre="destino"
            marcada={destino === "existente"}
            alElegir={() => setDestino("existente")}
            deshabilitada={!organizaciones.length}
            titulo="Asignarlo a un espacio que ya existe"
            detalle="Queda como miembro, sin rol admin."
          />
          {destino === "existente" && (
            <Select
              aria-label="Espacio existente"
              value={organizacionExistente}
              onChange={(e) => setOrganizacionExistente(e.target.value)}
            >
              {organizaciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Select>
          )}
        </fieldset>
      )}
      <Campo etiqueta="Comentario" ayuda="Opcional. Se lo mandamos por mail.">
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            maxLength={1000}
            placeholder="Ej: ¡Bienvenido!"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        )}
      </Campo>
    </DialogoDeFormulario>
  );
}
