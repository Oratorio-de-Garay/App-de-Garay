import { hoyLocal } from "@garay/shared";

// Formato de fechas, importes y nombres. Único lugar: antes cada pantalla
// tenía el suyo y los importes se mostraban de dos maneras distintas.

export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "";
}

/** "2026-11-15" (o un ISO completo) como fecha del calendario local. */
export function fechaLocal(iso: string): Date {
  const [anio = 1970, mes = 1, dia = 1] = iso.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

const diaLargo = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });
const diaLargoConAnio = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const mesYAnio = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const diaCorto = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short" });
const fechaYHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

/** "Sábado, 14 de noviembre". */
export const formatoDia = (iso: string) => capitalizar(diaLargo.format(fechaLocal(iso)));
/** "Sábado, 14 de noviembre de 2026". */
export const formatoDiaConAnio = (iso: string) => capitalizar(diaLargoConAnio.format(fechaLocal(iso)));
/** "Noviembre de 2026". */
export const formatoMes = (iso: string) => capitalizar(mesYAnio.format(fechaLocal(iso)));
/** "domingo 15 nov", para el encabezado. */
export const formatoHoy = (ahora = new Date()) => diaCorto.format(ahora).replace(",", "").replace(".", "");

/** "14/11/2026". */
export function formatoFechaCorta(iso: string | null | undefined): string {
  const [anio, mes, dia] = String(iso ?? "")
    .slice(0, 10)
    .split("-");
  return dia ? `${dia}/${mes}/${anio}` : String(iso ?? "");
}

/** "14 nov 2026, 10:30". Un instante, en la hora del dispositivo. */
export function formatoFechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fechaYHora.format(fecha);
}

/** "Hoy", el día en palabras, o "Sin asistencias". */
export function formatoUltimaAsistencia(iso: string | null | undefined, hoy = hoyLocal()): string {
  if (!iso) return "Sin asistencias";
  return iso.slice(0, 10) === hoy ? "Hoy" : formatoDia(iso);
}

/** Los importes van en pesos enteros: no hay centavos en la feria. */
export function formatoPesos(monto: number | string | null | undefined): string {
  return `$${Math.round(Number(monto) || 0).toLocaleString("es-AR")}`;
}

/** Hasta dos iniciales; de un mail usa lo que está antes de la arroba. */
export function iniciales(texto: string | null | undefined): string {
  const palabras = String(texto ?? "")
    .replace(/@.*/, "")
    .match(/\p{L}[\p{L}\p{N}]*/gu);
  return (
    (palabras ?? [])
      .slice(0, 2)
      .map((palabra) => palabra.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/** Tono (0–359) estable para el avatar de una persona u organización. */
export function tonoDe(semilla: string): number {
  let hash = 0;
  for (const caracter of semilla) hash = (hash * 31 + caracter.charCodeAt(0)) % 360;
  return hash;
}

/** Minúsculas y sin tildes: "Pérez" se encuentra buscando "perez". */
export function normalizarBusqueda(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function plural(cantidad: number, uno: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? uno : varios}`;
}

/** Valor para un <input type="datetime-local"> (hora local, sin zona). */
export function valorFechaHoraLocal(fecha: Date): string {
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
