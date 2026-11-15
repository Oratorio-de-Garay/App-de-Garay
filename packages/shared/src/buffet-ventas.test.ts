import { describe, expect, it } from "vitest";
import { normalizarItemsVenta } from "./buffet-ventas";

describe("normalizarItemsVenta", () => {
  it("calcula el total de cada línea y el de la venta", () => {
    const { items, total } = normalizarItemsVenta([
      { product_id: "p1", description: "Empanada", quantity: 3, unit_price: 1500 },
      { combo_id: "c1", description: "Combo", quantity: 1, unit_price: 4000 },
    ]);
    expect(items.map((item) => item.line_total)).toEqual([4500, 4000]);
    expect(total).toBe(8500);
  });

  it("ignora cualquier total que mande el cliente", () => {
    const item = { product_id: "p1", quantity: 2, unit_price: 100, line_total: 1, total_amount: 1 };
    expect(normalizarItemsVenta([item])).toEqual({
      items: [
        {
          product_id: "p1",
          combo_id: null,
          description: "Sin descripción",
          quantity: 2,
          unit_price: 100,
          line_total: 200,
        },
      ],
      total: 200,
    });
  });

  it("redondea cantidades y precios a enteros y acepta números como texto", () => {
    const { items } = normalizarItemsVenta([{ product_id: "p1", quantity: "2.4", unit_price: "99.6" }]);
    expect(items[0]).toMatchObject({ quantity: 2, unit_price: 100, line_total: 200 });
  });

  it("descarta ítems sin cantidad o que no apuntan a un producto ni a un combo", () => {
    const { items, total } = normalizarItemsVenta([
      { product_id: "p1", quantity: 0, unit_price: 100 },
      { product_id: "p1", quantity: -2, unit_price: 100 },
      { product_id: "p1", quantity: "abc", unit_price: 100 },
      { description: "huérfano", quantity: 1, unit_price: 100 },
      { product_id: "", combo_id: "", quantity: 1, unit_price: 100 },
    ]);
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it.each([null, undefined, []])("sin ítems (%j) devuelve una venta vacía", (crudos) => {
    expect(normalizarItemsVenta(crudos)).toEqual({ items: [], total: 0 });
  });
});
