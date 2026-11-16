import { describe, expect, it } from "vitest";
import type { Actividad, Notificacion } from "./admin/consultas";
import { agruparRoles } from "./admin/roles";
import {
  descripcionDeDispositivo,
  resultadoDeNotificacion,
  resumenDeEnvio,
  textoDeActividad,
  type Tramo,
} from "./admin/textos";
import { aniosDelHistorial } from "./asistencia/historial";
import { mensajeDeAuth } from "./auth/login";
import { claveABytes } from "./push/push";

const plano = (tramos: Tramo[]) => tramos.map((t) => (typeof t === "string" ? t : t.fuerte)).join("");

describe("mensajeDeAuth", () => {
  it("traduce los errores de Supabase a algo que la persona pueda resolver", () => {
    expect(mensajeDeAuth({ status: 429, code: undefined, message: "" })).toContain("demasiados códigos");
    expect(mensajeDeAuth({ status: 400, code: "over_email_send_rate_limit", message: "" })).toContain(
      "demasiados",
    );
    expect(
      mensajeDeAuth({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" }),
    ).toContain("no es válido o ya venció");
    expect(mensajeDeAuth({ status: 422, code: "signup_disabled", message: "Signups not allowed" })).toContain(
      "No se pueden crear cuentas",
    );
    expect(mensajeDeAuth({ status: 500, code: undefined, message: "boom" })).toContain("Revisá tu conexión");
  });
});

describe("aniosDelHistorial", () => {
  it("del año actual hacia atrás hasta 2024", () => {
    expect(aniosDelHistorial(2026, 2026)).toEqual([2026, 2025, 2024]);
  });

  it("incluye el año pedido aunque quede fuera del rango", () => {
    expect(aniosDelHistorial(2021, 2026)).toEqual([2026, 2025, 2024, 2021]);
  });
});

describe("claveABytes", () => {
  it("decodifica base64url sin relleno", () => {
    // "hola?>" en base64 es "aG9sYT8+": en base64url el "+" es "-".
    expect([...claveABytes("aG9sYT8-")]).toEqual([...new TextEncoder().encode("hola?>")]);
    expect(claveABytes("YQ")).toHaveLength(1);
  });
});

describe("agruparRoles", () => {
  it("junta las organizaciones de un mismo rol", () => {
    expect(
      agruparRoles({
        roles: [
          { rol: "admin", nombre: "Administrador", organizacion_id: "a", organizacion_nombre: "Oratorio" },
          { rol: "admin", nombre: "Administrador", organizacion_id: "b", organizacion_nombre: "Escuadra" },
          { rol: "superadmin", nombre: "Superadmin", organizacion_id: null, organizacion_nombre: null },
        ],
      }),
    ).toEqual([
      { rol: "admin", nombre: "Administrador", organizaciones: ["Oratorio", "Escuadra"] },
      { rol: "superadmin", nombre: "Superadmin", organizaciones: [] },
    ]);
  });
});

describe("textoDeActividad", () => {
  const base: Actividad = {
    created_at: "2026-11-15T10:00:00Z",
    accion: "",
    actor_email: "admin@local.test",
    objetivo_email: "ana@local.test",
    organizacion_id: "org",
    organizacion_nombre: "Oratorio",
    detalle: null,
  };
  const roles = [
    {
      codigo: "admin",
      nombre: "Administrador",
      descripcion: null,
      alcance: "organizacion",
      asignable_desde_panel: true,
    },
  ];

  it.each([
    ["usuario_creado", { nombre: "Ana" }, "Alta de ana@local.test (Ana)", "neutro"],
    ["usuario_eliminado", null, "ana@local.test quedó sin acceso a la aplicación", "quita"],
    ["membresia_agregada", null, "ana@local.test ahora tiene acceso a Oratorio", "neutro"],
    ["rol_asignado", { rol: "admin" }, "ana@local.test ahora es Administrador de Oratorio", "rol"],
    ["organizacion_renombrada", { antes: "A", despues: "B" }, "A ahora se llama B", "organizacion"],
    [
      "solicitud_creada",
      { numero: 7 },
      "ana@local.test pidió sumarse a Oratorio (solicitud #7)",
      "solicitud",
    ],
    [
      "solicitud_creada",
      { numero: 8, nombre_espacio: "Escuadra 9" },
      "ana@local.test pidió crear el espacio Escuadra 9 (solicitud #8)",
      "solicitud",
    ],
    [
      "notificacion_enviada",
      { titulo: "Hola" },
      "Notificación “Hola” para ana@local.test en Oratorio",
      "solicitud",
    ],
  ] as const)("%s", (accion, detalle, esperado, tono) => {
    const resultado = textoDeActividad({ ...base, accion, detalle }, roles);
    expect(plano(resultado.tramos)).toBe(esperado);
    expect(resultado.tono).toBe(tono);
  });

  it("una organización borrada no deja la frase rota", () => {
    const { tramos } = textoDeActividad({ ...base, accion: "membresia_quitada", organizacion_nombre: null });
    expect(plano(tramos)).toBe("ana@local.test ya no tiene acceso a una organización eliminada");
  });

  it("una acción desconocida se muestra tal cual, sin romper", () => {
    expect(plano(textoDeActividad({ ...base, accion: "algo_nuevo" }).tramos)).toBe("algo_nuevo");
  });

  it("lo que escribió el usuario viaja como texto, nunca como HTML", () => {
    const { tramos } = textoDeActividad({
      ...base,
      accion: "usuario_creado",
      detalle: { nombre: "<img onerror=x>" },
    });
    expect(tramos).toContain(" (<img onerror=x>)");
  });
});

describe("notificaciones", () => {
  const n = {
    estado: "enviada",
    dispositivos_total: 2,
    enviados: 1,
    motivo: null,
    programada_para: null,
  } as Notificacion;

  it("resultado de un envío", () => {
    expect(resultadoDeNotificacion(n)).toBe("1 de 2 dispositivos");
    expect(resultadoDeNotificacion({ ...n, dispositivos_total: 0 })).toBe("Ningún dispositivo activado");
    expect(resultadoDeNotificacion({ ...n, dispositivos_total: 0, motivo: "Sin permiso" })).toBe(
      "Sin permiso",
    );
    expect(resultadoDeNotificacion({ ...n, estado: "cancelada" })).toBe("No se envió");
  });

  it("resumen: todo bien", () => {
    expect(
      resumenDeEnvio(
        { notificaciones: [{ estado: "enviada" }, { estado: "parcial" }], rechazados: [] },
        null,
      ),
    ).toEqual({
      mensaje: "Enviada a 2 usuarios.",
      conProblemas: false,
    });
  });

  it("resumen: avisa lo que no salió", () => {
    const resumen = resumenDeEnvio(
      {
        notificaciones: [{ estado: "enviada" }, { estado: "sin_dispositivos" }, { estado: "fallida" }],
        rechazados: [{}],
      },
      null,
    );
    expect(resumen.conProblemas).toBe(true);
    expect(resumen.mensaje).toBe(
      "Enviada a 1 usuario · 1 usuario sin notificaciones activadas · 1 usuario sin poder entregar · 1 usuario rechazado (no pertenecen a la organización).",
    );
  });

  it("resumen: programada", () => {
    const resumen = resumenDeEnvio(
      { notificaciones: [{ estado: "programada" }], rechazados: [] },
      "2027-01-01T13:00:00Z",
    );
    expect(resumen.conProblemas).toBe(false);
    expect(resumen.mensaje).toMatch(/^1 notificación programada para el /);
  });
});

describe("descripcionDeDispositivo", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "Chrome · Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
      "Safari · iOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
      "Edge · Windows",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox · Linux"],
    [null, "Dispositivo"],
    ["algo raro", "Dispositivo"],
  ])("%s", (ua, esperado) => {
    expect(descripcionDeDispositivo(ua)).toBe(esperado);
  });
});
