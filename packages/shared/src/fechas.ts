// Fechas de asistencia. La app guarda cada presente como un instante y agrupa
// por día UTC (el mismo criterio que usan las funciones SQL asistencia_fechas
// y asistencia_top): estas funciones son la única implementación de ese criterio
// fuera de la base.

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `true` si es una fecha de calendario real con formato AAAA-MM-DD. */
export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string" || !FECHA_ISO.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  // Date acepta "2026-02-31" corriéndolo a marzo: se compara ida y vuelta.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export interface RangoDia {
  /** Inicio del día (inclusive), ISO 8601. */
  desde: string;
  /** Inicio del día siguiente (exclusive), ISO 8601. */
  hasta: string;
}

/** Rango [00:00 UTC, 00:00 UTC del día siguiente) de una fecha AAAA-MM-DD. */
export function rangoDiaUTC(fecha: string): RangoDia {
  if (!esFechaISO(fecha)) throw new RangeError(`Fecha inválida: ${fecha}`);
  const inicio = new Date(`${fecha}T00:00:00.000Z`);
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

/** Fecha de hoy (AAAA-MM-DD) en el huso horario local del dispositivo. */
export function hoyLocal(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}
