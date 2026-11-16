import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alerta, EsqueletoDeLista } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";

/**
 * Los tres estados de cualquier dato que viene de la API: cargando, error (con
 * reintento) y listo. Las pantallas sólo escriben el caso "listo".
 */
export function Consulta<T>({
  consulta,
  children,
  filas,
}: {
  consulta: UseQueryResult<T>;
  children: (datos: T) => ReactNode;
  /** Cuántas filas de esqueleto mostrar mientras carga. */
  filas?: number;
}) {
  if (consulta.isPending) return <EsqueletoDeLista filas={filas} />;
  if (consulta.isError) {
    return (
      <Alerta
        tono="error"
        accion={
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        }
      >
        No se pudo cargar la información: {mensajeDeError(consulta.error)}
      </Alerta>
    );
  }
  return <>{children(consulta.data)}</>;
}
