import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useConfirmar } from "@/components/dialogos";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campos";
import { Alerta, Skeleton } from "@/components/ui/varios";
import { api, mensajeDeError, pedir } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PantallaDeAcceso } from "./login";
import { cerrarSesion } from "./sesion";

// Quien inició sesión pero todavía no tiene acceso pide sumarse a un espacio
// existente o crear uno nuevo. Un admin del espacio o un superadmin aprueba la
// solicitud desde el panel y le llega un mail con el resultado.

interface SolicitudPropia {
  id: string;
  numero: number;
  estado: "pendiente" | "aceptada" | "rechazada" | "cancelada";
  solicitante_nombre: string;
  organizacion_nombre: string | null;
  comentario_aprobador: string | null;
  aprobador_id: string | null;
  aprobador_nombre: string | null;
  aprobador_email: string | null;
  datos: { espacio_nuevo?: boolean; nombre_espacio?: string } | null;
}

interface EstadoDeRegistro {
  email: string;
  nombre_sugerido: string | null;
  registrado: boolean;
  solicitud: SolicitudPropia | null;
  espacios: { id: string; nombre: string }[];
}

const ESPACIO_NUEVO = "__nuevo__";
const CLAVE = ["registro"];

export function Registro() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const estado = (await pedir(api.registro.$get())) as unknown as EstadoDeRegistro;
      // Lo aceptaron mientras tenía la pantalla abierta: entra directo.
      if (estado.registrado) await queryClient.invalidateQueries({ queryKey: ["yo"] });
      return estado;
    },
  });

  return (
    <PantallaDeAcceso ancha>
      {consulta.isPending ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : consulta.isError ? (
        <>
          <h1 className="text-xl font-bold">Error de conexión</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mensajeDeError(consulta.error)}</p>
          <Button className="mt-4 w-full" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </>
      ) : consulta.data.solicitud?.estado === "pendiente" ? (
        <SolicitudPendiente
          estado={consulta.data}
          solicitud={consulta.data.solicitud}
          actualizando={consulta.isFetching}
          alActualizar={() => void consulta.refetch()}
        />
      ) : (
        <Formulario estado={consulta.data} />
      )}
      <Button
        variant="link"
        size="sm"
        className="mt-4 text-muted-foreground"
        onClick={() => void cerrarSesion()}
      >
        Salir
      </Button>
    </PantallaDeAcceso>
  );
}

function Formulario({ estado }: { estado: EstadoDeRegistro }) {
  const queryClient = useQueryClient();
  const anterior = estado.solicitud;
  const [nombre, setNombre] = useState(anterior?.solicitante_nombre || estado.nombre_sugerido || "");
  const [espacio, setEspacio] = useState<string | null>(null);
  const [espacioNuevo, setEspacioNuevo] = useState("");
  const [error, setError] = useState("");

  const crear = useMutation({
    mutationFn: (json: { nombre: string; organizacion_id?: string; nombre_espacio?: string }) =>
      pedir(api.registro.solicitudes.$post({ json })),
    onSuccess: () => {
      toast.success("Solicitud enviada.");
      return queryClient.invalidateQueries({ queryKey: CLAVE });
    },
    onError: (e) => setError(mensajeDeError(e)),
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    const limpio = nombre.trim();
    if (!limpio) return setError("Ingresá tu nombre.");
    if (!espacio) return setError("Elegí un espacio.");
    if (espacio !== ESPACIO_NUEVO) return crear.mutate({ nombre: limpio, organizacion_id: espacio });
    if (!espacioNuevo.trim()) return setError("Escribí el nombre del espacio nuevo.");
    crear.mutate({ nombre: limpio, nombre_espacio: espacioNuevo.trim() });
  }

  const opcion = (valor: string, titulo: string, ayuda?: string) => (
    <label
      key={valor}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors hover:bg-muted",
        espacio === valor && "border-primary bg-brand-50 ring-1 ring-primary",
        valor === ESPACIO_NUEVO && "border-dashed",
      )}
    >
      <input
        type="radio"
        name="espacio"
        className="size-4 accent-primary"
        checked={espacio === valor}
        onChange={() => setEspacio(valor)}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold">
          {valor === ESPACIO_NUEVO && <Plus className="size-4" aria-hidden />}
          {titulo}
        </span>
        {ayuda && <span className="block text-[13px] text-muted-foreground">{ayuda}</span>}
      </span>
    </label>
  );

  return (
    <>
      <h1 className="text-xl font-bold">Completá tu registro</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Entraste como <strong className="text-foreground">{estado.email}</strong>. Elegí a qué espacio querés
        sumarte: un administrador tiene que aprobar tu solicitud.
      </p>
      {anterior?.estado === "rechazada" && (
        <Alerta tono="error" className="mt-4">
          Tu solicitud anterior (#{anterior.numero}) fue rechazada.
          {anterior.comentario_aprobador && (
            <>
              {" "}
              Motivo: <em>{anterior.comentario_aprobador}</em>
            </>
          )}{" "}
          Podés mandar una nueva.
        </Alerta>
      )}
      <form onSubmit={enviar} noValidate className="mt-5 grid gap-4">
        <Campo etiqueta="Tu nombre">
          {(props) => (
            <Input
              {...props}
              maxLength={120}
              autoComplete="name"
              placeholder="Nombre y apellido"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Espacios</legend>
          {estado.espacios.map((e) => opcion(e.id, e.nombre))}
          {opcion(ESPACIO_NUEVO, "Nuevo", "Pedir que se cree un espacio nuevo")}
          {espacio === ESPACIO_NUEVO && (
            <Input
              autoFocus
              maxLength={80}
              autoComplete="off"
              placeholder="Nombre del espacio"
              aria-label="Nombre del espacio nuevo"
              value={espacioNuevo}
              onChange={(e) => setEspacioNuevo(e.target.value)}
            />
          )}
        </fieldset>
        <p role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
        <Button type="submit" size="lg" disabled={!espacio} cargando={crear.isPending}>
          {espacio === ESPACIO_NUEVO ? "Crear nuevo espacio" : "Aceptar"}
        </Button>
      </form>
    </>
  );
}

function SolicitudPendiente({
  estado,
  solicitud,
  actualizando,
  alActualizar,
}: {
  estado: EstadoDeRegistro;
  solicitud: SolicitudPropia;
  actualizando: boolean;
  alActualizar: () => void;
}) {
  const queryClient = useQueryClient();
  const confirmar = useConfirmar();
  const tomada = Boolean(solicitud.aprobador_id);

  const cancelar = useMutation({
    mutationFn: () => pedir(api.registro.solicitudes[":id"].cancelar.$post({ param: { id: solicitud.id } })),
    onSuccess: () => toast.success("Solicitud cancelada."),
    onError: (e) => toast.error(mensajeDeError(e)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  });

  return (
    <div className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Clock className="size-7" aria-hidden />
      </div>
      <h1 className="mt-3 text-xl font-bold">Solicitud #{solicitud.numero} enviada</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pediste{" "}
        {solicitud.datos?.espacio_nuevo ? (
          <>
            crear el espacio <strong className="text-foreground">{solicitud.datos.nombre_espacio}</strong>
          </>
        ) : (
          <>
            sumarte a <strong className="text-foreground">{solicitud.organizacion_nombre}</strong>
          </>
        )}
        . Te avisamos a <strong className="text-foreground">{estado.email}</strong> cuando la revisen.
      </p>
      {tomada && (
        <Alerta tono="info" className="mt-4 text-left">
          La está revisando {solicitud.aprobador_nombre || solicitud.aprobador_email || "un administrador"}.
        </Alerta>
      )}
      <div className="mt-5 grid gap-2">
        <Button variant="outline" cargando={actualizando} onClick={alActualizar}>
          Actualizar
        </Button>
        {!tomada && (
          <Button
            variant="destructive-ghost"
            cargando={cancelar.isPending}
            onClick={async () => {
              const ok = await confirmar({
                titulo: "¿Cancelar la solicitud?",
                descripcion: "Después podés mandar otra.",
                textoConfirmar: "Cancelar solicitud",
                textoCancelar: "Volver",
                destructivo: true,
              });
              if (ok) cancelar.mutate();
            }}
          >
            Cancelar solicitud
          </Button>
        )}
      </div>
    </div>
  );
}
