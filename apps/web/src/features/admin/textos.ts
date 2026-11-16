import { formatoFechaHora, plural } from "@/lib/formato";
import type { Actividad, Notificacion, ResultadoDeEnvio, Rol } from "./consultas";

// Textos del panel que se arman a partir de datos. Sin React, para probarlos.

/** Un tramo de texto; `fuerte` se muestra en negrita. */
export type Tramo = string | { fuerte: string };

export type TonoDeActividad = "neutro" | "quita" | "rol" | "organizacion" | "solicitud";

const b = (texto: unknown): Tramo => ({ fuerte: String(texto ?? "") });

/** Frase y color de una entrada de la auditoría. */
export function textoDeActividad(
  a: Actividad,
  roles: readonly Rol[] = [],
): { tramos: Tramo[]; tono: TonoDeActividad } {
  const d = a.detalle ?? {};
  const quien = b(a.objetivo_email);
  const org: Tramo = a.organizacion_nombre ? b(a.organizacion_nombre) : "una organización eliminada";
  const rol = b(roles.find((r) => r.codigo === d.rol)?.nombre || d.rol || "");
  const deOrg: Tramo[] = a.organizacion_id ? [" de ", org] : [];
  const notificacion = `“${d.titulo ?? ""}”`;

  const textos: Record<string, [Tramo[], TonoDeActividad]> = {
    usuario_creado: [["Alta de ", quien, d.nombre ? ` (${d.nombre})` : ""], "neutro"],
    usuario_renombrado: [[quien, " ahora figura como ", b(d.despues || "(sin nombre)")], "neutro"],
    usuario_eliminado: [[quien, " quedó sin acceso a la aplicación"], "quita"],
    membresia_agregada: [[quien, " ahora tiene acceso a ", org], "neutro"],
    membresia_quitada: [[quien, " ya no tiene acceso a ", org], "quita"],
    rol_asignado: [[quien, " ahora es ", rol, ...deOrg], "rol"],
    rol_quitado: [[quien, " dejó de ser ", rol, ...deOrg], "quita"],
    organizacion_creada: [["Se creó la organización ", b(d.nombre)], "organizacion"],
    organizacion_renombrada: [[b(d.antes), " ahora se llama ", b(d.despues)], "organizacion"],
    solicitud_creada: [
      d.nombre_espacio
        ? [quien, " pidió crear el espacio ", b(d.nombre_espacio), ` (solicitud #${d.numero})`]
        : [quien, " pidió sumarse a ", org, ` (solicitud #${d.numero})`],
      "solicitud",
    ],
    solicitud_aceptada: [[`Se aceptó la solicitud #${d.numero} de `, quien], "neutro"],
    solicitud_rechazada: [[`Se rechazó la solicitud #${d.numero} de `, quien], "quita"],
    solicitud_cancelada: [[quien, ` canceló su solicitud #${d.numero}`], "quita"],
    notificacion_enviada: [[`Notificación ${notificacion} para `, quien, " en ", org], "solicitud"],
    notificacion_programada: [
      [`Notificación ${notificacion} programada para `, quien, " en ", org],
      "solicitud",
    ],
    notificacion_cancelada: [
      [`Se canceló la notificación ${notificacion} para `, quien, " en ", org],
      "quita",
    ],
  };

  const [tramos, tono] = textos[a.accion] ?? [[a.accion], "neutro"];
  return { tramos: tramos.filter((tramo) => tramo !== ""), tono };
}

export const ESTADOS_DE_NOTIFICACION: Record<string, string> = {
  pendiente: "Pendiente",
  programada: "Programada",
  enviando: "Enviando",
  enviada: "Enviada",
  parcial: "Parcial",
  fallida: "Fallida",
  sin_dispositivos: "Sin dispositivos",
  cancelada: "Cancelada",
};

export function resultadoDeNotificacion(n: Notificacion): string {
  if (n.estado === "programada") return `Se envía el ${formatoFechaHora(n.programada_para)}`;
  if (n.estado === "enviando") return "Enviándose ahora";
  if (n.estado === "cancelada") return "No se envió";
  return n.dispositivos_total
    ? `${n.enviados} de ${plural(n.dispositivos_total, "dispositivo", "dispositivos")}`
    : n.motivo || "Ningún dispositivo activado";
}

/** Resumen de un envío para el aviso, y si hubo algo que mirar. */
export function resumenDeEnvio(
  { notificaciones, rechazados }: ResultadoDeEnvio,
  programadaPara: string | null,
): { mensaje: string; conProblemas: boolean } {
  const cuenta = (...estados: string[]) => notificaciones.filter((n) => estados.includes(n.estado)).length;
  const partes: string[] = [];
  let conProblemas = false;

  if (programadaPara) {
    partes.push(
      `${plural(notificaciones.length, "notificación programada", "notificaciones programadas")} para el ${formatoFechaHora(programadaPara)}`,
    );
  } else {
    const enviadas = cuenta("enviada", "parcial");
    const sinDispositivos = cuenta("sin_dispositivos");
    const fallidas = cuenta("fallida", "pendiente");
    if (enviadas) partes.push(`Enviada a ${plural(enviadas, "usuario", "usuarios")}`);
    if (sinDispositivos)
      partes.push(`${plural(sinDispositivos, "usuario", "usuarios")} sin notificaciones activadas`);
    if (fallidas) partes.push(`${plural(fallidas, "usuario", "usuarios")} sin poder entregar`);
    conProblemas = !enviadas || sinDispositivos > 0 || fallidas > 0;
  }
  if (rechazados.length) {
    partes.push(
      `${plural(rechazados.length, "usuario rechazado", "usuarios rechazados")} (no pertenecen a la organización)`,
    );
    conProblemas = true;
  }
  const mensaje = partes.join(" · ");
  return { mensaje: mensaje.endsWith(".") ? mensaje : `${mensaje}.`, conProblemas };
}

/** "Chrome · Android" a partir del user agent. */
export function descripcionDeDispositivo(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome|CriOS/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : null;
  const sistema = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return [navegador, sistema].filter(Boolean).join(" · ") || "Dispositivo";
}

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
