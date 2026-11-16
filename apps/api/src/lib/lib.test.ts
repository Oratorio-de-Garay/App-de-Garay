import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { CacheTTL } from "./cache";
import { ErrorDeBase, ErrorHttp, respuestaDeError } from "./errores";
import {
  armarMailNuevaSolicitud,
  armarMailSolicitudResuelta,
  escaparHtml,
  motivoDeError,
  type Solicitud,
} from "./mail";
import { soloDefinidos } from "./objetos";
import { endpointPermitido } from "./push";
import { datos } from "./supabase";
import { mensajeDeValidacion } from "./validar";

describe("CacheTTL", () => {
  it("devuelve lo guardado hasta que vence", () => {
    let ahora = 1000;
    const cache = new CacheTTL<string>(30_000, 10, () => ahora);
    cache.set("a", "valor");
    ahora += 30_000;
    expect(cache.get("a")).toBe("valor");
    ahora += 1;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("al llenarse descarta la entrada más vieja", () => {
    const cache = new CacheTTL<number>(1000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("pisar una clave existente no desaloja a otra", () => {
    const cache = new CacheTTL<number>(1000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBe(2);
  });
});

describe("respuestaDeError", () => {
  it("un error esperable sale con su status, mensaje y code", () => {
    expect(respuestaDeError(new ErrorHttp(403, "Sin acceso", "SIN_REGISTRO"))).toEqual({
      status: 403,
      body: { error: "Sin acceso", code: "SIN_REGISTRO" },
    });
    expect(respuestaDeError(new ErrorHttp(404, "No está")).body).toEqual({ error: "No está" });
  });

  it.each([
    ["42501", 403],
    ["22023", 400],
    ["P0002", 404],
    ["23505", 409],
    ["55000", 409],
  ])("SQLSTATE %s de una función → %i con el mensaje de la base", (code, status) => {
    expect(respuestaDeError(new ErrorDeBase({ code, message: "Mensaje de la función" }))).toEqual({
      status,
      body: { error: "Mensaje de la función" },
    });
  });

  it("los errores propios de Postgres no muestran su mensaje técnico", () => {
    const uuidMalo = new ErrorDeBase({ code: "22P02", message: 'invalid input syntax for type uuid: "x"' });
    expect(respuestaDeError(uuidMalo)).toEqual({ status: 400, body: { error: "Identificador inválido" } });
    const fk = new ErrorDeBase({ code: "23503", message: 'violates foreign key constraint "fk_x"' });
    expect(respuestaDeError(fk).status).toBe(409);
    expect(respuestaDeError(fk).body.error).not.toContain("fk_x");
  });

  it("lo inesperado es un 500 sin detalles internos", () => {
    for (const error of [
      new Error("password=secreto"),
      new ErrorDeBase({ code: "XX000", message: "tabla x" }),
      "texto",
    ]) {
      const { status, body } = respuestaDeError(error);
      expect(status).toBe(500);
      expect(body.error).toBe("Ocurrió un error inesperado. Intentá de nuevo.");
    }
  });

  it("un JSON mal formado es un 400 en español", () => {
    expect(respuestaDeError(new HTTPException(400, { message: "Malformed JSON in request body" }))).toEqual({
      status: 400,
      body: { error: "El pedido no es un JSON válido" },
    });
  });
});

describe("datos", () => {
  it("devuelve los datos si no hubo error", () => {
    expect(datos({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(datos({ data: null, error: null })).toBeNull();
  });

  it("lanza un ErrorDeBase con el SQLSTATE", () => {
    const llamar = () => datos({ data: null, error: { message: "sin permiso", code: "42501" } });
    expect(llamar).toThrow(ErrorDeBase);
    expect(llamar).toThrow("sin permiso");
  });
});

describe("mensajeDeValidacion", () => {
  it("usa el mensaje del esquema", () => {
    expect(
      mensajeDeValidacion([{ code: "too_small", path: ["name"], message: "El nombre es obligatorio." }]),
    ).toBe("El nombre es obligatorio.");
  });

  it("si falta un campo sin mensaje propio, lo nombra", () => {
    expect(
      mensajeDeValidacion([
        { code: "invalid_type", path: ["keys", "auth"], message: "Entrada inválida: se esperaba string" },
      ]),
    ).toBe('Falta o es inválido el campo "keys.auth".');
  });

  it("sin problemas devuelve un mensaje genérico", () => {
    expect(mensajeDeValidacion([])).toBe("Datos inválidos.");
  });
});

describe("soloDefinidos", () => {
  it("saca las claves undefined y conserva null, false y 0", () => {
    expect(soloDefinidos({ a: undefined, b: null, c: false, d: 0, e: "x" })).toEqual({
      b: null,
      c: false,
      d: 0,
      e: "x",
    });
  });
});

describe("endpointPermitido (anti SSRF)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://db5p.notify.windows.com/w/?token=abc",
  ])("acepta %s", (endpoint) => {
    expect(endpointPermitido(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/x",
    "https://usuario:clave@fcm.googleapis.com/x",
    "https://fcm.googleapis.com.atacante.com/x",
    "https://atacantefcm.googleapis.com.ar/x",
    "https://127.0.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "no es una url",
    "",
  ])("rechaza %s", (endpoint) => {
    expect(endpointPermitido(endpoint)).toBe(false);
  });
});

describe("mails", () => {
  const solicitud: Solicitud = {
    id: "id con espacios",
    numero: 7,
    estado: "aceptada",
    solicitante_nombre: "<b>Ana</b>",
    solicitante_email: "ana@local.test",
    organizacion_nombre: "Oratorio & Cía",
    datos: null,
  };

  it("escapa lo que escribió el usuario", () => {
    expect(escaparHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    const mail = armarMailNuevaSolicitud(solicitud, "https://app.test");
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Ana</b>");
    expect(mail.html).toContain("Oratorio &amp; Cía");
  });

  it("el aviso a los aprobadores lleva el link a la solicitud", () => {
    const mail = armarMailNuevaSolicitud(solicitud, "https://app.test");
    expect(mail.subject).toBe("Solicitud #7: <b>Ana</b> quiere sumarse a Oratorio & Cía");
    expect(mail.text).toContain("https://app.test/admin?tab=solicitudes&solicitud=id%20con%20espacios");
  });

  it("distingue pedir un espacio nuevo", () => {
    const mail = armarMailNuevaSolicitud(
      {
        ...solicitud,
        organizacion_nombre: null,
        datos: { espacio_nuevo: true, nombre_espacio: "Escuadra 9" },
      },
      "https://app.test",
    );
    expect(mail.subject).toBe("Solicitud #7: <b>Ana</b> quiere crear un espacio");
    expect(mail.html).toContain("crear el espacio nuevo <strong>Escuadra 9</strong>");
  });

  it("aceptada: avisa el acceso y, si corresponde, que quedó como admin", () => {
    const comun = armarMailSolicitudResuelta(solicitud, "https://app.test");
    expect(comun.subject).toBe("Tu solicitud fue aceptada");
    expect(comun.html).not.toContain("administrador del espacio");
    const admin = armarMailSolicitudResuelta(
      { ...solicitud, datos: { rol_asignado: "admin" } },
      "https://app.test",
    );
    expect(admin.html).toContain("administrador del espacio");
  });

  it("rechazada: incluye el comentario del aprobador", () => {
    const mail = armarMailSolicitudResuelta(
      { ...solicitud, estado: "rechazada", comentario_aprobador: "No te conocemos" },
      "https://app.test",
    );
    expect(mail.subject).toBe("Tu solicitud fue rechazada");
    expect(mail.html).toContain("<em>No te conocemos</em>");
    expect(mail.text).toContain("Comentario: No te conocemos");
  });

  it("traduce los errores de SMTP a algo que el admin pueda arreglar", () => {
    expect(motivoDeError({ code: "EAUTH" })).toContain("SMTP_USER");
    expect(motivoDeError({ code: "ECONNREFUSED" })).toContain("SMTP_HOST");
    expect(motivoDeError({ code: "EENVELOPE" })).toContain("MAIL_FROM");
    expect(motivoDeError({ message: "x".repeat(500) }).length).toBeLessThan(220);
  });
});
