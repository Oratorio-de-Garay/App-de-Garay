import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { requireAllowedUser } from "./auth.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());
app.use(cors());

// Servir archivos del frontend
app.use(
  express.static(
    path.join(__dirname, "../../frontend")
  )
);

// Conexión a Supabase.
// Se usa la service role key (no la anon) porque estas rutas ya están
// protegidas por requireAllowedUser, y las tablas de buffet tienen RLS
// con políticas "to authenticated": con la clave anon el cliente actúa
// como rol anon y Supabase rechaza los INSERT/UPDATE por RLS.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

// Every /api route requires a signed-in, allowlisted Google account,
// except the health check (used for uptime monitoring).
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  return requireAllowedUser(req, res, next);
});

// ─────────────────────────────────────────────────────────
// Confirms the caller's token is valid and allowlisted.
// The frontend calls this right after Google sign-in.
// ─────────────────────────────────────────────────────────
app.get("/api/auth/me", (req, res) => {
  res.json({
    email: req.user.email,
    organizacion_id: req.user.organizationId,
    organizations: req.user.organizations,
  });
});

// ========================================================
// BUFFET
// ========================================================

app.get("/api/buffet/meta", async (req, res) => {
  try {
    const org = req.user.organizationId;
    const [categoriesRes, unitsRes, suppliersRes] = await Promise.all([
      // Las categorías sin organización son globales y las ven todas.
      supabase.from("buffet_categories").select("id, name, active").or(`organizacion_id.is.null,organizacion_id.eq.${org}`).order("name"),
      // buffet_units es un catálogo global: no se filtra.
      supabase.from("buffet_units").select("id, name, abbreviation, pack_size, active").order("name"),
      supabase.from("buffet_suppliers").select("id, name, active").eq("organizacion_id", org).order("name"),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (unitsRes.error) throw unitsRes.error;
    if (suppliersRes.error) throw suppliersRes.error;

    res.json({
      categories: categoriesRes.data,
      units: unitsRes.data,
      suppliers: suppliersRes.data,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/buffet/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("buffet_products")
      .select(`
        id, name, stock_current, sale_price, observation, active, is_donated,
        category_id, unit_id,
        buffet_categories(name),
        buffet_units(name, abbreviation, pack_size)
      `)
      .eq("organizacion_id", req.user.organizationId)
      .order("name");
    if (error) throw error;
    res.json((data || []).map((row) => ({
      id: row.id,
      name: row.name,
      stock_current: row.stock_current,
      sale_price: row.sale_price,
      observation: row.observation,
      active: row.active,
      is_donated: row.is_donated,
      category_id: row.category_id,
      unit_id: row.unit_id,
      category_name: row.buffet_categories?.name || null,
      unit_name: row.buffet_units?.name || null,
      unit_abbreviation: row.buffet_units?.abbreviation || null,
      pack_size: row.buffet_units?.pack_size || 1,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/buffet/products", async (req, res) => {
  try {
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_products")
      .insert({
        name: payload.name,
        category_id: payload.category_id || null,
        unit_id: payload.unit_id || null,
        stock_current: payload.stock_current ?? 0,
        sale_price: payload.sale_price ?? 0,
        observation: payload.observation || null,
        active: payload.active ?? true,
        is_donated: payload.is_donated ?? false,
        organizacion_id: req.user.organizationId,
      })
      .select("id")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/buffet/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_products")
      .update({
        name: payload.name,
        category_id: payload.category_id || null,
        unit_id: payload.unit_id || null,
        stock_current: payload.stock_current ?? 0,
        sale_price: payload.sale_price ?? 0,
        observation: payload.observation || null,
        active: payload.active ?? true,
        is_donated: payload.is_donated ?? false,
      })
      // El filtro por organización va además del id: sin él, conociendo un UUID
      // se podría editar una fila de otra organización.
      .eq("id", id)
      .eq("organizacion_id", req.user.organizationId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/buffet/products/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("buffet_products")
      .delete()
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/buffet/combos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("buffet_combos")
      .select("id, name, description, sale_price, active")
      .eq("organizacion_id", req.user.organizationId)
      .order("name");
    if (error) throw error;
    const combos = await Promise.all((data || []).map(async (row) => {
      const { count } = await supabase
        .from("buffet_combo_items")
        .select("*", { count: "exact", head: true })
        .eq("combo_id", row.id)
        .eq("organizacion_id", req.user.organizationId);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        sale_price: row.sale_price,
        active: row.active,
        items_count: count || 0,
      };
    }));
    res.json(combos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/buffet/combos", async (req, res) => {
  try {
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_combos")
      .insert({
        name: payload.name,
        description: payload.description || null,
        sale_price: payload.sale_price ?? 0,
        active: payload.active ?? true,
        organizacion_id: req.user.organizationId,
      })
      .select("id")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/buffet/combos/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_combos")
      .update({
        name: payload.name,
        description: payload.description || null,
        sale_price: payload.sale_price ?? 0,
        active: payload.active ?? true,
      })
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Combo no encontrado" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/buffet/combos/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("buffet_combos")
      .delete()
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/buffet/budgets", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("buffet_budgets")
      .select("id, title, client_name, observation, status, total_amount")
      .eq("organizacion_id", req.user.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const budgets = await Promise.all((data || []).map(async (row) => {
      const { count } = await supabase
        .from("buffet_budget_items")
        .select("*", { count: "exact", head: true })
        .eq("budget_id", row.id)
        .eq("organizacion_id", req.user.organizationId);
      return {
        id: row.id,
        title: row.title,
        client_name: row.client_name,
        observation: row.observation,
        status: row.status,
        total_amount: row.total_amount,
        items_count: count || 0,
      };
    }));
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/buffet/budgets", async (req, res) => {
  try {
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_budgets")
      .insert({
        title: payload.title,
        client_name: payload.client_name || null,
        observation: payload.observation || null,
        status: payload.status || "borrador",
        total_amount: payload.total_amount ?? 0,
        organizacion_id: req.user.organizationId,
      })
      .select("id")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/buffet/budgets/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const { data, error } = await supabase
      .from("buffet_budgets")
      .update({
        title: payload.title,
        client_name: payload.client_name || null,
        observation: payload.observation || null,
        status: payload.status || "borrador",
        total_amount: payload.total_amount ?? 0,
      })
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Presupuesto no encontrado" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/buffet/budgets/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("buffet_budgets")
      .delete()
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// EVENTOS Y VENTAS
// ─────────────────────────────────────────────────────────

/**
 * Un evento ("Feria del plato 29/08/2026") agrupa todas las ventas de esa
 * jornada. Se crea una vez y después se le cargan las ventas de a una.
 */
app.get("/api/buffet/events", async (req, res) => {
  try {
    let query = supabase
      .from("buffet_eventos")
      .select("id, nombre, fecha, estado, observacion, buffet_sales(id, total_amount)")
      .eq("organizacion_id", req.user.organizationId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (req.query.q) query = query.ilike("nombre", `%${req.query.q}%`);

    const { data, error } = await query;
    if (error) throw error;

    const events = (data || []).map((row) => {
      const sales = row.buffet_sales || [];
      return {
        id: row.id,
        nombre: row.nombre,
        fecha: row.fecha,
        estado: row.estado,
        observacion: row.observacion,
        sales_count: sales.length,
        total_amount: Number(sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0).toFixed(2)),
      };
    });

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/buffet/events", async (req, res) => {
  try {
    const payload = req.body || {};
    const nombre = (payload.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "El nombre del evento es obligatorio." });

    const { data, error } = await supabase
      .from("buffet_eventos")
      .insert({
        nombre,
        fecha: payload.fecha || new Date().toISOString().slice(0, 10),
        estado: payload.estado || "abierto",
        observacion: payload.observacion || null,
        organizacion_id: req.user.organizationId,
      })
      .select("id, nombre, fecha, estado, observacion")
      .single();
    if (error) throw error;

    res.status(201).json({ ...data, sales_count: 0, total_amount: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/buffet/events/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const updates = {};
    if (payload.nombre !== undefined) {
      const nombre = (payload.nombre || "").trim();
      if (!nombre) return res.status(400).json({ error: "El nombre del evento es obligatorio." });
      updates.nombre = nombre;
    }
    if (payload.fecha !== undefined) updates.fecha = payload.fecha;
    if (payload.estado !== undefined) updates.estado = payload.estado;
    if (payload.observacion !== undefined) updates.observacion = payload.observacion || null;

    const { data, error } = await supabase
      .from("buffet_eventos")
      .update(updates)
      .eq("id", req.params.id)
      .eq("organizacion_id", req.user.organizationId)
      .select("id, nombre, fecha, estado, observacion")
      .single();
    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/buffet/events/:id", async (req, res) => {
  try {
    const org = req.user.organizationId;

    // El borrado en cascada se llevaría las ventas sin devolver el stock, así
    // que se pide vaciar el evento primero.
    const { data: sales, error: salesError } = await supabase
      .from("buffet_sales")
      .select("id")
      .eq("event_id", req.params.id)
      .eq("organizacion_id", org)
      .limit(1);
    if (salesError) throw salesError;
    if ((sales || []).length) {
      return res.status(400).json({ error: "El evento tiene ventas cargadas. Eliminá las ventas primero." });
    }

    const { error } = await supabase
      .from("buffet_eventos")
      .delete()
      .eq("id", req.params.id)
      .eq("organizacion_id", org);
    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/**
 * Traduce los ítems de una venta a un descuento (sign = -1) o devolución
 * (sign = +1) de stock por producto. Los combos se expanden a sus productos.
 * Se permite stock negativo a propósito: en las ferias del plato los productos
 * son donaciones y normalmente no tienen stock cargado.
 */
async function applyStockDelta(items, sign, organizationId) {
  const deltas = new Map();

  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    if (!quantity) continue;

    if (item.product_id) {
      deltas.set(item.product_id, (deltas.get(item.product_id) || 0) + sign * quantity);
      continue;
    }

    if (item.combo_id) {
      const { data, error } = await supabase
        .from("buffet_combo_items")
        .select("product_id, quantity")
        .eq("combo_id", item.combo_id)
        .eq("organizacion_id", organizationId);
      if (error) throw error;
      for (const comboItem of data || []) {
        const total = sign * quantity * (Number(comboItem.quantity) || 0);
        deltas.set(comboItem.product_id, (deltas.get(comboItem.product_id) || 0) + total);
      }
    }
  }

  if (!deltas.size) return;

  const { data: products, error: readError } = await supabase
    .from("buffet_products")
    .select("id, stock_current")
    .in("id", [...deltas.keys()])
    .eq("organizacion_id", organizationId);
  if (readError) throw readError;

  for (const product of products || []) {
    const next = Number(product.stock_current || 0) + deltas.get(product.id);
    const { error } = await supabase
      .from("buffet_products")
      .update({ stock_current: next })
      .eq("id", product.id)
      .eq("organizacion_id", organizationId);
    if (error) throw error;
  }
}

/**
 * Normaliza los ítems del cliente y recalcula los totales en el servidor.
 * Cantidades y precios se manejan en enteros: no se venden medias porciones ni
 * se cobran centavos en una feria del plato.
 */
function normalizeSaleItems(rawItems) {
  const items = (rawItems || [])
    .map((item) => {
      const quantity = Math.round(Number(item.quantity) || 0);
      const unitPrice = Math.round(Number(item.unit_price) || 0);
      return {
        product_id: item.product_id || null,
        combo_id: item.combo_id || null,
        description: item.description || "Sin descripción",
        quantity,
        unit_price: unitPrice,
        line_total: Number((quantity * unitPrice).toFixed(2)),
      };
    })
    .filter((item) => item.quantity > 0 && (item.product_id || item.combo_id));

  const total = Number(items.reduce((acc, item) => acc + item.line_total, 0).toFixed(2));
  return { items, total };
}

app.get("/api/buffet/sales", async (req, res) => {
  try {
    let query = supabase
      .from("buffet_sales")
      .select(`
        id, sale_date, event_id, event_name, payment_method, observation, total_amount, created_at,
        buffet_sale_items(id, product_id, combo_id, description, quantity, unit_price, line_total)
      `)
      // Filtrar la cabecera alcanza: el select anidado de ítems ya queda acotado.
      .eq("organizacion_id", req.user.organizationId)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (req.query.event_id) query = query.eq("event_id", req.query.event_id);
    if (req.query.from) query = query.gte("sale_date", req.query.from);
    if (req.query.to) query = query.lte("sale_date", req.query.to);
    if (req.query.event) query = query.ilike("event_name", `%${req.query.event}%`);

    const { data, error } = await query;
    if (error) throw error;

    const sales = (data || []).map((row) => ({
      id: row.id,
      sale_date: row.sale_date,
      created_at: row.created_at,
      event_id: row.event_id,
      event_name: row.event_name,
      payment_method: row.payment_method,
      observation: row.observation,
      total_amount: row.total_amount,
      items: row.buffet_sale_items || [],
      items_count: (row.buffet_sale_items || []).length,
    }));

    res.json({
      sales,
      summary: {
        sales_count: sales.length,
        total_amount: Number(sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0).toFixed(2)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/buffet/sales", async (req, res) => {
  try {
    const payload = req.body || {};
    const org = req.user.organizationId;
    const { items, total } = normalizeSaleItems(payload.items);
    if (!items.length) return res.status(400).json({ error: "La venta debe tener al menos un ítem." });
    if (!payload.event_id) return res.status(400).json({ error: "Falta el evento." });

    // Buscar el evento dentro de la organización valida de paso que sea propio.
    const { data: evento, error: eventoError } = await supabase
      .from("buffet_eventos")
      .select("id, nombre, fecha")
      .eq("id", payload.event_id)
      .eq("organizacion_id", org)
      .maybeSingle();
    if (eventoError) throw eventoError;
    if (!evento) return res.status(400).json({ error: "El evento no existe." });

    const { data: sale, error } = await supabase
      .from("buffet_sales")
      .insert({
        sale_date: payload.sale_date || evento.fecha,
        event_id: evento.id,
        // Snapshot del nombre: el historial sigue legible si el evento se renombra.
        event_name: evento.nombre,
        payment_method: payload.payment_method || "efectivo",
        observation: payload.observation || null,
        total_amount: total,
        organizacion_id: org,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Supabase JS no ofrece transacciones: si algo falla después de crear la
    // cabecera la borramos a mano para no dejar ventas vacías o a medio aplicar.
    try {
      const { error: itemsError } = await supabase
        .from("buffet_sale_items")
        .insert(items.map((item) => ({ ...item, sale_id: sale.id, organizacion_id: org })));
      if (itemsError) throw itemsError;

      await applyStockDelta(items, -1, org);
    } catch (inner) {
      await supabase.from("buffet_sales").delete().eq("id", sale.id).eq("organizacion_id", org);
      throw inner;
    }

    res.status(201).json({ id: sale.id, total_amount: total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/buffet/sales/:id", async (req, res) => {
  try {
    const org = req.user.organizationId;
    const { data: items, error: itemsError } = await supabase
      .from("buffet_sale_items")
      .select("product_id, combo_id, quantity")
      .eq("sale_id", req.params.id)
      .eq("organizacion_id", org);
    if (itemsError) throw itemsError;

    await applyStockDelta(items || [], 1, org);

    const { error } = await supabase
      .from("buffet_sales")
      .delete()
      .eq("id", req.params.id)
      .eq("organizacion_id", org);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ========================================================
// FUNCIONES AUXILIARES
// ========================================================

function sanitizeSearchTerm(term) {
  return term
    .replace(/[%,()]/g, "")
    .trim();
}


function gradoLabel(grado) {
  if (!grado) return null;

  return `${grado.nivel} ${grado.grado}°`;
}


// ========================================================
// LOOKUPS
// Grados y edades
// ========================================================

app.get("/api/lookups", async (req, res) => {
  try {

    const [
      {
        data: edades,
        error: edadesError,
      },

      {
        data: grados,
        error: gradosError,
      },

    ] = await Promise.all([

      supabase
        .from("edades")
        .select("id, nombre")
        .order("nombre"),

      supabase
        .from("grados_pibes")
        .select("id, nivel, grado")
        .order("nivel")
        .order("grado"),

    ]);


    if (edadesError) {
      throw edadesError;
    }


    if (gradosError) {
      throw gradosError;
    }


    res.json({

      edades,

      grados: grados.map((g) => ({
        id: g.id,
        label: gradoLabel(g),
      })),

    });

  } catch (error) {

    console.error(
      "Lookups error:",
      error
    );

    res.status(500).json({
      error: error.message,
    });
  }
});


// ========================================================
// BUSCAR PIBES
// nombre o apellido
// ========================================================

app.get(
  "/api/students/search",
  async (req, res) => {

    try {

      const { q } = req.query;


      if (
        !q ||
        q.trim().length === 0
      ) {

        return res.json([]);
      }


      const {
        data,
        error,
      } = await supabase

        .rpc(
          "buscar_pibes",
          {
            termino:
              sanitizeSearchTerm(q),
          }
        )

        .select(
          `
          id,
          nombre,
          apellido,
          entrego_ficha,
          observaciones,
          telefono_emergencia,
          grados_pibes (
            id,
            nivel,
            grado
          ),
          edades (
            id,
            nombre
          )
          `
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        );


      if (error) {
        throw error;
      }


      const pibesConVisitas =
        await Promise.all(

          data.map(
            async (pibe) => {

              const {
                count,
                error: visitError,
              } = await supabase

                .from("asistencias")

                .select(
                  "*",
                  {
                    count: "exact",
                    head: true,
                  }
                )

                .eq(
                  "pibe_id",
                  pibe.id
                )

                .eq(
                  "organizacion_id",
                  req.user.organizationId
                );


              if (visitError) {
                throw visitError;
              }
              const {
  data: ultimaAsistencia,
  error: ultimaAsistenciaError,
} = await supabase

  .from("asistencias")

  .select("fecha")

  .eq(
    "pibe_id",
    pibe.id
  )

  .eq(
    "organizacion_id",
    req.user.organizationId
  )

  .order(
    "fecha",
    { ascending: false }
  )

  .limit(1)

  .maybeSingle();


if (ultimaAsistenciaError) {
  throw ultimaAsistenciaError;
}


              return {

                id: pibe.id,

                nombre:
                  pibe.nombre,

                apellido:
                  pibe.apellido,

                nombreCompleto:
                  `${pibe.nombre} ${pibe.apellido}`,

                grado_id:
                  pibe.grados_pibes?.id ??
                  null,

                grado:
                  gradoLabel(
                    pibe.grados_pibes
                  ),

                edad_id:
                  pibe.edades?.id ??
                  null,

                edad:
                  pibe.edades?.nombre ??
                  null,

                ficha:
                  pibe.entrego_ficha,

                obs:
                  pibe.observaciones,

                telefono:
                  pibe.telefono_emergencia,

                visitas:
                  count || 0,

                ultima_asistencia:
  ultimaAsistencia?.fecha ||  null,
              };
            }
          )
        );


      res.json(
        pibesConVisitas
      );

    } catch (error) {

      console.error(
        "Search error:",
        error
      );

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// ========================================================
// CONSULTAR SI YA TIENE PRESENTE EN UNA FECHA
// ========================================================

app.get("/api/attendance/check", async (req, res) => {
  try {
    const { student_id, date } = req.query;

    if (!student_id || !date) {
      return res.status(400).json({
        error: "Missing student_id or date"
      });
    }

    const inicio =
      new Date(`${date}T00:00:00.000Z`);

    const fin =
      new Date(inicio);

    fin.setUTCDate(
      fin.getUTCDate() + 1
    );

    const {
      data,
      error
    } = await supabase
      .from("asistencias")
      .select("id")
      .eq("pibe_id", student_id)
      .eq("organizacion_id", req.user.organizationId)
      .gte("fecha", inicio.toISOString())
      .lt("fecha", fin.toISOString())
      .limit(1);

    if (error) {
      throw error;
    }

    res.json({
      marked:
        Array.isArray(data) &&
        data.length > 0
    });

  } catch (error) {

    console.error(
      "Check attendance error:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
});
// ========================================================
// MARCAR PRESENTE
// ========================================================

app.post(
  "/api/attendance/mark",
  async (req, res) => {

    try {

      const {
        student_id,
        fecha,
      } = req.body;


      if (
        !student_id ||
        !fecha
      ) {

        return res
          .status(400)
          .json({
            error:
              "Missing student_id or fecha",
          });
      }


      // ==================================================
      // EL PIBE TIENE QUE SER DE LA ORGANIZACIÓN ACTIVA.
      // Si no, se podría marcar asistencia sobre un pibe ajeno.
      // ==================================================

      const {
        data: pibeDeLaOrg,
        error: pibeError,
      } = await supabase

        .from("pibes")

        .select("id")

        .eq("id", student_id)

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .maybeSingle();


      if (pibeError) {
        throw pibeError;
      }


      if (!pibeDeLaOrg) {

        return res
          .status(404)
          .json({
            error:
              "El pibe no existe en tu organización",
          });
      }


      // ==================================================
      // COMPROBAR SI YA TIENE PRESENTE ESE DÍA
      // ==================================================

      const inicio =
        new Date(
          `${fecha}T00:00:00.000Z`
        );

      const fin =
        new Date(inicio);

      fin.setUTCDate(
        fin.getUTCDate() + 1
      );


      const {
        data: asistenciaExistente,
        error: buscarError,
      } = await supabase

        .from("asistencias")

        .select("id")

        .eq(
          "pibe_id",
          student_id
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .gte(
          "fecha",
          inicio.toISOString()
        )

        .lt(
          "fecha",
          fin.toISOString()
        )

        .limit(1);


      if (buscarError) {
        throw buscarError;
      }


      // Ya estaba marcado.
      // No insertamos una segunda asistencia.
      if (
        asistenciaExistente &&
        asistenciaExistente.length > 0
      ) {

        return res.json({
          ok: true,
          alreadyMarked: true,
        });
      }


      // ==================================================
      // GUARDAR PRESENTE
      // ==================================================

      const {
        error,
      } = await supabase

        .from("asistencias")

        .insert({
          pibe_id:
            student_id,

          fecha,

          organizacion_id:
            req.user.organizationId,
        });


      if (error) {
        throw error;
      }


      res.json({
        ok: true,
        alreadyMarked: false,
      });


    } catch (error) {

      console.error(
        "Mark attendance error:",
        error
      );


      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);


// ========================================================
// CREAR NUEVO PIBE
// ========================================================

app.post(
  "/api/students",
  async (req, res) => {

    try {

      const {

        nombre,

        apellido,

        grado_id,

        entrego_ficha,

        edad_id,

        telefono_emergencia,

        observaciones,

        fecha,

      } = req.body;


      if (
        !nombre ||
        !apellido ||
        !grado_id ||
        !edad_id
      ) {

        return res
          .status(400)
          .json({
            error:
              "Missing nombre, apellido, grado_id or edad_id",
          });
      }


      const {
        data,
        error,
      } = await supabase

        .from("pibes")

        .insert({

          nombre,

          apellido,

          grado_id,

          edad_id,

          entrego_ficha:
            entrego_ficha === true ||
            entrego_ficha === "Sí" ||
            entrego_ficha === "Si",

          telefono_emergencia:
            telefono_emergencia ||
            null,

          observaciones:
            observaciones ||
            null,

          organizacion_id:
            req.user.organizationId,

        })

        .select();


      if (error) {
        throw error;
      }


      const pibe =
        data[0];


      if (fecha) {

        const {
          error:
            asistenciaError,
        } = await supabase

          .from("asistencias")

          .insert({

            pibe_id:
              pibe.id,

            fecha,

            organizacion_id:
              req.user.organizationId,
          });


        if (asistenciaError) {
          throw asistenciaError;
        }
      }


      res.json({

        ok: true,

        id:
          pibe.id,

      });

    } catch (error) {

      console.error(
        "Create student error:",
        error
      );

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// ========================================================
// OBTENER UN PIBE POR ID
// ========================================================

app.get("/api/students/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: pibe, error } = await supabase
      .from("pibes")
      .select(`
        id,
        nombre,
        apellido,
        entrego_ficha,
        observaciones,
        telefono_emergencia,
        grados_pibes (
          id,
          nivel,
          grado
        ),
        edades (
          id,
          nombre
        )
      `)
      .eq("id", id)
      .eq("organizacion_id", req.user.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!pibe) return res.status(404).json({ error: "Pibe no encontrado" });

    const { count, error: visitError } = await supabase
      .from("asistencias")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("pibe_id", id)
      .eq("organizacion_id", req.user.organizationId);

    if (visitError) throw visitError;

const {
  data: ultimaAsistencia,
  error: ultimaAsistenciaError
} = await supabase
  .from("asistencias")
  .select("fecha")
  .eq("pibe_id", id)
  .eq("organizacion_id", req.user.organizationId)
  .order("fecha", { ascending: false })
  .limit(1)
  .maybeSingle();

if (ultimaAsistenciaError) {
  throw ultimaAsistenciaError;
}

    res.json({
      id: pibe.id,
      nombre: pibe.nombre,
      apellido: pibe.apellido,
      nombreCompleto: `${pibe.nombre} ${pibe.apellido}`,
      grado_id: pibe.grados_pibes?.id ?? null,
      grado: gradoLabel(pibe.grados_pibes),
      edad_id: pibe.edades?.id ?? null,
      edad: pibe.edades?.nombre ?? null,
      ficha: pibe.entrego_ficha,
      obs: pibe.observaciones,
      telefono: pibe.telefono_emergencia,

visitas: count || 0,

ultima_asistencia:
  ultimaAsistencia?.fecha || null
    });

  } catch (error) {
    console.error("Get student error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});
// ========================================================
// EDITAR PIBE
// ficha y observaciones
// ========================================================

app.patch(
  "/api/students/:id",
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;


      const {
        entrego_ficha,
        observaciones,
      } = req.body;


      const updateData = {};


      if (
        entrego_ficha !==
        undefined
      ) {

        updateData.entrego_ficha =

          entrego_ficha === true ||

          entrego_ficha === "Sí" ||

          entrego_ficha === "Si";
      }


      if (
        observaciones !==
        undefined
      ) {

        updateData.observaciones =
          observaciones;
      }


      const {
        data,
        error,
      } = await supabase

        .from("pibes")

        .update(updateData)

        .eq(
          "id",
          id
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .select("id");


      if (error) {
        throw error;
      }


      if (!data || data.length === 0) {

        return res
          .status(404)
          .json({
            error:
              "Pibe no encontrado",
          });
      }


      res.json({
        ok: true,
      });

    } catch (error) {

      console.error(
        "Update student error:",
        error
      );

      res.status(500).json({
        error: error.message,
      });
    }
  }
);


// ========================================================
// HISTORIAL
// OBTENER SOLO FECHAS QUE TENGAN ASISTENCIAS
//
// Ejemplo:
// /api/attendance/dates?year=2026
// ========================================================

app.get(
  "/api/attendance/dates",
  async (req, res) => {

    try {

      const year =
        Number(req.query.year) ||
        new Date().getFullYear();


      const desde =
        `${year}-01-01T00:00:00.000Z`;


      const hasta =
        `${year + 1}-01-01T00:00:00.000Z`;


      const {
        data,
        error,
      } = await supabase

        .from("asistencias")

        .select(
          "fecha, pibe_id"
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .gte(
          "fecha",
          desde
        )

        .lt(
          "fecha",
          hasta
        )

        .order(
          "fecha",
          {
            ascending: false,
          }
        );


      if (error) {
        throw error;
      }


      // Agrupamos las asistencias por día
      const fechas = {};


      for (
        const asistencia
        of data || []
      ) {

        if (
          !asistencia.fecha
        ) {
          continue;
        }


        const fecha =
          String(
            asistencia.fecha
          ).slice(
            0,
            10
          );


        if (
          !fechas[fecha]
        ) {

          fechas[fecha] = {

            fecha,

            total: 0,

            pibes:
              new Set(),

          };
        }


        // Evita contar dos veces
        // al mismo chico el mismo día
        if (
          asistencia.pibe_id
        ) {

          fechas[
            fecha
          ].pibes.add(
            asistencia.pibe_id
          );
        }
      }


      const resultado =
        Object.values(
          fechas
        )

          .map(
            (item) => ({

              fecha:
                item.fecha,

              total:
                item.pibes.size,

            })
          )

          .sort(
            (a, b) =>
              b.fecha.localeCompare(
                a.fecha
              )
          );


      res.json(
        resultado
      );

    } catch (error) {

      console.error(
        "Attendance dates error:",
        error
      );

      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

// ========================================================
// TOP 3 DE ASISTENCIA DEL AÑO
// ========================================================

app.get("/api/attendance/top", async (req, res) => {
  try {
    const year =
      Number(req.query.year) ||
      new Date().getFullYear();

    const desde =
      `${year}-01-01T00:00:00.000Z`;

    const hasta =
      `${year + 1}-01-01T00:00:00.000Z`;

    const { data, error } = await supabase
      .from("asistencias")
      .select(`
        fecha,
        pibe_id,
        pibes (
          id,
          nombre,
          apellido
        )
      `)
      .eq("organizacion_id", req.user.organizationId)
      .gte("fecha", desde)
      .lt("fecha", hasta);

    if (error) throw error;

    const contador = {};

    // Evitamos contar dos veces al mismo chico
    // el mismo día si hubiera una asistencia duplicada.
    const asistenciasUnicas = new Set();

    for (const row of data || []) {
      if (!row.pibe_id || !row.fecha) continue;

      const fecha = String(row.fecha).slice(0, 10);

      const clave =
        `${row.pibe_id}-${fecha}`;

      if (asistenciasUnicas.has(clave)) {
        continue;
      }

      asistenciasUnicas.add(clave);

      const pibe =
        Array.isArray(row.pibes)
          ? row.pibes[0]
          : row.pibes;

      if (!pibe) continue;

      if (!contador[pibe.id]) {
        contador[pibe.id] = {
          id: pibe.id,
          nombre: pibe.nombre,
          apellido: pibe.apellido,
          nombreCompleto:
            `${pibe.nombre} ${pibe.apellido}`,
          total: 0
        };
      }

      contador[pibe.id].total++;
    }

    const top3 =
      Object.values(contador)
        .sort((a, b) => {
          if (b.total !== a.total) {
            return b.total - a.total;
          }

          return a.nombreCompleto.localeCompare(
            b.nombreCompleto,
            "es"
          );
        })
        .slice(0, 3);

    res.json(top3);

  } catch (error) {
    console.error(
      "Top attendance error:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
});
// ========================================================
// HISTORIAL
// LISTAR LOS PIBES PRESENTES EN UNA FECHA
//
// Ejemplo:
// /api/attendance/by-date?date=2026-08-07
// ========================================================

app.get(
  "/api/attendance/by-date",
  async (req, res) => {

    try {

      const {
        date,
      } = req.query;


      if (
        !date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
      ) {

        return res
          .status(400)
          .json({

            error:
              "La fecha debe tener formato YYYY-MM-DD",

          });
      }


      const inicio =
        new Date(
          `${date}T00:00:00.000Z`
        );


      const fin =
        new Date(
          inicio
        );


      fin.setUTCDate(
        fin.getUTCDate() +
        1
      );


      const {

        data:
          asistencias,

        error:
          asistenciasError,

      } = await supabase

        .from("asistencias")

        .select(
          "id, fecha, pibe_id"
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .gte(
          "fecha",
          inicio.toISOString()
        )

        .lt(
          "fecha",
          fin.toISOString()
        )

        .order(
          "fecha",
          {
            ascending: true,
          }
        );


      if (
        asistenciasError
      ) {

        throw asistenciasError;
      }


      if (
        !asistencias ||
        asistencias.length === 0
      ) {

        return res.json([]);
      }


      // Sacamos los IDs
      // y eliminamos duplicados
      const pibeIds = [

        ...new Set(

          asistencias

            .map(
              (a) =>
                a.pibe_id
            )

            .filter(Boolean)
        ),

      ];


      if (
        pibeIds.length === 0
      ) {

        return res.json([]);
      }


      const {

        data:
          pibes,

        error:
          pibesError,

      } = await supabase

        .from("pibes")

        .select(`
          id,
          nombre,
          apellido,
          grado_id,
          edad_id,
          entrego_ficha,
          telefono_emergencia,
          observaciones,
          grados_pibes (
            id,
            nivel,
            grado
          ),
          edades (
            id,
            nombre
          )
        `)

        .in(
          "id",
          pibeIds
        )

        .eq(
          "organizacion_id",
          req.user.organizationId
        )

        .order(
          "apellido",
          {
            ascending: true,
          }
        )

        .order(
          "nombre",
          {
            ascending: true,
          }
        );


      if (
        pibesError
      ) {

        throw pibesError;
      }


      const resultado =

        (pibes || [])

          .map(
            (pibe) => ({

              id:
                pibe.id,

              nombre:
                pibe.nombre,

              apellido:
                pibe.apellido,

              nombreCompleto:
                `${pibe.nombre} ${pibe.apellido}`,

              grado_id:
                pibe.grados_pibes?.id ??
                pibe.grado_id ??
                null,

              grado:
                gradoLabel(
                  pibe.grados_pibes
                ),

              edad_id:
                pibe.edades?.id ??
                pibe.edad_id ??
                null,

              edad:
                pibe.edades?.nombre ??
                null,

              ficha:
                pibe.entrego_ficha,

              telefono:
                pibe.telefono_emergencia,

              obs:
                pibe.observaciones,

            })
          );


      res.json(
        resultado
      );

    } catch (error) {

      console.error(
        "Attendance by date error:",
        error
      );

      res.status(500).json({

        error:
          error.message,

      });
    }
  }
);


// ========================================================
// HEALTH CHECK
// ========================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      status: "ok",
    });
  }
);


// ========================================================
// INICIAR SERVIDOR
// ========================================================

const PORT =
  process.env.PORT ||
  3000;


app.listen(
  PORT,
  () => {

    console.log(
      `API server running on http://localhost:${PORT}`
    );
  }
);


export default app;
