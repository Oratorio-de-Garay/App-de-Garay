import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, limpiar, MARCA, marcaUnica, organizacionesDe, pedir, USUARIOS } from "./ayudas";

const como = USUARIOS.admin;
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

describe("buffet", () => {
  let org: string;
  const sufijo = marcaUnica();

  beforeAll(async () => {
    org = (await organizacionesDe(como))[0]!.id;
  });
  afterAll(limpiar);

  const stockDe = async (id: string) =>
    (await adminDb.from("buffet_products").select("stock_current").eq("id", id).single()).data!.stock_current;

  it("meta devuelve los tres catálogos", async () => {
    const { status, body } = await pedir("GET", "/api/buffet/meta", { como, org });
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["categories", "suppliers", "units"]);
  });

  describe("catálogo", () => {
    const casos: [string, Record<string, string | number>, string][] = [
      ["products", { name: `${MARCA} Empanada ${sufijo}`, sale_price: 1500, stock_current: 10 }, "name"],
      ["combos", { name: `${MARCA} Combo ${sufijo}`, sale_price: 4000 }, "name"],
      ["budgets", { title: `${MARCA} Presupuesto ${sufijo}`, total_amount: 9000 }, "title"],
    ];
    it.each(casos)("%s: alta, listado, edición y baja", async (recurso, alta, campo) => {
      const base = `/api/buffet/${recurso}`;
      const creado = await pedir("POST", base, { como, org, body: alta });
      expect(creado).toMatchObject({ status: 201, body: { id: expect.any(String) } });
      const { id } = creado.body;

      const enLista = async () =>
        (await pedir("GET", base, { como, org })).body.find((fila: { id: string }) => fila.id === id);
      expect(await enLista()).toMatchObject(alta);

      const nuevoNombre = `${alta[campo]} editado`;
      expect(
        (await pedir("PATCH", `${base}/${id}`, { como, org, body: { ...alta, [campo]: nuevoNombre } }))
          .status,
      ).toBe(200);
      expect((await enLista())[campo]).toBe(nuevoNombre);

      expect((await pedir("DELETE", `${base}/${id}`, { como, org })).body).toEqual({ ok: true });
      expect(await enLista()).toBeUndefined();
    });

    it("sin nombre es 400; editar algo que no existe es 404; id mal formado es 400", async () => {
      expect(
        await pedir("POST", "/api/buffet/products", { como, org, body: { sale_price: 10 } }),
      ).toMatchObject({
        status: 400,
        body: { error: "El nombre es obligatorio." },
      });
      expect(
        await pedir("PATCH", `/api/buffet/products/${UUID_INEXISTENTE}`, { como, org, body: { name: "x" } }),
      ).toMatchObject({ status: 404, body: { error: "Producto no encontrado" } });
      expect((await pedir("DELETE", "/api/buffet/combos/abc", { como, org })).status).toBe(400);
    });

    it("el listado de productos trae los nombres de categoría y unidad aplanados", async () => {
      const creado = await pedir("POST", "/api/buffet/products", {
        como,
        org,
        body: { name: `${MARCA} Suelto ${sufijo}` },
      });
      const { body } = await pedir("GET", "/api/buffet/products", { como, org });
      expect(body.find((p: { id: string }) => p.id === creado.body.id)).toEqual({
        id: creado.body.id,
        name: `${MARCA} Suelto ${sufijo}`,
        stock_current: 0,
        sale_price: 0,
        observation: null,
        active: true,
        is_donated: false,
        category_id: null,
        unit_id: null,
        category_name: null,
        unit_name: null,
        unit_abbreviation: null,
        pack_size: 1,
      });
    });
  });

  describe("eventos y ventas", () => {
    let productoId: string;
    let eventoId: string;
    let ventaId: string;

    beforeAll(async () => {
      const producto = await pedir("POST", "/api/buffet/products", {
        como,
        org,
        body: { name: `${MARCA} Vendible ${sufijo}`, sale_price: 1000, stock_current: 10 },
      });
      productoId = producto.body.id;
    });

    it("crea un evento, con validación de nombre", async () => {
      expect(await pedir("POST", "/api/buffet/events", { como, org, body: { nombre: " " } })).toMatchObject({
        status: 400,
        body: { error: "El nombre del evento es obligatorio." },
      });
      const creado = await pedir("POST", "/api/buffet/events", {
        como,
        org,
        body: { nombre: `${MARCA} Feria ${sufijo}`, fecha: "2026-11-15" },
      });
      expect(creado).toMatchObject({
        status: 201,
        body: {
          nombre: `${MARCA} Feria ${sufijo}`,
          fecha: "2026-11-15",
          estado: "abierto",
          sales_count: 0,
          total_amount: 0,
        },
      });
      eventoId = creado.body.id;
    });

    it("una venta sin ítems o sin evento se rechaza", async () => {
      const vender = (body: unknown) => pedir("POST", "/api/buffet/sales", { como, org, body });
      const item = { product_id: productoId, quantity: 1, unit_price: 1000 };
      expect(await vender({ event_id: eventoId, items: [] })).toMatchObject({
        status: 400,
        body: { error: "La venta debe tener al menos un ítem." },
      });
      expect(await vender({ items: [item] })).toMatchObject({
        status: 400,
        body: { error: "Falta el evento." },
      });
      expect((await vender({ event_id: UUID_INEXISTENTE, items: [item] })).status).toBe(400);
      expect(await stockDe(productoId)).toBe(10);
    });

    it("la venta calcula el total en el servidor y descuenta el stock", async () => {
      const res = await pedir("POST", "/api/buffet/sales", {
        como,
        org,
        body: {
          event_id: eventoId,
          // El total que manda el cliente no cuenta.
          total_amount: 1,
          items: [
            { product_id: productoId, description: "Vendible", quantity: 3, unit_price: 1000, line_total: 1 },
          ],
        },
      });
      expect(res).toMatchObject({ status: 201, body: { id: expect.any(String), total_amount: 3000 } });
      ventaId = res.body.id;
      expect(await stockDe(productoId)).toBe(7);
    });

    it("el listado de ventas del evento trae ítems y resumen; el evento suma lo vendido", async () => {
      const { body } = await pedir("GET", `/api/buffet/sales?event_id=${eventoId}`, { como, org });
      expect(body.summary).toEqual({ sales_count: 1, total_amount: 3000 });
      expect(body.sales[0]).toMatchObject({
        id: ventaId,
        event_id: eventoId,
        payment_method: "efectivo",
        total_amount: 3000,
        items_count: 1,
      });
      expect(body.sales[0].items[0]).toMatchObject({ product_id: productoId, quantity: 3, line_total: 3000 });

      const eventos = await pedir("GET", `/api/buffet/events?q=${encodeURIComponent(`Feria ${sufijo}`)}`, {
        como,
        org,
      });
      expect(eventos.body).toHaveLength(1);
      expect(eventos.body[0]).toMatchObject({ id: eventoId, sales_count: 1, total_amount: 3000 });
    });

    it("editar la venta devuelve el stock viejo y descuenta el nuevo", async () => {
      const res = await pedir("PATCH", `/api/buffet/sales/${ventaId}`, {
        como,
        org,
        body: {
          payment_method: "transferencia",
          items: [{ product_id: productoId, quantity: 5, unit_price: 1000 }],
        },
      });
      expect(res).toMatchObject({ status: 200, body: { id: ventaId, total_amount: 5000 } });
      expect(await stockDe(productoId)).toBe(5);
      expect(
        (
          await pedir("PATCH", `/api/buffet/sales/${UUID_INEXISTENTE}`, {
            como,
            org,
            body: { items: [{ product_id: productoId, quantity: 1, unit_price: 1 }] },
          })
        ).status,
      ).toBe(404);
    });

    it("un evento con ventas no se puede borrar; sin ventas sí", async () => {
      expect(await pedir("DELETE", `/api/buffet/events/${eventoId}`, { como, org })).toMatchObject({
        status: 400,
        body: { error: "El evento tiene ventas cargadas. Eliminá las ventas primero." },
      });

      expect((await pedir("DELETE", `/api/buffet/sales/${ventaId}`, { como, org })).body).toEqual({
        ok: true,
      });
      expect(await stockDe(productoId)).toBe(10);

      expect(
        (await pedir("PATCH", `/api/buffet/events/${eventoId}`, { como, org, body: { estado: "cerrado" } }))
          .body,
      ).toMatchObject({ id: eventoId, estado: "cerrado", nombre: `${MARCA} Feria ${sufijo}` });
      expect((await pedir("DELETE", `/api/buffet/events/${eventoId}`, { como, org })).body).toEqual({
        ok: true,
      });
      expect(
        (await pedir("PATCH", `/api/buffet/events/${eventoId}`, { como, org, body: { estado: "abierto" } }))
          .status,
      ).toBe(404);
    });
  });
});
