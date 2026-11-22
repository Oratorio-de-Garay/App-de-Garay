import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { guardar, leer } from "@/lib/almacen";
import { cn } from "@/lib/utils";

// Tabla con paginación del lado del cliente. La usan todos los listados de la
// app: en pantallas grandes es una tabla, en el celular cada fila es una
// tarjeta con el nombre de cada columna al lado del valor.

export interface Columna<T> {
  titulo: string;
  celda: (item: T, indice: number) => ReactNode;
  /** Alinea a la derecha (números, importes). */
  numerica?: boolean;
  /** Columna de botones: sin título en el celular. */
  acciones?: boolean;
  className?: string;
}

export const TAMANOS_DE_PAGINA = [10, 25, 50, 100, 200] as const;
const TAMANO_POR_DEFECTO = 10;

/** Recorta la lista a una página y corrige la página si quedó fuera de rango. */
export function paginar<T>(items: readonly T[], pagina: number, tamano: number) {
  const paginas = Math.max(1, Math.ceil(items.length / tamano));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const desde = (actual - 1) * tamano;
  return {
    pagina: actual,
    paginas,
    desde,
    hasta: Math.min(desde + tamano, items.length),
    visibles: items.slice(desde, desde + tamano),
  };
}

function leerTamano(clave: string): number {
  const guardado = Number(leer(`paginacion:${clave}`));
  return (TAMANOS_DE_PAGINA as readonly number[]).includes(guardado) ? guardado : TAMANO_POR_DEFECTO;
}

interface ListadoProps<T> {
  /** Identifica el listado para recordar su tamaño de página en el dispositivo. */
  clave: string;
  items: readonly T[];
  columnas: Columna<T>[];
  idDe: (item: T) => string | number;
  /** Tocar la fila (fuera de los botones) hace esto. */
  alTocarFila?: (item: T) => void;
  /** Se muestra en lugar de la tabla cuando no hay items. */
  vacio?: ReactNode;
  claseDeFila?: (item: T) => string | undefined;
  /**
   * En la tabla (pantallas grandes), deja un corte antes de este item, como si
   * a partir de ahí empezara otra tabla. No se dibuja si es el primero de la página.
   */
  cortarAntesDe?: (item: T) => boolean;
  /** Nombre accesible de la tabla. */
  titulo?: string;
}

export function Listado<T>({
  clave,
  items,
  columnas,
  idDe,
  alTocarFila,
  vacio,
  claseDeFila,
  cortarAntesDe,
  titulo,
}: ListadoProps<T>) {
  const [tamano, setTamano] = useState(() => leerTamano(clave));
  const [paginaPedida, setPaginaPedida] = useState(1);
  const { pagina, paginas, desde, hasta, visibles } = useMemo(
    () => paginar(items, paginaPedida, tamano),
    [items, paginaPedida, tamano],
  );

  // Si la lista se achicó (un filtro, un borrado) la página pedida se acomoda.
  useEffect(() => {
    if (pagina !== paginaPedida) setPaginaPedida(pagina);
  }, [pagina, paginaPedida]);

  if (!items.length) return <>{vacio ?? null}</>;

  const barra = (posicion: "arriba" | "abajo") => (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        {posicion === "arriba" && (
          <label className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              aria-label="Ítems por página"
              value={tamano}
              onChange={(e) => {
                const nuevo = Number(e.target.value);
                setTamano(nuevo);
                setPaginaPedida(1);
                guardar(`paginacion:${clave}`, String(nuevo));
              }}
            >
              {TAMANOS_DE_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <span aria-live={posicion === "arriba" ? "polite" : undefined} className="tabular-nums">
          {desde + 1}–{hasta} de {items.length}
        </span>
      </div>
      {paginas > 1 && (
        <nav
          className="flex items-center gap-1"
          aria-label={posicion === "arriba" ? "Paginación" : "Paginación inferior"}
        >
          <Button
            variant="outline"
            size="sm"
            className="px-2"
            disabled={pagina === 1}
            onClick={() => setPaginaPedida(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="px-2 tabular-nums">
            {pagina} / {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="px-2"
            disabled={pagina === paginas}
            onClick={() => setPaginaPedida(pagina + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );

  // Índice del primer item de la página que arranca "otra tabla" (nunca el 0).
  const corte = cortarAntesDe ? visibles.findIndex((item, i) => i > 0 && cortarAntesDe(item)) : -1;
  // Con corte, el borde y las esquinas redondeadas los dibujan las celdas (no el
  // contenedor), así el hueco no deja bordes laterales que unan las dos partes.
  const partida = corte > 0;
  const ultima = columnas.length - 1;

  /** Bordes y esquinas de una celda de la tabla cuando está partida. */
  const bordesDeCelda = (fila: number, columna: number) =>
    partida &&
    cn(
      "md:border-b md:bg-card",
      columna === 0 && "md:border-l",
      columna === ultima && "md:border-r",
      fila === corte && "md:border-t",
      fila === corte && columna === 0 && "md:rounded-tl-xl",
      fila === corte && columna === ultima && "md:rounded-tr-xl",
      (fila === corte - 1 || fila === visibles.length - 1) && columna === 0 && "md:rounded-bl-xl",
      (fila === corte - 1 || fila === visibles.length - 1) && columna === ultima && "md:rounded-br-xl",
      alTocarFila && "md:group-hover/fila:bg-brand-50",
    );

  return (
    <div className="grid gap-3">
      {barra("arriba")}
      <div
        className={cn("md:overflow-x-auto", !partida && "md:rounded-xl md:border md:bg-card md:shadow-card")}
      >
        <table
          className={cn("block w-full text-sm md:table", partida && "md:border-separate md:border-spacing-0")}
          aria-label={titulo}
        >
          <thead className="sr-only md:not-sr-only md:table-header-group">
            <tr
              className={cn(
                "border-b bg-muted/60 text-left text-xs tracking-wide text-muted-foreground uppercase",
                partida && "md:bg-transparent",
              )}
            >
              {columnas.map((columna, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 font-semibold",
                    columna.numerica && "text-right",
                    partida && [
                      "md:border-y md:bg-muted/60",
                      i === 0 && "md:rounded-tl-xl md:border-l",
                      i === ultima && "md:rounded-tr-xl md:border-r",
                    ],
                    columna.className,
                  )}
                >
                  {columna.acciones ? <span className="sr-only">Acciones</span> : columna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid gap-2 md:table-row-group">
            {visibles.map((item, i) => (
              <Fragment key={idDe(item)}>
                {i === corte && (
                  // Sólo en la tabla: el hueco muestra el fondo de la página, y la
                  // tabla sigue siendo una sola (mismas columnas y paginación).
                  <tr aria-hidden className="hidden md:table-row">
                    <td colSpan={columnas.length} className="h-3 p-0" />
                  </tr>
                )}
                <tr
                  onClick={
                    alTocarFila
                      ? (e) => {
                          // Los botones y links de la fila no cuentan como "tocar la fila".
                          if ((e.target as HTMLElement).closest("button, a, input, select, label")) return;
                          alTocarFila(item);
                        }
                      : undefined
                  }
                  className={cn(
                    "group/fila block rounded-xl border bg-card p-3.5 shadow-card",
                    "md:table-row md:rounded-none md:border-0 md:border-b md:p-0 md:shadow-none md:last:border-b-0",
                    alTocarFila && "cursor-pointer transition-colors hover:bg-brand-50/70",
                    claseDeFila?.(item),
                  )}
                >
                  {columnas.map((columna, j) => (
                    <td
                      key={j}
                      className={cn(
                        "flex items-start justify-between gap-3 py-1 md:table-cell md:px-4 md:py-3 md:align-middle",
                        columna.numerica && "md:text-right md:tabular-nums",
                        columna.acciones &&
                          "mt-2 justify-end border-t pt-3 md:mt-0 md:border-0 md:pt-3 md:text-right",
                        // La primera columna es el "título" de la tarjeta.
                        j === 0 && "mb-1 justify-start",
                        bordesDeCelda(i, j),
                        columna.className,
                      )}
                    >
                      {j > 0 && !columna.acciones && columna.titulo && (
                        <span className="shrink-0 text-[13px] text-muted-foreground md:hidden">
                          {columna.titulo}
                        </span>
                      )}
                      <div
                        className={cn(
                          "min-w-0",
                          j > 0 && !columna.acciones && "text-right",
                          j > 0 && !columna.acciones && !columna.numerica && "md:text-left",
                        )}
                      >
                        {columna.acciones ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {columna.celda(item, desde + i)}
                          </div>
                        ) : (
                          columna.celda(item, desde + i)
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {(paginas > 1 || visibles.length > 8) && barra("abajo")}
    </div>
  );
}
