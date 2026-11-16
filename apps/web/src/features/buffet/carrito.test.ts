import { describe, expect, it } from "vitest";
import {
  agregar,
  cambiarLinea,
  cambiarProducto,
  claveDe,
  type ItemDeCarrito,
  opcionesDeLinea,
  opcionesParaAgregar,
  problemaDelCarrito,
  quitar,
  total,
  vendibles,
  vuelto,
} from "./carrito";

const productos = [
  { id: "emp", name: "Empanada", sale_price: 1500.4, active: true },
  { id: "gas", name: "Gaseosa", sale_price: 2000, active: false },
];
const combos = [{ id: "c1", name: "Empanada + Vaso", sale_price: 4000, active: true }];
const todos = vendibles(productos, combos);
const [empanada, gaseosa, combo] = todos as [(typeof todos)[0], (typeof todos)[0], (typeof todos)[0]];

describe("vendibles", () => {
  it("junta productos y combos con clave propia y precio entero", () => {
    expect(todos).toEqual([
      { clave: "p:emp", nombre: "Empanada", precio: 1500, activo: true },
      { clave: "p:gas", nombre: "Gaseosa", precio: 2000, activo: false },
      { clave: "c:c1", nombre: "Combo · Empanada + Vaso", precio: 4000, activo: true },
    ]);
  });
});

describe("carrito", () => {
  it("agregar pone una unidad al precio de lista", () => {
    expect(agregar([], empanada)).toEqual([
      { product_id: "emp", combo_id: null, description: "Empanada", quantity: 1, unit_price: 1500 },
    ]);
    expect(agregar([], combo)[0]).toMatchObject({ product_id: null, combo_id: "c1" });
  });

  it("agregar algo que ya está suma una unidad en vez de duplicar la línea", () => {
    const carrito = agregar(agregar(agregar([], empanada), combo), empanada);
    expect(carrito).toHaveLength(2);
    expect(carrito[0]?.quantity).toBe(2);
  });

  it("no modifica el carrito anterior", () => {
    const antes = agregar([], empanada);
    agregar(antes, empanada);
    expect(antes[0]?.quantity).toBe(1);
  });

  it("cambiar el producto de una línea trae su precio y conserva la cantidad", () => {
    const carrito = cambiarLinea(agregar([], empanada), 0, { quantity: 3, unit_price: 1000 });
    expect(cambiarProducto(carrito, 0, combo)).toEqual([
      {
        product_id: null,
        combo_id: "c1",
        description: "Combo · Empanada + Vaso",
        quantity: 3,
        unit_price: 4000,
      },
    ]);
  });

  it("total y quitar", () => {
    const carrito = cambiarLinea(agregar(agregar([], empanada), combo), 0, { quantity: 2 });
    expect(total(carrito)).toBe(2 * 1500 + 4000);
    expect(quitar(carrito, 0).map(claveDe)).toEqual(["c:c1"]);
    expect(total([])).toBe(0);
  });
});

describe("qué se ofrece en los selectores", () => {
  it("para agregar: sólo lo activo que todavía no está en la venta", () => {
    expect(opcionesParaAgregar(todos, []).map((v) => v.clave)).toEqual(["p:emp", "c:c1"]);
    expect(opcionesParaAgregar(todos, agregar([], empanada)).map((v) => v.clave)).toEqual(["c:c1"]);
  });

  it("una línea conserva su producto aunque después se haya desactivado", () => {
    const linea = agregar([], gaseosa)[0]!;
    expect(opcionesDeLinea(todos, linea).map((v) => v.clave)).toEqual(["p:emp", "p:gas", "c:c1"]);
  });

  it("una línea conserva su producto aunque ya no exista en el catálogo", () => {
    const borrado: ItemDeCarrito = {
      product_id: "viejo",
      combo_id: null,
      description: "Choripán",
      quantity: 1,
      unit_price: 900,
    };
    expect(opcionesDeLinea(todos, borrado).at(-1)).toMatchObject({ clave: "p:viejo", nombre: "Choripán" });
  });
});

describe("vuelto", () => {
  it("no se calcula hasta saber con cuánto pagó", () => {
    expect(vuelto(3000, 0)).toBeNull();
    expect(vuelto(3000, Number(""))).toBeNull();
    expect(vuelto(3000, Number("abc"))).toBeNull();
  });

  it("cuánto devolver o cuánto falta", () => {
    expect(vuelto(3000, 5000)).toEqual({ falta: false, monto: 2000 });
    expect(vuelto(3000, 3000)).toEqual({ falta: false, monto: 0 });
    expect(vuelto(3000, 2000)).toEqual({ falta: true, monto: 1000 });
  });
});

describe("problemaDelCarrito", () => {
  it("exige al menos un ítem y cantidades mayores a cero", () => {
    expect(problemaDelCarrito([])).toBe("Agregá al menos un ítem a la venta.");
    const conCero = cambiarLinea(agregar([], empanada), 0, { quantity: 0 });
    expect(problemaDelCarrito(conCero)).toBe("La cantidad de cada ítem debe ser mayor a cero.");
    expect(problemaDelCarrito(agregar([], empanada))).toBeNull();
  });
});
