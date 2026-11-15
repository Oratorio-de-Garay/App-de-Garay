import { describe, expect, it } from "vitest";
import { ErrorHttp } from "../lib/errores";
import { secretoValido } from "../modules/push/routes";
import { aPibe, aPibeDeBusqueda, etiquetaDeGrado, type FilaDeBusqueda } from "../modules/pibes/mappers";
import { puedeAdministrar, sesionDesdeClaims, usuarioDesdeContexto } from "./auth";

const ORG_A = { id: "org-a", name: "Oratorio" };
const ORG_B = { id: "org-b", name: "Escuadra" };

function errorDe(fn: () => unknown): ErrorHttp {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorHttp) return error;
    throw error;
  }
  throw new Error("No lanzó");
}

describe("sesionDesdeClaims", () => {
  it("normaliza el email y toma el nombre de Google", () => {
    expect(
      sesionDesdeClaims({
        email: "  Ana@Gmail.com ",
        role: "authenticated",
        user_metadata: { full_name: "Ana Pérez" },
      }),
    ).toEqual({ email: "ana@gmail.com", nombreSugerido: "Ana Pérez" });
  });

  it("rechaza la anon key y la service role key, que son JWT válidos sin email", () => {
    expect(sesionDesdeClaims({ role: "anon" })).toBeNull();
    expect(sesionDesdeClaims({ role: "service_role" })).toBeNull();
    expect(sesionDesdeClaims({ email: "a@b.c", role: "service_role" })).toBeNull();
    expect(sesionDesdeClaims(null)).toBeNull();
  });
});

describe("usuarioDesdeContexto", () => {
  const miembro = { registrado: true, organizaciones: [ORG_A, ORG_B], roles: [], organizaciones_admin: [] };

  it("sin registro: 403 con el code que abre la pantalla de registro", () => {
    for (const contexto of [null, undefined, { registrado: false }]) {
      const error = errorDe(() => usuarioDesdeContexto("a@b.c", contexto, undefined));
      expect(error.status).toBe(403);
      expect(error.code).toBe("SIN_REGISTRO");
    }
  });

  it("registrado pero sin organizaciones: 403 SIN_ORGANIZACION", () => {
    const error = errorDe(() => usuarioDesdeContexto("a@b.c", { registrado: true }, undefined));
    expect(error.code).toBe("SIN_ORGANIZACION");
  });

  it("sin header usa la primera organización", () => {
    expect(usuarioDesdeContexto("a@b.c", miembro, undefined).organizationId).toBe("org-a");
  });

  it("con header usa la organización pedida si es suya", () => {
    expect(usuarioDesdeContexto("a@b.c", miembro, "org-b").organizationId).toBe("org-b");
  });

  it("pedir una organización ajena es 403: no alcanza con conocer el id", () => {
    const error = errorDe(() => usuarioDesdeContexto("a@b.c", miembro, "org-ajena"));
    expect(error.status).toBe(403);
    expect(error.message).toBe("No pertenecés a esa organización");
  });

  it("ser superadmin no da acceso a los datos de una organización", () => {
    const superadmin = {
      registrado: true,
      es_superadmin: true,
      organizaciones: [],
      organizaciones_admin: ["org-a"],
    };
    expect(usuarioDesdeContexto("s@b.c", superadmin, undefined)).toMatchObject({
      organizationId: null,
      esSuperadmin: true,
    });
    expect(errorDe(() => usuarioDesdeContexto("s@b.c", superadmin, "org-a")).status).toBe(403);
  });
});

describe("puedeAdministrar", () => {
  const base = { email: "a@b.c", organizationId: "org-a", organizations: [ORG_A], roles: [] };

  it("admin de alguna organización o superadmin", () => {
    expect(puedeAdministrar({ ...base, esSuperadmin: false, organizacionesAdministradas: ["org-a"] })).toBe(
      true,
    );
    expect(puedeAdministrar({ ...base, esSuperadmin: true, organizacionesAdministradas: [] })).toBe(true);
    expect(puedeAdministrar({ ...base, esSuperadmin: false, organizacionesAdministradas: [] })).toBe(false);
    expect(puedeAdministrar(undefined)).toBe(false);
  });
});

describe("secretoValido", () => {
  it("sólo acepta el secreto exacto, aunque midan distinto", () => {
    expect(secretoValido("abc123", "abc123")).toBe(true);
    expect(secretoValido("abc124", "abc123")).toBe(false);
    expect(secretoValido("", "abc123")).toBe(false);
    expect(secretoValido("abc123abc123", "abc123")).toBe(false);
  });
});

describe("forma común de un pibe", () => {
  const fila = {
    id: "p1",
    nombre: "Ana",
    apellido: "Pérez",
    entrego_ficha: true,
    observaciones: "Alergia",
    telefono_emergencia: 1122334455,
    grado: { id: 3, nivel: "Primario", grado: 3 },
    edad: { id: 2, nombre: "Medianos" },
  };

  it("arma nombre completo y etiqueta de grado", () => {
    expect(aPibe(fila)).toEqual({
      id: "p1",
      nombre: "Ana",
      apellido: "Pérez",
      nombreCompleto: "Ana Pérez",
      grado_id: 3,
      grado: "Primario 3°",
      edad_id: 2,
      edad: "Medianos",
      ficha: true,
      obs: "Alergia",
      telefono: 1122334455,
    });
  });

  it("sin grado ni categoría deja null, no rompe", () => {
    expect(aPibe({ ...fila, grado: null, edad: null })).toMatchObject({
      grado_id: null,
      grado: null,
      edad_id: null,
      edad: null,
    });
    expect(etiquetaDeGrado(undefined)).toBeNull();
  });

  it("la búsqueda devuelve la misma forma más el resumen de asistencia", () => {
    const deBusqueda: FilaDeBusqueda = {
      id: "p1",
      nombre: "Ana",
      apellido: "Pérez",
      grado_id: 3,
      grado_nivel: "Primario",
      grado_numero: 3,
      edad_id: 2,
      edad_nombre: "Medianos",
      entrego_ficha: true,
      observaciones: "Alergia",
      telefono_emergencia: 1122334455,
      visitas: "4",
      ultima_asistencia: "2026-11-14T00:00:00+00:00",
      marcado_hoy: true,
    };
    expect(aPibeDeBusqueda(deBusqueda, true)).toEqual({
      ...aPibe(fila),
      visitas: 4,
      ultima_asistencia: "2026-11-14T00:00:00+00:00",
      marcado_hoy: true,
    });
    // Sin fecha pedida no se sabe si está presente "hoy".
    expect(aPibeDeBusqueda(deBusqueda, false).marcado_hoy).toBeNull();
  });
});
