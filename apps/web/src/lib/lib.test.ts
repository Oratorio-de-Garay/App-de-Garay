import { describe, expect, it } from "vitest";
import {
  esRutaInterna,
  guardarOrganizacion,
  guardarRetorno,
  leerOrganizacion,
  resolverOrganizacion,
  tomarRetorno,
} from "./almacen";
import { ErrorDeApi, mensajeDeError, pedir } from "./api";
import {
  formatoDia,
  formatoFechaCorta,
  formatoMes,
  formatoPesos,
  formatoUltimaAsistencia,
  iniciales,
  empiezaConLoBuscado,
  normalizarBusqueda,
  plural,
  tonoDe,
} from "./formato";

describe("formato", () => {
  it("fechas en español, sin correrse de día por el huso horario", () => {
    expect(formatoDia("2026-11-14")).toBe("Sábado, 14 de noviembre");
    expect(formatoDia("2026-11-14T00:00:00+00:00")).toBe("Sábado, 14 de noviembre");
    expect(formatoMes("2026-01-01")).toBe("Enero de 2026");
    expect(formatoFechaCorta("2026-11-05")).toBe("05/11/2026");
    expect(formatoFechaCorta(null)).toBe("");
  });

  it("última asistencia: hoy, el día en palabras, o ninguna", () => {
    expect(formatoUltimaAsistencia("2026-11-15T00:00:00+00:00", "2026-11-15")).toBe("Hoy");
    expect(formatoUltimaAsistencia("2026-11-14", "2026-11-15")).toBe("Sábado, 14 de noviembre");
    expect(formatoUltimaAsistencia(null)).toBe("Sin asistencias");
  });

  it("importes en pesos enteros con separador de miles", () => {
    expect(formatoPesos(27200)).toBe("$27.200");
    expect(formatoPesos("1500.4")).toBe("$1.500");
    expect(formatoPesos(null)).toBe("$0");
    expect(formatoPesos("no es un número")).toBe("$0");
  });

  it("iniciales de un nombre o de un mail", () => {
    expect(iniciales("Pepita Rodriguez")).toBe("PR");
    expect(iniciales("ana maría de los ángeles")).toBe("AM");
    expect(iniciales("oratorio@gmail.com")).toBe("O");
    expect(iniciales("")).toBe("?");
    expect(iniciales(null)).toBe("?");
  });

  it("el tono del avatar es estable para la misma persona", () => {
    expect(tonoDe("ana@local.test")).toBe(tonoDe("ana@local.test"));
    expect(tonoDe("ana@local.test")).toBeGreaterThanOrEqual(0);
    expect(tonoDe("ana@local.test")).toBeLessThan(360);
  });

  it("la búsqueda ignora mayúsculas y tildes", () => {
    expect(normalizarBusqueda("  PÉREZ ")).toBe("perez");
    expect(normalizarBusqueda("Ñandú")).toBe("nandu");
    expect(normalizarBusqueda(null)).toBe("");
  });

  it("distingue a los que empiezan con lo buscado de los que sólo lo contienen", () => {
    expect(empiezaConLoBuscado("ju", "Juan Pérez")).toBe(true);
    expect(empiezaConLoBuscado("pe", "Juan Pérez")).toBe(true);
    expect(empiezaConLoBuscado("PEREZ juan", "Juan Pérez")).toBe(true);
    expect(empiezaConLoBuscado("uan", "Juan Pérez")).toBe(false);
    expect(empiezaConLoBuscado("juan pe", "Juan Mejuan")).toBe(false);
    expect(empiezaConLoBuscado("  ", "Juan Pérez")).toBe(false);
  });

  it("plurales", () => {
    expect(plural(1, "presente", "presentes")).toBe("1 presente");
    expect(plural(0, "presente", "presentes")).toBe("0 presentes");
  });
});

describe("volver al link original después del login", () => {
  it("devuelve la ruta guardada una sola vez", () => {
    guardarRetorno("/admin?tab=solicitudes&solicitud=abc");
    expect(tomarRetorno()).toBe("/admin?tab=solicitudes&solicitud=abc");
    expect(tomarRetorno()).toBeNull();
  });

  it("un login abandonado no manda a nadie a un link viejo", () => {
    const hace31Minutos = Date.now() - 31 * 60_000;
    guardarRetorno("/buffet", hace31Minutos);
    expect(tomarRetorno()).toBeNull();
  });

  it.each(["//otro.com/robo", "/\\otro.com", "https://otro.com", "javascript:alert(1)", "admin", ""])(
    "no redirige fuera del sitio: %j",
    (url) => {
      expect(esRutaInterna(url)).toBe(false);
      guardarRetorno(url);
      expect(tomarRetorno()).toBeNull();
    },
  );

  it("un valor corrupto en el storage no rompe", () => {
    localStorage.setItem("oratorio.retorno", "{no es json");
    expect(tomarRetorno()).toBeNull();
  });
});

describe("organización recordada", () => {
  const orgs = [{ id: "org-1" }, { id: "org-2" }];

  it("se guarda por usuario", () => {
    guardarOrganizacion("u1", "org-2");
    expect(leerOrganizacion("u1")).toBe("org-2");
    expect(leerOrganizacion("u2")).toBeNull();
  });

  it("se usa la recordada si el usuario pertenece a ella", () => {
    expect(resolverOrganizacion("org-2", orgs, "org-1")).toBe("org-2");
  });

  it("un valor manipulado o de una organización ajena se ignora", () => {
    expect(resolverOrganizacion("org-ajena", orgs, "org-1")).toBe("org-1");
    expect(resolverOrganizacion("' or 1=1 --", orgs, "org-1")).toBe("org-1");
  });

  it("sin recordada usa la de la API", () => {
    expect(resolverOrganizacion(null, orgs, "org-1")).toBe("org-1");
    expect(resolverOrganizacion(null, [], null)).toBeNull();
  });
});

describe("pedir", () => {
  const respuesta = (status: number, cuerpo: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) });

  it("devuelve el cuerpo de una respuesta exitosa", async () => {
    await expect(pedir(respuesta(200, [{ id: 1 }]))).resolves.toEqual([{ id: 1 }]);
  });

  it("un rechazo de la API se vuelve un error con su mensaje, status y code", async () => {
    const error = await pedir(respuesta(403, { error: "Sin acceso", code: "SIN_REGISTRO" })).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeApi);
    expect(error).toMatchObject({ message: "Sin acceso", status: 403, code: "SIN_REGISTRO" });
  });

  it("un error de la plataforma que no es JSON no rompe", async () => {
    const html = Promise.resolve({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("<html>")),
    });
    await expect(pedir(html)).rejects.toMatchObject({ message: "Error 502", status: 502 });
  });

  it("sin conexión avisa con un mensaje para la persona", async () => {
    const caido = Promise.reject(new TypeError("Failed to fetch"));
    await expect(pedir(caido)).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("conexión"),
    });
  });

  it("mensajeDeError nunca muestra algo raro", () => {
    expect(mensajeDeError(new Error("Falló"))).toBe("Falló");
    expect(mensajeDeError("texto suelto")).toBe("Ocurrió un error inesperado.");
  });
});
