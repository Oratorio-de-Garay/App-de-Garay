import {
  comboSchema,
  eventoCrearSchema,
  eventoEditarSchema,
  eventosQuerySchema,
  normalizarItemsVenta,
  presupuestoSchema,
  productoSchema,
  uuid,
  ventaCrearSchema,
  ventaEditarSchema,
  ventasQuerySchema,
} from "@garay/shared";
import { Hono } from "hono";
import { z } from "zod";
import { noEncontrado, pedidoInvalido } from "../../lib/errores";
import { soloDefinidos } from "../../lib/objetos";
import { datos, db, rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import type { AppEnv } from "../../tipos";
import { crudDeCatalogo } from "./crud";

// ========================================================
// BUFFET: catálogo (productos, combos, presupuestos), eventos y ventas.
// Todas las rutas operan sobre la organización activa (c.var.organizacionId).
// ========================================================

const idParam = validar("param", z.object({ id: uuid }));

const productos = crudDeCatalogo("buffet_products", "Producto no encontrado");
const combos = crudDeCatalogo("buffet_combos", "Combo no encontrado");
const presupuestos = crudDeCatalogo("buffet_budgets", "Presupuesto no encontrado");

const sumar = (montos: readonly (number | null)[]) =>
  Number(montos.reduce<number>((acc, monto) => acc + Number(monto || 0), 0).toFixed(2));

/** Sólo comodines de LIKE: el resto del texto se busca literal. */
const patron = (texto: string) => `%${texto.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export const buffetRoutes = new Hono<AppEnv>()
  // Catálogos de apoyo para los formularios. Cambian muy poco.
  .get("/meta", async (c) => {
    const org = c.var.organizacionId;
    const [categories, units, suppliers] = await Promise.all([
      // Las categorías sin organización son globales y las ven todas.
      db
        .from("buffet_categories")
        .select("id, name, active")
        .or(`organizacion_id.is.null,organizacion_id.eq.${org}`)
        .order("name"),
      // buffet_units es un catálogo global: no se filtra.
      db.from("buffet_units").select("id, name, abbreviation, pack_size, active").order("name"),
      db.from("buffet_suppliers").select("id, name, active").eq("organizacion_id", org).order("name"),
    ]);
    return c.json({ categories: datos(categories), units: datos(units), suppliers: datos(suppliers) });
  })

  // ── Productos ───────────────────────────────────────────
  .get("/products", async (c) => {
    const filas = datos(
      await db
        .from("buffet_products")
        .select(
          `id, name, stock_current, sale_price, observation, active, is_donated, category_id, unit_id,
           buffet_categories(name), buffet_units(name, abbreviation, pack_size)`,
        )
        .eq("organizacion_id", c.var.organizacionId)
        .order("name"),
    );
    return c.json(
      filas.map(({ buffet_categories: categoria, buffet_units: unidad, ...producto }) => ({
        ...producto,
        category_name: categoria?.name || null,
        unit_name: unidad?.name || null,
        unit_abbreviation: unidad?.abbreviation || null,
        pack_size: unidad?.pack_size || 1,
      })),
    );
  })
  .post("/products", validar("json", productoSchema), async (c) =>
    c.json(await productos.crear(c.var.organizacionId, c.req.valid("json")), 201),
  )
  .patch("/products/:id", idParam, validar("json", productoSchema), async (c) =>
    c.json(await productos.editar(c.var.organizacionId, c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/products/:id", idParam, async (c) => {
    await productos.borrar(c.var.organizacionId, c.req.valid("param").id);
    return c.json({ ok: true });
  })

  // ── Combos ──────────────────────────────────────────────
  .get("/combos", async (c) => {
    // El conteo de ítems viaja embebido: una sola consulta en vez de una por combo.
    const filas = datos(
      await db
        .from("buffet_combos")
        .select("id, name, description, sale_price, active, buffet_combo_items(count)")
        .eq("organizacion_id", c.var.organizacionId)
        .order("name"),
    );
    return c.json(
      filas.map(({ buffet_combo_items: items, ...combo }) => ({
        ...combo,
        items_count: items[0]?.count || 0,
      })),
    );
  })
  .post("/combos", validar("json", comboSchema), async (c) =>
    c.json(await combos.crear(c.var.organizacionId, c.req.valid("json")), 201),
  )
  .patch("/combos/:id", idParam, validar("json", comboSchema), async (c) =>
    c.json(await combos.editar(c.var.organizacionId, c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/combos/:id", idParam, async (c) => {
    await combos.borrar(c.var.organizacionId, c.req.valid("param").id);
    return c.json({ ok: true });
  })

  // ── Presupuestos ────────────────────────────────────────
  .get("/budgets", async (c) => {
    const filas = datos(
      await db
        .from("buffet_budgets")
        .select("id, title, client_name, observation, status, total_amount, buffet_budget_items(count)")
        .eq("organizacion_id", c.var.organizacionId)
        .order("created_at", { ascending: false }),
    );
    return c.json(
      filas.map(({ buffet_budget_items: items, ...presupuesto }) => ({
        ...presupuesto,
        items_count: items[0]?.count || 0,
      })),
    );
  })
  .post("/budgets", validar("json", presupuestoSchema), async (c) =>
    c.json(await presupuestos.crear(c.var.organizacionId, c.req.valid("json")), 201),
  )
  .patch("/budgets/:id", idParam, validar("json", presupuestoSchema), async (c) =>
    c.json(await presupuestos.editar(c.var.organizacionId, c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/budgets/:id", idParam, async (c) => {
    await presupuestos.borrar(c.var.organizacionId, c.req.valid("param").id);
    return c.json({ ok: true });
  })

  // ── Eventos ─────────────────────────────────────────────
  // Un evento ("Feria del plato 29/08/2026") agrupa las ventas de una jornada.
  .get("/events", validar("query", eventosQuerySchema), async (c) => {
    let consulta = db
      .from("buffet_eventos")
      .select("id, nombre, fecha, estado, observacion, buffet_sales(id, total_amount)")
      .eq("organizacion_id", c.var.organizacionId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    const { q } = c.req.valid("query");
    if (q) consulta = consulta.ilike("nombre", patron(q));

    return c.json(
      datos(await consulta).map(({ buffet_sales: ventas, ...evento }) => ({
        ...evento,
        sales_count: ventas.length,
        total_amount: sumar(ventas.map((venta) => venta.total_amount)),
      })),
    );
  })
  .post("/events", validar("json", eventoCrearSchema), async (c) => {
    const { fecha, ...evento } = c.req.valid("json");
    const creado = datos(
      await db
        .from("buffet_eventos")
        .insert({
          ...evento,
          fecha: fecha ?? new Date().toISOString().slice(0, 10),
          organizacion_id: c.var.organizacionId,
        })
        .select("id, nombre, fecha, estado, observacion")
        .single(),
    );
    return c.json({ ...creado, sales_count: 0, total_amount: 0 }, 201);
  })
  .patch("/events/:id", idParam, validar("json", eventoEditarSchema), async (c) => {
    const cambios = soloDefinidos(c.req.valid("json"));
    const { id } = c.req.valid("param");
    const columnas = "id, nombre, fecha, estado, observacion";
    const tabla = db.from("buffet_eventos");
    // Sin cambios no hay nada que actualizar: se devuelve el evento como está.
    const evento = datos(
      await (Object.keys(cambios).length ? tabla.update(cambios).select(columnas) : tabla.select(columnas))
        .eq("id", id)
        .eq("organizacion_id", c.var.organizacionId)
        .maybeSingle(),
    );
    if (!evento) throw noEncontrado("Evento no encontrado");
    return c.json(evento);
  })
  .delete("/events/:id", idParam, async (c) => {
    const org = c.var.organizacionId;
    const { id } = c.req.valid("param");

    // El borrado en cascada se llevaría las ventas sin devolver el stock, así
    // que se pide vaciar el evento primero.
    const ventas = datos(
      await db.from("buffet_sales").select("id").eq("event_id", id).eq("organizacion_id", org).limit(1),
    );
    if (ventas.length) throw pedidoInvalido("El evento tiene ventas cargadas. Eliminá las ventas primero.");

    datos(await db.from("buffet_eventos").delete().eq("id", id).eq("organizacion_id", org));
    return c.json({ ok: true });
  })

  // ── Ventas ──────────────────────────────────────────────
  // El descuento y la devolución de stock (expandiendo combos) los hacen en
  // SQL, de forma atómica, buffet_crear_venta / buffet_editar_venta /
  // buffet_borrar_venta. Se permite stock negativo a propósito: en las ferias
  // los productos son donaciones y normalmente no tienen stock cargado.
  .get("/sales", validar("query", ventasQuerySchema), async (c) => {
    const filtros = c.req.valid("query");
    let consulta = db
      .from("buffet_sales")
      .select(
        `id, sale_date, event_id, event_name, payment_method, observation, total_amount, created_at,
         buffet_sale_items(id, product_id, combo_id, description, quantity, unit_price, line_total)`,
      )
      // Filtrar la cabecera alcanza: el select anidado de ítems ya queda acotado.
      .eq("organizacion_id", c.var.organizacionId)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros.event_id) consulta = consulta.eq("event_id", filtros.event_id);
    if (filtros.from) consulta = consulta.gte("sale_date", filtros.from);
    if (filtros.to) consulta = consulta.lte("sale_date", filtros.to);
    if (filtros.event) consulta = consulta.ilike("event_name", patron(filtros.event));

    const sales = datos(await consulta).map(({ buffet_sale_items: items, ...venta }) => ({
      ...venta,
      items,
      items_count: items.length,
    }));
    return c.json({
      sales,
      summary: { sales_count: sales.length, total_amount: sumar(sales.map((venta) => venta.total_amount)) },
    });
  })
  .post("/sales", validar("json", ventaCrearSchema), async (c) => {
    const venta = c.req.valid("json");
    const { items, total } = normalizarItemsVenta(venta.items);
    if (!items.length) throw pedidoInvalido("La venta debe tener al menos un ítem.");
    if (!venta.event_id) throw pedidoInvalido("Falta el evento.");

    // Una sola transacción en la base: valida que el evento sea de la
    // organización, crea la venta y los ítems y descuenta el stock.
    const creada = await rpc<{ id: string } | null>("buffet_crear_venta", {
      p_org: c.var.organizacionId,
      p_event_id: venta.event_id,
      p_sale_date: venta.sale_date,
      p_payment_method: venta.payment_method,
      p_observation: venta.observation,
      p_total: total,
      p_items: items,
    });
    if (!creada) throw pedidoInvalido("El evento no existe.");
    return c.json({ id: creada.id, total_amount: total }, 201);
  })
  .patch("/sales/:id", idParam, validar("json", ventaEditarSchema), async (c) => {
    const venta = c.req.valid("json");
    const { id } = c.req.valid("param");
    const { items, total } = normalizarItemsVenta(venta.items);
    if (!items.length) throw pedidoInvalido("La venta debe tener al menos un ítem.");

    // Reemplaza el carrito entero dentro de una transacción (devuelve el stock
    // de los ítems viejos y descuenta el de los nuevos).
    const editada = await rpc<unknown>("buffet_editar_venta", {
      p_org: c.var.organizacionId,
      p_sale: id,
      p_payment_method: venta.payment_method,
      p_observation: venta.observation,
      p_total: total,
      p_items: items,
    });
    if (!editada) throw noEncontrado("La venta no existe.");
    return c.json({ id, total_amount: total });
  })
  .delete("/sales/:id", idParam, async (c) => {
    await rpc("buffet_borrar_venta", { p_org: c.var.organizacionId, p_sale: c.req.valid("param").id });
    return c.json({ ok: true });
  });
