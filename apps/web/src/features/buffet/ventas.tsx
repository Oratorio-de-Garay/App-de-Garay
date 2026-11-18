import { eventoCrearSchema } from "@garay/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Consulta } from "@/components/consulta";
import { alEnviarFormulario, DialogoDeFormulario, useConfirmar } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { useEsAdminDeLaOrganizacion } from "@/features/auth/sesion";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Badge, Card, EstadoVacio, Seccion } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";
import { capitalizar, formatoFechaCorta, formatoPesos, normalizarBusqueda, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  agregar,
  cambiarLinea,
  cambiarProducto,
  claveDe,
  type ItemDeCarrito,
  opcionesDeLinea,
  opcionesParaAgregar,
  problemaDelCarrito,
  quitar,
  total,
  totalDeLinea,
  vendibles,
  vuelto,
} from "./carrito";
import {
  type Evento,
  useBorrarEvento,
  useBorrarVenta,
  useCombos,
  useEventos,
  useGuardarEvento,
  useGuardarVenta,
  useProductos,
  useVentas,
  type Venta,
} from "./consultas";

// Pestaña "Ventas": el listado de eventos y, al entrar a uno, sus ventas.
// Un evento ("Feria del plato 29/08") agrupa los cobros de una jornada.

type Edicion<T> = T | null | undefined;

interface Props {
  /** Evento abierto (sale de la URL), o undefined para ver el listado. */
  eventoId?: string;
  alAbrir: (eventoId: string | undefined) => void;
}

export function Ventas({ eventoId, alAbrir }: Props) {
  const eventos = useEventos();
  return (
    <Consulta consulta={eventos}>
      {(lista) => {
        const abierto = eventoId ? lista.find((evento) => evento.id === eventoId) : undefined;
        return abierto ? (
          <DetalleDeEvento evento={abierto} alVolver={() => alAbrir(undefined)} />
        ) : (
          <ListaDeEventos eventos={lista} alAbrir={alAbrir} />
        );
      }}
    </Consulta>
  );
}

function useEliminar(borrar: (id: string) => Promise<unknown>, titulo: string, descripcion?: string) {
  const confirmar = useConfirmar();
  return async (id: string) => {
    if (!(await confirmar({ titulo, descripcion, textoConfirmar: "Eliminar", destructivo: true }))) return;
    try {
      await borrar(id);
      toast.success("Eliminado.");
    } catch (error) {
      toast.error(mensajeDeError(error));
    }
  };
}

// ── Eventos ───────────────────────────────────────────────

function ListaDeEventos({ eventos, alAbrir }: { eventos: Evento[]; alAbrir: (id: string) => void }) {
  const [filtro, setFiltro] = useState("");
  const [creando, setCreando] = useState(false);
  const borrar = useBorrarEvento();
  const eliminar = useEliminar(borrar.mutateAsync, "¿Eliminar este evento?");
  const esAdmin = useEsAdminDeLaOrganizacion();
  const visibles = useMemo(() => {
    const buscado = normalizarBusqueda(filtro);
    return buscado
      ? eventos.filter((evento) => normalizarBusqueda(evento.nombre).includes(buscado))
      : eventos;
  }, [eventos, filtro]);

  return (
    <>
      <Seccion
        titulo="Ventas"
        descripcion="Creá un evento y cargale las ventas de a una, a medida que se cobran."
        acciones={
          <Button onClick={() => setCreando(true)}>
            <Plus aria-hidden />
            Nuevo evento
          </Button>
        }
      />
      {eventos.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar evento…"
            aria-label="Buscar evento"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
      )}
      <Listado
        clave="buffet-eventos"
        titulo="Eventos"
        items={visibles}
        idDe={(evento) => evento.id}
        alTocarFila={(evento) => alAbrir(evento.id)}
        vacio={
          <EstadoVacio
            icono={<CalendarDays />}
            titulo={filtro ? "Ningún evento coincide con la búsqueda." : "Todavía no creaste ningún evento."}
          />
        }
        columnas={[
          {
            titulo: "Evento",
            celda: (evento) => (
              <div>
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {evento.nombre}
                  {evento.estado === "cerrado" && <Badge>Cerrado</Badge>}
                </div>
                <div className="text-[13px] text-muted-foreground">{formatoFechaCorta(evento.fecha)}</div>
              </div>
            ),
          },
          { titulo: "Ventas", numerica: true, celda: (evento) => evento.sales_count },
          { titulo: "Recaudado", numerica: true, celda: (evento) => formatoPesos(evento.total_amount) },
          {
            titulo: "",
            acciones: true,
            celda: (evento) => (
              <>
                <Button variant="outline" size="sm" onClick={() => alAbrir(evento.id)}>
                  Abrir
                </Button>
                {esAdmin && (
                  <Button
                    variant="destructive-ghost"
                    size="sm"
                    disabled={evento.estado === "cerrado"}
                    title={evento.estado === "cerrado" ? "Un evento cerrado no se puede eliminar" : undefined}
                    onClick={() => void eliminar(evento.id)}
                  >
                    <Trash2 aria-hidden />
                    Eliminar
                  </Button>
                )}
              </>
            ),
          },
        ]}
      />
      {creando && <FormularioDeEvento evento={null} alCerrar={() => setCreando(false)} alCrear={alAbrir} />}
    </>
  );
}

function FormularioDeEvento({
  evento,
  alCerrar,
  alCrear,
}: {
  evento: Evento | null;
  alCerrar: () => void;
  alCrear?: (id: string) => void;
}) {
  const guardar = useGuardarEvento();
  const esAdmin = useEsAdminDeLaOrganizacion();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof eventoCrearSchema>, unknown, z.output<typeof eventoCrearSchema>>({
    resolver: zodResolver(eventoCrearSchema),
    defaultValues: {
      nombre: evento?.nombre ?? "",
      fecha: evento?.fecha ?? new Date().toISOString().slice(0, 10),
      estado: evento?.estado ?? "abierto",
      observacion: evento?.observacion ?? "",
    },
  });

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={evento ? "Editar evento" : "Nuevo evento"}
      textoEnviar={evento ? "Guardar" : "Crear evento"}
      alEnviar={alEnviarFormulario(handleSubmit, async (json) => {
        const guardado = await guardar.mutateAsync({ id: evento?.id, json });
        // Se entra directo al evento recién creado para cargar la primera venta.
        if (!evento) alCrear?.(guardado.id);
      })}
    >
      <Campo etiqueta="Nombre" requerido error={errors.nombre?.message}>
        {(props) => <Input {...props} autoFocus placeholder="Ej: Feria del Plato" {...register("nombre")} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha" error={errors.fecha?.message}>
          {(props) => <Input {...props} type="date" {...register("fecha")} />}
        </Campo>
        {/* Cerrar o reabrir un evento es de admins. Para el resto el campo no se
            muestra y el estado viaja sin cambios desde los valores iniciales. */}
        {esAdmin && (
          <Campo etiqueta="Estado">
            {(props) => (
              <Select {...props} {...register("estado")}>
                <option value="abierto">Abierto</option>
                <option value="cerrado">Cerrado</option>
              </Select>
            )}
          </Campo>
        )}
      </div>
      <Campo etiqueta="Observación">{(props) => <Input {...props} {...register("observacion")} />}</Campo>
    </DialogoDeFormulario>
  );
}

// ── Ventas de un evento ───────────────────────────────────

function DetalleDeEvento({ evento, alVolver }: { evento: Evento; alVolver: () => void }) {
  const ventas = useVentas(evento.id);
  const borrar = useBorrarVenta();
  const eliminar = useEliminar(
    borrar.mutateAsync,
    "¿Eliminar esta venta?",
    "Se devolverá el stock descontado.",
  );
  const [editandoEvento, setEditandoEvento] = useState(false);
  const [venta, setVenta] = useState<Edicion<Venta>>();

  return (
    <>
      <Card className="mb-5 flex flex-wrap items-center gap-4 p-4">
        <Button variant="outline" size="sm" onClick={alVolver}>
          <ArrowLeft aria-hidden />
          Volver
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{evento.nombre}</h2>
          <p className="text-sm text-muted-foreground">
            {formatoFechaCorta(evento.fecha)} · {plural(evento.sales_count, "venta", "ventas")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Recaudado</div>
          <div className="text-xl font-bold tabular-nums text-primary">
            {formatoPesos(evento.total_amount)}
          </div>
        </div>
      </Card>

      <Seccion
        titulo="Ventas del evento"
        descripcion="Cada venta es un cobro: cargá los ítems, aceptá y seguí con la siguiente."
        acciones={
          <>
            <Button variant="outline" onClick={() => setEditandoEvento(true)}>
              <Pencil aria-hidden />
              Editar evento
            </Button>
            <Button onClick={() => setVenta(null)}>
              <Plus aria-hidden />
              Nueva venta
            </Button>
          </>
        }
      />

      <Consulta consulta={ventas}>
        {({ sales }) => (
          <Listado
            clave="buffet-ventas"
            titulo="Ventas del evento"
            items={sales}
            idDe={(s) => s.id}
            vacio={<EstadoVacio icono={<Receipt />} titulo="Todavía no hay ventas en este evento." />}
            columnas={[
              {
                titulo: "Venta",
                // El número sale de la posición en toda la lista, no en la página.
                celda: (s, indice) => (
                  <div>
                    <div className="font-semibold">Venta {sales.length - indice}</div>
                    <div className="text-[13px] text-muted-foreground">
                      {capitalizar(s.payment_method || "")}
                    </div>
                  </div>
                ),
              },
              { titulo: "Ítems", numerica: true, celda: (s) => s.items_count },
              {
                titulo: "Detalle",
                celda: (s) => (
                  <span className="text-[13px] text-muted-foreground">
                    {s.items.map((i) => `${Number(i.quantity)}× ${i.description}`).join(", ") || "—"}
                  </span>
                ),
              },
              {
                titulo: "Total",
                numerica: true,
                celda: (s) => <strong>{formatoPesos(s.total_amount)}</strong>,
              },
              {
                titulo: "",
                acciones: true,
                celda: (s) => (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setVenta(s)}>
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    <Button variant="destructive-ghost" size="sm" onClick={() => void eliminar(s.id)}>
                      <Trash2 aria-hidden />
                      Eliminar
                    </Button>
                  </>
                ),
              },
            ]}
          />
        )}
      </Consulta>

      {editandoEvento && <FormularioDeEvento evento={evento} alCerrar={() => setEditandoEvento(false)} />}
      {venta !== undefined && (
        <FormularioDeVenta evento={evento} venta={venta} alCerrar={() => setVenta(undefined)} />
      )}
    </>
  );
}

const MEDIOS_DE_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const;

function FormularioDeVenta({
  evento,
  venta,
  alCerrar,
}: {
  evento: Evento;
  venta: Venta | null;
  alCerrar: () => void;
}) {
  const productos = useProductos();
  const combos = useCombos();
  const guardar = useGuardarVenta();
  // En edición se parte de una copia de los ítems ya cargados.
  const [carrito, setCarrito] = useState<ItemDeCarrito[]>(() =>
    (venta?.items ?? []).map((item) => ({
      product_id: item.product_id,
      combo_id: item.combo_id,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
  );
  const [medio, setMedio] = useState(venta?.payment_method || "efectivo");
  const [pagoCon, setPagoCon] = useState("");
  const [observacion, setObservacion] = useState(venta?.observation ?? "");

  const todos = useMemo(
    () => vendibles(productos.data ?? [], combos.data ?? []),
    [productos.data, combos.data],
  );
  const totalVenta = total(carrito);
  const cambio = medio === "efectivo" ? vuelto(totalVenta, Number(pagoCon)) : null;
  const porClave = (clave: string) => todos.find((v) => v.clave === clave);

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      ancho="lg"
      titulo={venta ? "Editar venta" : "Nueva venta"}
      descripcion={
        <>
          Evento: <strong className="text-foreground">{evento.nombre}</strong> ·{" "}
          {formatoFechaCorta(evento.fecha)}
        </>
      }
      textoEnviar={venta ? "Guardar cambios" : "Registrar venta"}
      alEnviar={async () => {
        const problema = problemaDelCarrito(carrito);
        if (problema) throw new Error(problema);
        await guardar.mutateAsync({
          id: venta?.id,
          eventoId: evento.id,
          payment_method: medio,
          observation: observacion.trim() || null,
          items: carrito,
        });
        toast.success(venta ? "Venta actualizada." : `Venta registrada: ${formatoPesos(totalVenta)}.`);
      }}
    >
      <Campo etiqueta="Agregar ítem">
        {(props) => (
          <Select
            {...props}
            value=""
            // Elegir una opción la agrega directo (cantidad 1, precio de
            // lista); después se ajusta en su propia línea.
            onChange={(e) => {
              const elegido = porClave(e.target.value);
              if (elegido) setCarrito((actual) => agregar(actual, elegido));
            }}
          >
            <option value="">Elegí un producto o combo</option>
            {opcionesParaAgregar(todos, carrito).map((v) => (
              <option key={v.clave} value={v.clave}>
                {v.nombre}
              </option>
            ))}
          </Select>
        )}
      </Campo>

      {carrito.length === 0 ? (
        <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
          Todavía no agregaste ítems.
        </p>
      ) : (
        <ul className="grid gap-2">
          {carrito.map((item, indice) => (
            <li
              key={claveDe(item)}
              className="grid gap-2 rounded-xl border bg-muted/40 p-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end"
            >
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground sm:sr-only">Producto</span>
                <Select
                  aria-label={`Producto de la línea ${indice + 1}`}
                  value={claveDe(item)}
                  // Cambiar el producto trae el precio de lista del nuevo.
                  onChange={(e) => {
                    const elegido = porClave(e.target.value);
                    if (elegido) setCarrito((actual) => cambiarProducto(actual, indice, elegido));
                  }}
                >
                  {opcionesDeLinea(todos, item)
                    // Lo que ya está en otra línea no se ofrece: se duplicaría.
                    .filter(
                      (v) => v.clave === claveDe(item) || !carrito.some((otro) => claveDe(otro) === v.clave),
                    )
                    .map((v) => (
                      <option key={v.clave} value={v.clave}>
                        {v.nombre}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Cantidad
                  <Stepper
                    etiqueta="cantidad"
                    minimo={1}
                    valor={item.quantity}
                    alCambiar={(quantity) =>
                      setCarrito((actual) => cambiarLinea(actual, indice, { quantity }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Precio
                  <Stepper
                    etiqueta="precio"
                    paso={50}
                    valor={item.unit_price}
                    alCambiar={(unit_price) =>
                      setCarrito((actual) => cambiarLinea(actual, indice, { unit_price }))
                    }
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <strong className="min-w-20 text-right tabular-nums">
                  {formatoPesos(totalDeLinea(item))}
                </strong>
                <Button
                  variant="destructive-ghost"
                  size="icon"
                  aria-label={`Quitar ${item.description}`}
                  onClick={() => setCarrito((actual) => quitar(actual, indice))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="font-semibold">Total</span>
        <strong className="text-2xl tabular-nums text-primary" aria-live="polite">
          {formatoPesos(totalVenta)}
        </strong>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Método de pago">
          {(props) => (
            <Select
              {...props}
              value={medio}
              onChange={(e) => {
                setMedio(e.target.value);
                setPagoCon("");
              }}
            >
              {MEDIOS_DE_PAGO.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {capitalizar(opcion)}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        {/* El vuelto sólo tiene sentido cobrando en efectivo. */}
        {medio === "efectivo" && (
          <>
            <Campo etiqueta="Pagó con">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  step="50"
                  min="0"
                  placeholder="$"
                  value={pagoCon}
                  onChange={(e) => setPagoCon(e.target.value)}
                />
              )}
            </Campo>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Vuelto</span>
              <div
                className={cn(
                  "flex h-11 items-center rounded-lg bg-muted px-3 font-semibold tabular-nums md:h-10",
                  cambio?.falta && "bg-danger-soft text-danger",
                )}
              >
                {!cambio
                  ? "—"
                  : cambio.falta
                    ? `Faltan ${formatoPesos(cambio.monto)}`
                    : formatoPesos(cambio.monto)}
              </div>
            </div>
          </>
        )}
      </div>

      <Campo etiqueta="Observación">
        {(props) => <Input {...props} value={observacion} onChange={(e) => setObservacion(e.target.value)} />}
      </Campo>
    </DialogoDeFormulario>
  );
}
