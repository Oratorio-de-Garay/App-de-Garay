import type { Pibe } from "@garay/shared";
import { ArrowLeft, CalendarX, Crown } from "lucide-react";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/campos";
import { Alerta, Avatar, Card, EsqueletoDeLista, EstadoVacio, Persona } from "@/components/ui/varios";
import { fechaLocal, formatoDia, formatoDiaConAnio, formatoMes, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { useHistorial, usePresentesDelDia } from "./consultas";

const PRIMER_ANIO = 2024;

/** Del año actual hacia atrás, más el año pedido si quedó fuera de ese rango. */
export function aniosDelHistorial(seleccionado: number, actual = new Date().getFullYear()): number[] {
  const anios: number[] = [];
  for (let anio = actual; anio >= Math.min(PRIMER_ANIO, actual); anio--) anios.push(anio);
  if (!anios.includes(seleccionado)) anios.push(seleccionado);
  return anios;
}

interface HistorialProps {
  anio: number;
  alCambiarAnio: (anio: number) => void;
  alElegirFecha: (fecha: string) => void;
  alElegirPibe: (id: string) => void;
}

const MEDALLAS = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-800",
  "bg-orange-300 text-orange-950",
];

export function Historial({ anio, alCambiarAnio, alElegirFecha, alElegirPibe }: HistorialProps) {
  const { fechas, podio } = useHistorial(anio);

  return (
    <div className="grid gap-4">
      {podio.data && podio.data.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Crown className="size-5 text-amber-500" aria-hidden />
            Top asistencia del año ({anio})
          </h2>
          <ol className="grid gap-2 sm:grid-cols-3">
            {podio.data.map((pibe, puesto) => (
              <li key={pibe.id}>
                <button
                  type="button"
                  onClick={() => alElegirPibe(pibe.id)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-brand-50"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      MEDALLAS[puesto],
                    )}
                  >
                    {puesto + 1}°
                  </span>
                  <Avatar nombre={pibe.nombreCompleto} tamano="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{pibe.nombreCompleto}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {plural(pibe.total, "presente", "presentes")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Historial de asistencias</h2>
            <p className="text-sm text-muted-foreground">
              Solo aparecen los días en los que hubo al menos una asistencia.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Año
            <Select className="w-28" value={anio} onChange={(e) => alCambiarAnio(Number(e.target.value))}>
              {aniosDelHistorial(anio).map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {fechas.isPending ? (
          <EsqueletoDeLista />
        ) : fechas.isError ? (
          <Alerta tono="error">No se pudo cargar el historial.</Alerta>
        ) : (
          <Listado
            clave="registro-historial-fechas"
            titulo="Días con asistencias"
            items={fechas.data}
            idDe={(dia) => dia.fecha}
            alTocarFila={(dia) => alElegirFecha(dia.fecha)}
            vacio={
              <EstadoVacio icono={<CalendarX />} titulo={`No hay asistencias registradas en ${anio}.`} />
            }
            columnas={[
              { titulo: "Fecha", celda: (dia) => <strong>{formatoDia(dia.fecha)}</strong> },
              { titulo: "Mes", celda: (dia) => formatoMes(dia.fecha) },
              { titulo: "Presentes", numerica: true, celda: (dia) => dia.total },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

interface PresentesProps {
  fecha: string;
  alVolver: (anio: number) => void;
  alElegirPibe: (id: string) => void;
}

/** Quiénes vinieron un día. */
export function PresentesDelDia({ fecha, alVolver, alElegirPibe }: PresentesProps) {
  const presentes = usePresentesDelDia(fecha);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => alVolver(fechaLocal(fecha).getFullYear())}>
          <ArrowLeft aria-hidden />
          Volver
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{formatoDiaConAnio(fecha)}</h2>
          <p className="text-sm text-muted-foreground">
            {presentes.data
              ? plural(presentes.data.length, "presente", "presentes")
              : "Cargando presentes..."}
          </p>
        </div>
      </div>
      {presentes.isPending ? (
        <EsqueletoDeLista />
      ) : presentes.isError ? (
        <Alerta tono="error">No se pudo cargar la lista de presentes.</Alerta>
      ) : (
        <Listado
          clave="registro-presentes-fecha"
          titulo="Presentes del día"
          items={presentes.data}
          idDe={(pibe) => pibe.id}
          alTocarFila={(pibe) => alElegirPibe(pibe.id)}
          vacio={<EstadoVacio icono={<CalendarX />} titulo="No hay presentes cargados para esta fecha." />}
          columnas={columnasDePibe}
        />
      )}
    </Card>
  );
}

export const columnasDePibe = [
  { titulo: "Nombre", celda: (pibe: Pibe) => <Persona nombre={pibe.nombreCompleto} /> },
  { titulo: "Grado", celda: (pibe: Pibe) => pibe.grado || "Sin grado" },
  { titulo: "Edad", celda: (pibe: Pibe) => pibe.edad || "—" },
];
