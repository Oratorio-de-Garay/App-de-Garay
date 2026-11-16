import { BellOff, Plus, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Consulta } from "@/components/consulta";
import { DialogoDeFormulario } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Campo, Checkbox, Input, Select, Textarea } from "@/components/ui/campos";
import { Badge, EstadoVacio, Persona, Seccion, type TonoBadge } from "@/components/ui/varios";
import { formatoFechaHora, plural, valorFechaHoraLocal } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ChipDeOrganizacion, ListaDeChips, OpcionConDetalle } from "./comunes";
import {
  type Notificacion,
  type Organizacion,
  type Usuario,
  useCancelarNotificacion,
  useDispositivos,
  useEnviarNotificacion,
  useNotificaciones,
} from "./consultas";
import {
  descripcionDeDispositivo,
  ESTADOS_DE_NOTIFICACION,
  resultadoDeNotificacion,
  resumenDeEnvio,
} from "./textos";

const TONOS: Record<string, TonoBadge> = {
  enviada: "exito",
  parcial: "aviso",
  programada: "info",
  enviando: "info",
  pendiente: "aviso",
  fallida: "peligro",
  sin_dispositivos: "neutro",
  cancelada: "neutro",
};

const LARGO_DEL_TEXTO = 240;

export function Notificaciones({
  usuarios,
  organizaciones,
}: {
  usuarios: Usuario[];
  organizaciones: Organizacion[];
}) {
  const [vista, setVista] = useState<"envios" | "dispositivos">("envios");
  const [creando, setCreando] = useState(false);

  return (
    <>
      <Seccion
        titulo="Notificaciones"
        descripcion="Mandá un aviso push a los dispositivos de uno o varios usuarios, ahora o programado."
        acciones={
          <Button
            onClick={() =>
              organizaciones.length ? setCreando(true) : toast.error("No administrás ninguna organización.")
            }
          >
            <Plus aria-hidden />
            Nueva notificación
          </Button>
        }
      />
      <div className="mb-4 inline-flex rounded-lg bg-muted p-1" role="tablist" aria-label="Notificaciones">
        {(["envios", "dispositivos"] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            role="tab"
            aria-selected={vista === opcion}
            onClick={() => setVista(opcion)}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-semibold text-muted-foreground transition-colors",
              vista === opcion && "bg-card text-foreground shadow-sm",
            )}
          >
            {opcion === "envios" ? "Envíos" : "Dispositivos"}
          </button>
        ))}
      </div>
      {vista === "envios" ? <Envios /> : <Dispositivos organizaciones={organizaciones} />}
      {creando && (
        <FormularioDeNotificacion
          usuarios={usuarios}
          organizaciones={organizaciones}
          alCerrar={() => setCreando(false)}
        />
      )}
    </>
  );
}

function Envios() {
  const notificaciones = useNotificaciones();
  const [aCancelar, setACancelar] = useState<Notificacion>();
  const cancelar = useCancelarNotificacion();

  return (
    <>
      <Consulta consulta={notificaciones}>
        {(items) => (
          <Listado
            clave="admin-envios"
            titulo="Notificaciones enviadas"
            items={items}
            idDe={(n) => n.id}
            vacio={
              <EstadoVacio icono={<BellOff />} titulo="Todavía no enviaste notificaciones">
                Las que mandes aparecen acá con su resultado.
              </EstadoVacio>
            }
            columnas={[
              {
                titulo: "Destinatario",
                celda: (n) => (
                  <Persona
                    nombre={n.destinatario_nombre || n.destinatario_email}
                    secundario={n.destinatario_nombre ? n.destinatario_email : undefined}
                    semilla={n.destinatario_email}
                  />
                ),
              },
              {
                titulo: "Notificación",
                celda: (n) => (
                  <div className="grid gap-1 text-left">
                    <strong>{n.titulo}</strong>
                    <span className="text-sm text-pretty">{n.texto}</span>
                    <span>
                      <ChipDeOrganizacion nombre={n.organizacion_nombre} />
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      Creada el {formatoFechaHora(n.created_at)} · por {n.remitente_email}
                    </span>
                  </div>
                ),
              },
              {
                titulo: "Estado",
                celda: (n) => (
                  <Badge tono={TONOS[n.estado]}>{ESTADOS_DE_NOTIFICACION[n.estado] || n.estado}</Badge>
                ),
              },
              { titulo: "Resultado", celda: resultadoDeNotificacion },
              {
                titulo: "",
                acciones: true,
                celda: (n) =>
                  n.estado === "programada" && (
                    <Button variant="outline" size="sm" onClick={() => setACancelar(n)}>
                      Cancelar
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Consulta>
      {aCancelar && (
        <DialogoDeFormulario
          abierto
          alCerrar={() => setACancelar(undefined)}
          ancho="sm"
          titulo="Cancelar notificación"
          descripcion={`“${aCancelar.titulo}” para ${aCancelar.destinatario_nombre || aCancelar.destinatario_email} no se va a enviar.`}
          textoEnviar="Cancelar notificación"
          textoCancelar="Volver"
          destructivo
          alEnviar={async () => {
            await cancelar.mutateAsync(aCancelar.id);
            toast.success("Notificación cancelada.");
          }}
        />
      )}
    </>
  );
}

function Dispositivos({ organizaciones }: { organizaciones: Organizacion[] }) {
  const [organizacion, setOrganizacion] = useState("");
  const dispositivos = useDispositivos(organizacion);

  return (
    <Consulta consulta={dispositivos}>
      {(usuarios) => {
        const conPush = usuarios.filter((u) => u.dispositivos.some((d) => !d.desactivado_at)).length;
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {usuarios.length > 0 &&
                  `${conPush} de ${usuarios.length} ${usuarios.length === 1 ? "usuario tiene" : "usuarios tienen"} notificaciones activadas.`}
              </p>
              {organizaciones.length > 1 && (
                <Select
                  className="w-full sm:w-64"
                  aria-label="Organización"
                  value={organizacion}
                  onChange={(e) => setOrganizacion(e.target.value)}
                >
                  <option value="">Todas las organizaciones</option>
                  {organizaciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <Listado
              clave="admin-dispositivos"
              titulo="Dispositivos por usuario"
              items={usuarios}
              idDe={(u) => u.email}
              vacio={
                <EstadoVacio icono={<Smartphone />} titulo="No hay usuarios">
                  Los usuarios de la organización aparecen acá con sus dispositivos.
                </EstadoVacio>
              }
              columnas={[
                {
                  titulo: "Usuario",
                  celda: (u) => (
                    <Persona
                      nombre={u.nombre || u.email}
                      secundario={u.nombre ? u.email : undefined}
                      semilla={u.email}
                    />
                  ),
                },
                {
                  titulo: "Estado",
                  celda: (u) => {
                    const activos = u.dispositivos.filter((d) => !d.desactivado_at).length;
                    if (activos)
                      return <Badge tono="exito">{plural(activos, "dispositivo", "dispositivos")}</Badge>;
                    return u.dispositivos.length ? (
                      <Badge>Notificaciones desactivadas</Badge>
                    ) : (
                      <Badge>Sin notificaciones activadas</Badge>
                    );
                  },
                },
                {
                  titulo: "Organizaciones",
                  celda: (u) => <ListaDeChips organizaciones={u.organizaciones} />,
                },
                {
                  titulo: "Dispositivos",
                  celda: (u) =>
                    u.dispositivos.length ? (
                      <ul className="grid gap-1.5 text-left">
                        {u.dispositivos.map((d, i) => (
                          <li key={i} className={cn(d.desactivado_at && "opacity-60")}>
                            <strong className="block">{descripcionDeDispositivo(d.user_agent)}</strong>
                            <span className="text-[13px] text-muted-foreground">
                              {d.servicio && `${d.servicio} · `}Activado el {formatoFechaHora(d.created_at)}
                              {d.ultimo_uso_at && ` · Último uso ${formatoFechaHora(d.ultimo_uso_at)}`}
                              {d.desactivado_at && ` · Desactivado el ${formatoFechaHora(d.desactivado_at)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </>
        );
      }}
    </Consulta>
  );
}

function FormularioDeNotificacion({
  usuarios,
  organizaciones,
  alCerrar,
}: {
  usuarios: Usuario[];
  organizaciones: Organizacion[];
  alCerrar: () => void;
}) {
  const enviar = useEnviarNotificacion();
  const dispositivos = useDispositivos("");
  const [organizacion, setOrganizacion] = useState(organizaciones[0]?.id ?? "");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [programar, setProgramar] = useState(false);
  const [fecha, setFecha] = useState("");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");

  // Primero quienes tienen algún dispositivo activado, después el resto; dentro
  // de cada grupo, por nombre.
  const destinatarios = useMemo(() => {
    const conDispositivo = new Set(
      (dispositivos.data ?? [])
        .filter((u) => u.dispositivos.some((d) => !d.desactivado_at))
        .map((u) => u.email),
    );
    return usuarios
      .filter((u) => u.organizaciones.some((o) => o.id === organizacion))
      .sort(
        (a, b) =>
          Number(conDispositivo.has(b.email)) - Number(conDispositivo.has(a.email)) ||
          (a.nombre || a.email).localeCompare(b.nombre || b.email, "es", { sensitivity: "base" }),
      );
  }, [usuarios, organizacion, dispositivos.data]);

  const todos = destinatarios.length > 0 && elegidos.length === destinatarios.length;
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo="Nueva notificación"
      descripcion="Se envía a todos los dispositivos de cada usuario que activaron las notificaciones."
      textoEnviar={programar ? "Programar" : "Enviar"}
      alEnviar={async () => {
        if (!elegidos.length) throw new Error("Elegí al menos un usuario.");
        if (!titulo.trim()) throw new Error("El título es obligatorio.");
        if (!texto.trim()) throw new Error("El texto es obligatorio.");
        let programadaPara: string | null = null;
        if (programar) {
          if (!fecha) throw new Error("Elegí la fecha y la hora de envío.");
          const cuando = new Date(fecha); // datetime-local se interpreta en la hora local
          if (Number.isNaN(cuando.getTime()) || cuando.getTime() <= Date.now()) {
            throw new Error("La fecha y la hora tienen que ser posteriores a ahora.");
          }
          programadaPara = cuando.toISOString();
        }
        const resultado = await enviar.mutateAsync({
          organizacion_id: organizacion,
          destinatarios_email: elegidos,
          titulo: titulo.trim(),
          texto: texto.trim(),
          programada_para: programadaPara,
        });
        const { mensaje, conProblemas } = resumenDeEnvio(resultado, programadaPara);
        if (conProblemas) toast.warning(mensaje);
        else toast.success(mensaje);
      }}
    >
      <Campo etiqueta="Organización" requerido>
        {(props) => (
          <Select
            {...props}
            value={organizacion}
            onChange={(e) => {
              setOrganizacion(e.target.value);
              setElegidos([]);
            }}
          >
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
        )}
      </Campo>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Usuarios<span className="text-destructive"> *</span>
        </legend>
        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <Checkbox
            checked={todos}
            onChange={(e) => setElegidos(e.target.checked ? destinatarios.map((u) => u.email) : [])}
          />
          Seleccionar todos
        </label>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border p-2">
          {destinatarios.length === 0 && (
            <p className="p-2 text-[13px] text-muted-foreground">Esta organización no tiene usuarios.</p>
          )}
          {destinatarios.map((u) => (
            <label
              key={u.email}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={elegidos.includes(u.email)}
                onChange={(e) =>
                  setElegidos((actual) =>
                    e.target.checked ? [...actual, u.email] : actual.filter((email) => email !== u.email),
                  )
                }
              />
              <span className="min-w-0">
                <span className="block truncate">{u.nombre || u.email}</span>
                {u.nombre && (
                  <span className="block truncate text-[13px] text-muted-foreground">{u.email}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {plural(elegidos.length, "seleccionado", "seleccionados")}
        </p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Cuándo<span className="text-destructive"> *</span>
        </legend>
        <OpcionConDetalle
          nombre="cuando"
          marcada={!programar}
          alElegir={() => setProgramar(false)}
          titulo="Inmediata"
          detalle="Se envía en el momento."
        />
        <OpcionConDetalle
          nombre="cuando"
          marcada={programar}
          alElegir={() => setProgramar(true)}
          titulo="Programar"
          detalle="Se envía en la fecha y hora que elijas."
        />
        {programar && (
          <div className="grid gap-1.5">
            <Input
              type="datetime-local"
              autoFocus
              aria-label="Fecha y hora de envío"
              min={valorFechaHoraLocal(new Date(Date.now() + 60_000))}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <p className="text-[13px] text-muted-foreground">
              Hora de {zona}. Tiene que ser posterior a ahora; sale con hasta 1 minuto de demora.
            </p>
          </div>
        )}
      </fieldset>

      <Campo etiqueta="Título" requerido>
        {(props) => (
          <Input
            {...props}
            maxLength={65}
            autoComplete="off"
            placeholder="Ej: Cambio de horario"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        )}
      </Campo>
      <Campo etiqueta="Texto" requerido ayuda={`${texto.length} / ${LARGO_DEL_TEXTO}`}>
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            maxLength={LARGO_DEL_TEXTO}
            placeholder="Lo que va a ver la persona en su dispositivo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        )}
      </Campo>
    </DialogoDeFormulario>
  );
}
