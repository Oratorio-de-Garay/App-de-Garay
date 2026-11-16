// Formas de los datos que viajan entre la API y el frontend y que conviene
// nombrar. La API las produce (apps/api/src/modules/*/mappers.ts) y el
// frontend las consume: una sola definición.

/**
 * Forma común de un pibe en TODAS las respuestas de la API (búsqueda, ficha,
 * asistencias por fecha). Si se agrega un campo, se agrega acá.
 */
export interface Pibe {
  id: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  grado_id: number | null;
  /** Ej: "Primario 3°". */
  grado: string | null;
  edad_id: number | null;
  /** Categoría: "Medianos", "Grandes"… */
  edad: string | null;
  /** Si entregó la ficha. */
  ficha: boolean;
  obs: string | null;
  telefono: number | null;
}

/** Un pibe con su resumen de asistencia (búsqueda y ficha). */
export interface PibeConResumen extends Pibe {
  /** Total de asistencias registradas. */
  visitas: number;
  ultima_asistencia: string | null;
  /** Si tiene el presente del día consultado; null si no se pidió una fecha. */
  marcado_hoy?: boolean | null;
}
