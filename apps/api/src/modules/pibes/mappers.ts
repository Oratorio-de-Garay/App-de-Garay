// Arma la forma común de un pibe (tipo `Pibe` de @garay/shared) a partir de
// las filas de la base. El frontend depende de que sea siempre la misma.

import type { Pibe, PibeConResumen } from "@garay/shared";

export interface Grado {
  id: number;
  nivel: string;
  grado: number;
}

export interface PibeDeLaBase {
  id: string;
  nombre: string;
  apellido: string;
  entrego_ficha: boolean;
  observaciones: string | null;
  telefono_emergencia: number | null;
  grado: Grado | null;
  edad: { id: number; nombre: string } | null;
}

export function etiquetaDeGrado(grado: Pick<Grado, "nivel" | "grado"> | null | undefined): string | null {
  return grado ? `${grado.nivel} ${grado.grado}°` : null;
}

export function aPibe(fila: PibeDeLaBase): Pibe {
  return {
    id: fila.id,
    nombre: fila.nombre,
    apellido: fila.apellido,
    nombreCompleto: `${fila.nombre} ${fila.apellido}`,
    grado_id: fila.grado?.id ?? null,
    grado: etiquetaDeGrado(fila.grado),
    edad_id: fila.edad?.id ?? null,
    edad: fila.edad?.nombre ?? null,
    ficha: fila.entrego_ficha,
    obs: fila.observaciones,
    telefono: fila.telefono_emergencia,
  };
}

/** Fila que devuelve la función SQL buscar_pibes_resumen. */
export interface FilaDeBusqueda {
  id: string;
  nombre: string;
  apellido: string;
  grado_id: number | null;
  grado_nivel: string | null;
  grado_numero: number | null;
  edad_id: number | null;
  edad_nombre: string | null;
  entrego_ficha: boolean;
  observaciones: string | null;
  telefono_emergencia: number | null;
  visitas: number | string | null;
  ultima_asistencia: string | null;
  marcado_hoy: boolean | null;
}

export function aPibeDeBusqueda(fila: FilaDeBusqueda, conFecha: boolean): PibeConResumen {
  return {
    ...aPibe({
      ...fila,
      grado:
        fila.grado_id && fila.grado_nivel !== null && fila.grado_numero !== null
          ? { id: fila.grado_id, nivel: fila.grado_nivel, grado: fila.grado_numero }
          : null,
      edad: fila.edad_id && fila.edad_nombre !== null ? { id: fila.edad_id, nombre: fila.edad_nombre } : null,
    }),
    visitas: Number(fila.visitas) || 0,
    ultima_asistencia: fila.ultima_asistencia || null,
    marcado_hoy: conFecha ? Boolean(fila.marcado_hoy) : null,
  };
}
