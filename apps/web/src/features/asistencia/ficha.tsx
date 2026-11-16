import { hoyLocal, type PibeConResumen } from "@garay/shared";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardList,
  History,
  MessageSquare,
  Pencil,
  Phone,
  Undo2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DialogoDeFormulario, useConfirmar } from "@/components/dialogos";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Alerta, Avatar, Badge, Card, EsqueletoDeLista } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";
import { formatoUltimaAsistencia } from "@/lib/formato";
import { useDesmarcarPresente, useEditarPibe, useMarcarPresente, usePibe, usePresente } from "./consultas";

/** Ficha de un pibe: sus datos y el presente de un día (por defecto, hoy). */
export function Ficha({ id, alVolver }: { id: string; alVolver: () => void }) {
  const pibe = usePibe(id);

  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={alVolver}>
          <ArrowLeft aria-hidden />
          Volver
        </Button>
      </div>
      {pibe.isPending ? (
        <EsqueletoDeLista filas={2} />
      ) : pibe.isError ? (
        <Alerta
          tono="error"
          accion={
            <Button variant="outline" size="sm" onClick={() => void pibe.refetch()}>
              Reintentar
            </Button>
          }
        >
          No se pudieron cargar los datos del chico.
        </Alerta>
      ) : (
        <Tarjeta pibe={pibe.data} />
      )}
    </div>
  );
}

function Fila({ icono, etiqueta, children }: { icono: ReactNode; etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icono}
        {etiqueta}
      </dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function Tarjeta({ pibe }: { pibe: PibeConResumen }) {
  const [fecha, setFecha] = useState(hoyLocal);
  const [editando, setEditando] = useState(false);
  const confirmar = useConfirmar();
  const presente = usePresente(pibe.id, fecha);
  const marcar = useMarcarPresente();
  const desmarcar = useDesmarcarPresente();
  const esHoy = fecha === hoyLocal();
  const marcado = presente.data === true;
  const enCurso = marcar.isPending || desmarcar.isPending;

  async function alternar() {
    if (!fecha) return void toast.warning("Seleccioná una fecha válida antes de marcar el presente.");
    const cual = { pibeId: pibe.id, fecha };
    try {
      if (marcado) {
        const ok = await confirmar({
          titulo: `¿Desmarcar el presente de ${pibe.nombreCompleto}?`,
          textoConfirmar: "Desmarcar",
          destructivo: true,
        });
        if (!ok) return;
        await desmarcar.mutateAsync(cual);
        toast.info("Presente desmarcado.");
      } else {
        await marcar.mutateAsync(cual);
        toast.success(esHoy ? "Presente marcado para hoy. ¡Listo!" : "Presente marcado.");
      }
    } catch (error) {
      toast.error(`No se pudo ${marcado ? "desmarcar" : "marcar"} el presente (${mensajeDeError(error)}).`);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 bg-gradient-to-br from-brand-800 to-brand-700 px-5 py-5 text-white">
        <Avatar nombre={pibe.nombreCompleto} tamano="lg" className="ring-2 ring-white/25" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl leading-tight font-bold text-balance">{pibe.nombreCompleto}</h2>
          <p className="text-sm text-brand-200">
            {[pibe.grado || "Sin grado", pibe.edad].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/15"
          aria-label="Editar datos"
          onClick={() => setEditando(true)}
        >
          <Pencil aria-hidden />
        </Button>
      </div>

      <dl className="divide-y px-5">
        <Fila icono={<ClipboardList aria-hidden />} etiqueta="Ficha">
          <Badge tono={pibe.ficha ? "exito" : "peligro"}>{pibe.ficha ? "Presentó ✓" : "No presentó ✗"}</Badge>
        </Fila>
        <Fila icono={<CalendarDays aria-hidden />} etiqueta="Visitas">
          <span className="tabular-nums">{pibe.visitas}</span>
        </Fila>
        <Fila icono={<History aria-hidden />} etiqueta="Última asistencia">
          {formatoUltimaAsistencia(pibe.ultima_asistencia)}
        </Fila>
        {pibe.telefono && (
          <Fila icono={<Phone aria-hidden />} etiqueta="Teléfono de emergencia">
            <a className="text-primary underline-offset-2 hover:underline" href={`tel:${pibe.telefono}`}>
              {pibe.telefono}
            </a>
          </Fila>
        )}
      </dl>

      {pibe.obs && (
        <div className="mx-5 mb-1 flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-pretty">{pibe.obs}</span>
        </div>
      )}

      <div className="grid gap-3 border-t bg-muted/40 p-5 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-end">
        <Campo etiqueta="Fecha del presente">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={fecha}
              max={hoyLocal()}
              onChange={(e) => setFecha(e.target.value)}
            />
          )}
        </Campo>
        <Button
          size="lg"
          variant={marcado ? "outline" : "default"}
          className={marcado ? "border-success/40 bg-success-soft text-success hover:bg-success-soft/70" : ""}
          cargando={enCurso}
          disabled={presente.isPending}
          onClick={alternar}
        >
          {marcado ? <Undo2 aria-hidden /> : <Check aria-hidden />}
          {marcado ? "Desmarcar presente" : "Marcar presente"}
        </Button>
      </div>

      {editando && <DialogoDeEdicion pibe={pibe} alCerrar={() => setEditando(false)} />}
    </Card>
  );
}

function DialogoDeEdicion({ pibe, alCerrar }: { pibe: PibeConResumen; alCerrar: () => void }) {
  const [ficha, setFicha] = useState(pibe.ficha);
  const [observaciones, setObservaciones] = useState(pibe.obs ?? "");
  const editar = useEditarPibe(pibe.id);

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo="Editar datos"
      descripcion={pibe.nombreCompleto}
      textoEnviar="Guardar cambios"
      ancho="sm"
      alEnviar={async () => {
        await editar.mutateAsync({ entrego_ficha: ficha, observaciones: observaciones.trim() });
        toast.success("Datos actualizados correctamente.");
      }}
    >
      <Campo etiqueta="Ficha presentada">
        {(props) => (
          <Select {...props} value={String(ficha)} onChange={(e) => setFicha(e.target.value === "true")}>
            <option value="true">Sí, trajo la ficha</option>
            <option value="false">No trajo la ficha</option>
          </Select>
        )}
      </Campo>
      <Campo etiqueta="Observaciones">
        {(props) => (
          <Input
            {...props}
            placeholder="Observación..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        )}
      </Campo>
    </DialogoDeFormulario>
  );
}
