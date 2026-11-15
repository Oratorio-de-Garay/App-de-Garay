import type { Context } from "hono";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";

// ========================================================
// MAILS: avisos de solicitudes
//
// SMTP configurable por entorno (ver docs/SETUP.md):
//   producción → Gmail (cuenta del oratorio + contraseña de aplicación)
//   local      → Mailpit (127.0.0.1:54325, se ven en http://127.0.0.1:54324)
// Sin SMTP_HOST no se manda nada: la app funciona igual, sólo sin avisos.
//
// Los envíos son "best-effort": si fallan se loguean, pero la operación que
// los disparó (crear o resolver una solicitud) ya quedó guardada y no se
// revierte. Hay que esperarlos antes de responder: en Vercel la función se
// congela apenas sale la respuesta.
// ========================================================

/** Lo que usan los mails de una solicitud (devuelta por las funciones SQL). */
export interface Solicitud {
  id: string;
  numero: number | string;
  estado: string;
  solicitante_nombre: string;
  solicitante_email: string;
  organizacion_nombre?: string | null;
  comentario_aprobador?: string | null;
  datos?: { espacio_nuevo?: boolean; nombre_espacio?: string; rol_asignado?: string } | null;
}

export interface ResultadoDeEnvio {
  notificados: number;
  /** Por qué no salió, en palabras para el admin. Sólo si falló. */
  motivo?: string;
}

let transporte: Transporter | null = null;

function obtenerTransporte(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporte ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporte;
}

const remitente = () => env.MAIL_FROM || `"Oratorio de Garay" <${env.SMTP_USER || "no-responder@localhost"}>`;

/** URL base de la app para los links de los mails. */
export function urlDeLaApp(c: Context): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${c.req.header("x-forwarded-host") || c.req.header("host") || url.host}`;
}

interface Mail {
  to: string;
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
}

/** Nunca lanza: devuelve si salió y, si no, un motivo sin datos sensibles. */
async function enviar(mail: Mail): Promise<{ ok: boolean; motivo?: string }> {
  const smtp = obtenerTransporte();
  if (!smtp) {
    console.warn(`Mail no enviado (falta SMTP_HOST): ${mail.subject}`);
    return { ok: false, motivo: "falta configurar SMTP_HOST en este entorno" };
  }
  try {
    // El asunto lleva nombres que escribió el usuario: nada de saltos de línea.
    await smtp.sendMail({ ...mail, from: remitente(), subject: mail.subject.replace(/[\r\n\t]+/g, " ") });
    return { ok: true };
  } catch (error) {
    console.error(`Mail error (${mail.subject}):`, error);
    return { ok: false, motivo: motivoDeError(error as ErrorSmtp) };
  }
}

interface ErrorSmtp {
  code?: string;
  response?: string;
  message?: string;
}

export function motivoDeError(error: ErrorSmtp): string {
  if (error.code === "EAUTH") {
    return "el servidor de mail rechazó el usuario o la contraseña (revisá SMTP_USER y SMTP_PASS)";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(error.code ?? "")) {
    return `no se pudo conectar al servidor de mail (revisá SMTP_HOST y SMTP_PORT; ${error.code})`;
  }
  if (error.code === "EENVELOPE") {
    return "el remitente o el destinatario no son válidos (revisá MAIL_FROM)";
  }
  return `${error.code || "error"}: ${String(error.response || error.message).slice(0, 200)}`;
}

export function escaparHtml(texto: unknown): string {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Plantilla común: una tarjeta simple, legible en cualquier cliente de mail. */
function plantilla(mail: {
  titulo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
}): string {
  const cuerpo = mail.parrafos.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${p}</p>`).join("");
  const cta = mail.boton
    ? `<p style="margin:22px 0 6px"><a href="${escaparHtml(mail.boton.url)}" style="background:#2f7d4f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${escaparHtml(mail.boton.texto)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f2a22">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:12px;padding:26px 24px;border:1px solid #e3e6df">
      <h1 style="font-size:19px;margin:0 0 16px">${escaparHtml(mail.titulo)}</h1>
      ${cuerpo}${cta}
    </div>
    <p style="font-size:12px;color:#7a847c;text-align:center;margin:16px 0 0">Oratorio de Garay · Mail automático, no hace falta responderlo.</p>
  </div></body></html>`;
}

/** Contenido del aviso a los aprobadores. Exportado para poder probarlo. */
export function armarMailNuevaSolicitud(solicitud: Solicitud, appUrl: string) {
  const link = `${appUrl}/admin.html?tab=solicitudes&solicitud=${encodeURIComponent(solicitud.id)}`;
  const espacioNuevo = Boolean(solicitud.datos?.espacio_nuevo);
  const quien = `<strong>${escaparHtml(solicitud.solicitante_nombre)}</strong> (${escaparHtml(solicitud.solicitante_email)})`;
  const quiere = espacioNuevo
    ? `crear el espacio nuevo <strong>${escaparHtml(solicitud.datos?.nombre_espacio)}</strong>`
    : `sumarse a <strong>${escaparHtml(solicitud.organizacion_nombre)}</strong>`;

  return {
    subject: espacioNuevo
      ? `Solicitud #${solicitud.numero}: ${solicitud.solicitante_nombre} quiere crear un espacio`
      : `Solicitud #${solicitud.numero}: ${solicitud.solicitante_nombre} quiere sumarse a ${solicitud.organizacion_nombre}`,
    html: plantilla({
      titulo: `Nueva solicitud #${solicitud.numero}`,
      parrafos: [
        `${quien} se registró en la app y quiere ${quiere}.`,
        "Revisala para aceptarla o rechazarla. Hasta entonces no tiene acceso a ningún dato.",
      ],
      boton: { texto: "Ver la solicitud", url: link },
    }),
    text: `${solicitud.solicitante_nombre} (${solicitud.solicitante_email}) quiere ${
      espacioNuevo
        ? `crear el espacio "${solicitud.datos?.nombre_espacio}"`
        : `sumarse a ${solicitud.organizacion_nombre}`
    }.\nRevisala en: ${link}`,
  };
}

/** A los aprobadores (superadmins + admins del espacio): hay una solicitud nueva. */
export async function mailNuevaSolicitud(
  solicitud: Solicitud,
  destinatarios: string[] | null | undefined,
  appUrl: string,
): Promise<ResultadoDeEnvio> {
  if (!destinatarios?.length) return { notificados: 0, motivo: "no hay aprobadores a quienes avisar" };
  const envio = await enviar({
    // Los aprobadores en copia oculta: no se exponen los mails entre ellos.
    to: remitente(),
    bcc: destinatarios,
    ...armarMailNuevaSolicitud(solicitud, appUrl),
  });
  return { notificados: envio.ok ? destinatarios.length : 0, motivo: envio.motivo };
}

/** Contenido del aviso al solicitante. Exportado para poder probarlo. */
export function armarMailSolicitudResuelta(solicitud: Solicitud, appUrl: string) {
  const aceptada = solicitud.estado === "aceptada";
  const espacio = escaparHtml(solicitud.organizacion_nombre || solicitud.datos?.nombre_espacio || "");
  const comentario = solicitud.comentario_aprobador
    ? `Comentario: <em>${escaparHtml(solicitud.comentario_aprobador)}</em>`
    : null;

  const parrafos = aceptada
    ? [
        `¡Hola ${escaparHtml(solicitud.solicitante_nombre)}! Tu solicitud fue aceptada: ya tenés acceso a <strong>${espacio}</strong>.`,
        solicitud.datos?.rol_asignado === "admin"
          ? "Además quedaste como administrador del espacio: vas a poder aprobar a quienes pidan sumarse."
          : null,
        comentario,
      ]
    : [
        `Hola ${escaparHtml(solicitud.solicitante_nombre)}. Tu solicitud para ${
          solicitud.datos?.espacio_nuevo
            ? `crear el espacio <strong>${escaparHtml(solicitud.datos.nombre_espacio)}</strong>`
            : `sumarte a <strong>${espacio}</strong>`
        } fue rechazada.`,
        comentario,
        "Si creés que es un error, podés entrar a la app y mandar una nueva solicitud.",
      ];

  return {
    subject: aceptada ? "Tu solicitud fue aceptada" : "Tu solicitud fue rechazada",
    html: plantilla({
      titulo: aceptada ? "Solicitud aceptada" : "Solicitud rechazada",
      parrafos: parrafos.filter((p): p is string => Boolean(p)),
      boton: { texto: aceptada ? "Entrar a la app" : "Ir a la app", url: `${appUrl}/` },
    }),
    text: aceptada
      ? `Tu solicitud fue aceptada: ya tenés acceso a ${solicitud.organizacion_nombre}. Entrá en ${appUrl}/`
      : `Tu solicitud fue rechazada.${solicitud.comentario_aprobador ? ` Comentario: ${solicitud.comentario_aprobador}` : ""}`,
  };
}

/** Al solicitante: su solicitud fue aceptada o rechazada. */
export async function mailSolicitudResuelta(solicitud: Solicitud, appUrl: string): Promise<ResultadoDeEnvio> {
  const envio = await enviar({
    to: solicitud.solicitante_email,
    ...armarMailSolicitudResuelta(solicitud, appUrl),
  });
  return { notificados: envio.ok ? 1 : 0, motivo: envio.motivo };
}
