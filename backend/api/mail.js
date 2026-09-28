import nodemailer from "nodemailer";

// ========================================================
// MAILS: avisos de solicitudes
//
// SMTP configurable por entorno (ver docs/SETUP.md):
//   producción → Gmail (oratoriogarayy@gmail.com + contraseña de aplicación)
//   local      → Mailpit (127.0.0.1:54325, se ven en http://127.0.0.1:54324)
// Sin SMTP_HOST no se manda nada: la app funciona igual, sólo sin avisos.
//
// Los envíos son "best-effort": si fallan se loguean, pero la operación que
// los disparó (crear o resolver una solicitud) ya quedó guardada y no se
// revierte. Hay que esperarlos antes de responder: en Vercel la función se
// congela apenas sale la respuesta.
// ========================================================

let transporte = null;

function obtenerTransporte() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporte;
}

function remitente() {
  return process.env.MAIL_FROM || `"Oratorio de Garay" <${process.env.SMTP_USER || "no-responder@localhost"}>`;
}

/** URL base de la app para los links de los mails. */
export function urlDeLaApp(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

/** Devuelve true si se mandó. Nunca lanza. */
async function enviar({ to, bcc, subject, html, text }) {
  const smtp = obtenerTransporte();
  if (!smtp) {
    console.warn(`Mail no enviado (falta SMTP_HOST): ${subject}`);
    return false;
  }
  try {
    // El asunto lleva nombres que escribió el usuario: nada de saltos de línea.
    await smtp.sendMail({ from: remitente(), to, bcc, subject: subject.replace(/[\r\n\t]+/g, " "), html, text });
    return true;
  } catch (error) {
    console.error(`Mail error (${subject}):`, error);
    return false;
  }
}

function escapeHtml(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Plantilla común: una tarjeta simple, legible en cualquier cliente de mail. */
function plantilla({ titulo, parrafos, boton }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${p}</p>`).join("");
  const cta = boton
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(boton.url)}" style="background:#2f7d4f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(boton.texto)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f2a22">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:12px;padding:26px 24px;border:1px solid #e3e6df">
      <h1 style="font-size:19px;margin:0 0 16px">${escapeHtml(titulo)}</h1>
      ${cuerpo}${cta}
    </div>
    <p style="font-size:12px;color:#7a847c;text-align:center;margin:16px 0 0">Oratorio de Garay · Mail automático, no hace falta responderlo.</p>
  </div></body></html>`;
}

function queQuiere(solicitud) {
  return solicitud.datos?.espacio_nuevo
    ? `crear el espacio nuevo <strong>${escapeHtml(solicitud.datos.nombre_espacio)}</strong>`
    : `sumarse a <strong>${escapeHtml(solicitud.organizacion_nombre)}</strong>`;
}

/** A los aprobadores (superadmins + admins del espacio): hay una solicitud nueva. */
export async function mailNuevaSolicitud(solicitud, destinatarios, appUrl) {
  if (!destinatarios?.length) return 0;
  const link = `${appUrl}/admin.html?tab=solicitudes&solicitud=${encodeURIComponent(solicitud.id)}`;
  const quien = `<strong>${escapeHtml(solicitud.solicitante_nombre)}</strong> (${escapeHtml(solicitud.solicitante_email)})`;
  const asunto = solicitud.datos?.espacio_nuevo
    ? `Solicitud #${solicitud.numero}: ${solicitud.solicitante_nombre} quiere crear un espacio`
    : `Solicitud #${solicitud.numero}: ${solicitud.solicitante_nombre} quiere sumarse a ${solicitud.organizacion_nombre}`;

  const ok = await enviar({
    // Los aprobadores en copia oculta: no se exponen los mails entre ellos.
    to: remitente(),
    bcc: destinatarios,
    subject: asunto,
    html: plantilla({
      titulo: `Nueva solicitud #${solicitud.numero}`,
      parrafos: [
        `${quien} se registró en la app y quiere ${queQuiere(solicitud)}.`,
        "Revisala para aceptarla o rechazarla. Hasta entonces no tiene acceso a ningún dato.",
      ],
      boton: { texto: "Ver la solicitud", url: link },
    }),
    text: `${solicitud.solicitante_nombre} (${solicitud.solicitante_email}) quiere ${
      solicitud.datos?.espacio_nuevo ? `crear el espacio "${solicitud.datos.nombre_espacio}"` : `sumarse a ${solicitud.organizacion_nombre}`
    }.\nRevisala en: ${link}`,
  });
  return ok ? destinatarios.length : 0;
}

/** Al solicitante: su solicitud fue aceptada o rechazada. */
export async function mailSolicitudResuelta(solicitud, appUrl) {
  const aceptada = solicitud.estado === "aceptada";
  const espacio = escapeHtml(solicitud.organizacion_nombre || solicitud.datos?.nombre_espacio || "");
  const comentario = solicitud.comentario_aprobador
    ? `Comentario: <em>${escapeHtml(solicitud.comentario_aprobador)}</em>`
    : null;

  const parrafos = aceptada
    ? [
        `¡Hola ${escapeHtml(solicitud.solicitante_nombre)}! Tu solicitud fue aceptada: ya tenés acceso a <strong>${espacio}</strong>.`,
        solicitud.datos?.rol_asignado === "admin"
          ? "Además quedaste como administrador del espacio: vas a poder aprobar a quienes pidan sumarse."
          : null,
        comentario,
      ]
    : [
        `Hola ${escapeHtml(solicitud.solicitante_nombre)}. Tu solicitud para ${
          solicitud.datos?.espacio_nuevo ? `crear el espacio <strong>${escapeHtml(solicitud.datos.nombre_espacio)}</strong>` : `sumarte a <strong>${espacio}</strong>`
        } fue rechazada.`,
        comentario,
        "Si creés que es un error, podés entrar a la app y mandar una nueva solicitud.",
      ];

  const ok = await enviar({
    to: solicitud.solicitante_email,
    subject: aceptada ? "Tu solicitud fue aceptada" : "Tu solicitud fue rechazada",
    html: plantilla({
      titulo: aceptada ? "Solicitud aceptada" : "Solicitud rechazada",
      parrafos: parrafos.filter(Boolean),
      boton: { texto: aceptada ? "Entrar a la app" : "Ir a la app", url: `${appUrl}/` },
    }),
    text: aceptada
      ? `Tu solicitud fue aceptada: ya tenés acceso a ${solicitud.organizacion_nombre}. Entrá en ${appUrl}/`
      : `Tu solicitud fue rechazada.${solicitud.comentario_aprobador ? ` Comentario: ${solicitud.comentario_aprobador}` : ""}`,
  });
  return ok ? 1 : 0;
}
