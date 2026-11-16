import { describe, expect, it } from "vitest";
import { notificacionSchema, usuarioAltaSchema } from "./admin";
import { eventoCrearSchema, eventoEditarSchema, productoSchema, ventaCrearSchema } from "./buffet";
import { asistenciaSchema, pibeCrearSchema, pibeEditarSchema } from "./pibes";

const UUID = "4f472fa0-2f97-4b6e-a6c8-de1a7f34516a";
const mensaje = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message;

describe("productoSchema", () => {
  it("completa los valores por defecto y limpia los textos", () => {
    expect(productoSchema.parse({ name: "  Empanada  ", category_id: "", observation: "   " })).toEqual({
      name: "Empanada",
      category_id: null,
      unit_id: null,
      stock_current: 0,
      sale_price: 0,
      observation: null,
      active: true,
      is_donated: false,
    });
  });

  it("exige el nombre", () => {
    expect(mensaje(productoSchema.safeParse({ name: "   " }))).toBe("El nombre es obligatorio.");
    expect(mensaje(productoSchema.safeParse({}))).toBe("El nombre es obligatorio.");
  });

  it("acepta stock negativo pero no precio negativo", () => {
    expect(productoSchema.parse({ name: "x", stock_current: -2 }).stock_current).toBe(-2);
    expect(mensaje(productoSchema.safeParse({ name: "x", sale_price: -1 }))).toBe("No puede ser negativo.");
  });

  it("rechaza un id de categoría que no es uuid", () => {
    expect(productoSchema.safeParse({ name: "x", category_id: "1; drop table" }).success).toBe(false);
    expect(productoSchema.parse({ name: "x", category_id: UUID }).category_id).toBe(UUID);
  });
});

describe("eventos", () => {
  it("al crear, el estado por defecto es abierto y la fecha es opcional", () => {
    expect(eventoCrearSchema.parse({ nombre: "Feria", fecha: "", estado: "" })).toEqual({
      nombre: "Feria",
      fecha: undefined,
      estado: "abierto",
      observacion: null,
    });
  });

  it("al editar sólo quedan las claves que vinieron", () => {
    expect(eventoEditarSchema.parse({ estado: "cerrado" })).toEqual({ estado: "cerrado" });
    expect(eventoEditarSchema.parse({ observacion: "" })).toEqual({ observacion: null });
  });

  it("al editar no deja vaciar el nombre", () => {
    expect(mensaje(eventoEditarSchema.safeParse({ nombre: " " }))).toBe(
      "El nombre del evento es obligatorio.",
    );
  });

  it("rechaza fechas que no existen", () => {
    expect(eventoCrearSchema.safeParse({ nombre: "Feria", fecha: "2026-02-31" }).success).toBe(false);
  });
});

describe("ventaCrearSchema", () => {
  it("medio de pago por defecto efectivo y fecha vacía como null", () => {
    const venta = ventaCrearSchema.parse({ event_id: UUID, sale_date: "", items: [] });
    expect(venta).toMatchObject({ event_id: UUID, sale_date: null, payment_method: "efectivo", items: [] });
  });
});

describe("pibeCrearSchema", () => {
  const base = { nombre: " Ana ", apellido: " Pérez ", grado_id: "3", edad_id: 2 };

  it("recorta nombres, convierte los ids del formulario y normaliza opcionales", () => {
    expect(
      pibeCrearSchema.parse({ ...base, telefono_emergencia: "11 2233-4455", observaciones: "" }),
    ).toEqual({
      nombre: "Ana",
      apellido: "Pérez",
      grado_id: 3,
      edad_id: 2,
      entrego_ficha: false,
      telefono_emergencia: 1122334455,
      observaciones: null,
      fecha: undefined,
    });
  });

  it.each([
    [true, true],
    ["Sí", true],
    ["Si", true],
    [false, false],
    ["No", false],
    ["true", false],
    [undefined, false],
  ])("ficha %j → %j", (valor, esperado) => {
    expect(pibeCrearSchema.parse({ ...base, entrego_ficha: valor }).entrego_ficha).toBe(esperado);
  });

  it("da un mensaje por cada dato obligatorio que falta", () => {
    expect(mensaje(pibeCrearSchema.safeParse({ ...base, nombre: "" }))).toBe("Ingresá el nombre.");
    expect(mensaje(pibeCrearSchema.safeParse({ ...base, grado_id: "" }))).toBe("Seleccioná un grado.");
    expect(mensaje(pibeCrearSchema.safeParse({ ...base, edad_id: "abc" }))).toBe("Seleccioná una categoría.");
  });

  it("un teléfono sin dígitos queda en null", () => {
    expect(
      pibeCrearSchema.parse({ ...base, telefono_emergencia: "no tiene" }).telefono_emergencia,
    ).toBeNull();
  });
});

describe("pibeEditarSchema", () => {
  it("no inventa cambios que no vinieron", () => {
    expect(pibeEditarSchema.parse({ observaciones: "Alergia" })).toEqual({ observaciones: "Alergia" });
    expect(pibeEditarSchema.parse({})).toEqual({});
  });
});

describe("asistenciaSchema", () => {
  it("exige un uuid y una fecha real", () => {
    expect(asistenciaSchema.safeParse({ student_id: UUID, fecha: "2026-11-15" }).success).toBe(true);
    expect(mensaje(asistenciaSchema.safeParse({ student_id: "1", fecha: "2026-11-15" }))).toBe(
      "Identificador inválido.",
    );
    expect(mensaje(asistenciaSchema.safeParse({ student_id: UUID, fecha: "15/11/2026" }))).toBe(
      "La fecha debe tener formato AAAA-MM-DD.",
    );
  });
});

describe("esquemas del panel", () => {
  it("la lista de organizaciones descarta lo que no sea un id de texto", () => {
    expect(
      usuarioAltaSchema.parse({ email: "a@b.c", organizaciones: [UUID, "", 7, null] }).organizaciones,
    ).toEqual([UUID]);
    expect(usuarioAltaSchema.parse({ email: "a@b.c", organizaciones: "no es lista" }).organizaciones).toEqual(
      [],
    );
  });

  it("un email ausente llega vacío a la función SQL, que es la que valida", () => {
    expect(usuarioAltaSchema.parse({}).email).toBe("");
  });

  it("rechaza una fecha de envío que no es una fecha", () => {
    const pedido = { titulo: "Hola", texto: "Chau" };
    expect(mensaje(notificacionSchema.safeParse({ ...pedido, programada_para: "mañana" }))).toBe(
      "La fecha de envío no es válida",
    );
    expect(notificacionSchema.safeParse({ ...pedido, programada_para: "2027-01-01T10:00:00Z" }).success).toBe(
      true,
    );
    expect(notificacionSchema.safeParse(pedido).success).toBe(true);
  });
});
