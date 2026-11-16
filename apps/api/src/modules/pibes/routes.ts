import { esFechaISO, pibeCrearSchema, pibeEditarSchema, pibesBusquedaQuerySchema, uuid } from "@garay/shared";
import { Hono } from "hono";
import { z } from "zod";
import { noEncontrado } from "../../lib/errores";
import { soloDefinidos } from "../../lib/objetos";
import { datos, db, rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import type { AppEnv } from "../../tipos";
import { aPibe, aPibeDeBusqueda, etiquetaDeGrado, type FilaDeBusqueda } from "./mappers";

// ========================================================
// PIBES: catálogos (grados y categorías), búsqueda, alta, ficha y edición.
// ========================================================

const LIMITE_DE_BUSQUEDA = 100;

/** Columnas de un pibe con su grado y su categoría, para armar la forma común. */
export const COLUMNAS_DE_PIBE = `id, nombre, apellido, entrego_ficha, observaciones, telefono_emergencia,
  grado:grados_pibes(id, nivel, grado), edad:edades(id, nombre)`;

const idParam = validar("param", z.object({ id: uuid }));

/** La búsqueda usa or/ilike en SQL: se sacan los caracteres con significado ahí. */
const limpiarTermino = (termino: string) => termino.replace(/[%,()]/g, "").trim();

export const catalogosRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const [edades, grados] = await Promise.all([
    // Las categorías son de cada organización.
    db.from("edades").select("id, nombre").eq("organizacion_id", c.var.organizacionId).order("nombre"),
    db.from("grados_pibes").select("id, nivel, grado").order("nivel").order("grado"),
  ]);
  // Catálogos sin pantalla de edición: se pueden cachear en el navegador. Vary
  // evita servirle a una organización los de otra.
  c.header("Cache-Control", "private, max-age=300");
  c.header("Vary", "Authorization, X-Organization-Id");
  return c.json({
    edades: datos(edades),
    grados: datos(grados).map((grado) => ({ id: grado.id, label: etiquetaDeGrado(grado) })),
  });
});

export const pibesRoutes = new Hono<AppEnv>()
  // Una sola consulta: filtra por organización, busca por palabras (sin tildes,
  // en cualquier orden) y devuelve visitas, última asistencia y si ya tiene el
  // presente de `date`.
  .get("/search", validar("query", pibesBusquedaQuerySchema), async (c) => {
    const { q, date } = c.req.valid("query");
    if (!q?.trim()) return c.json([]);

    const fecha = esFechaISO(date) ? date : null;
    const filas = await rpc<FilaDeBusqueda[] | null>("buscar_pibes_resumen", {
      p_org: c.var.organizacionId,
      p_termino: limpiarTermino(q),
      p_fecha: fecha,
      p_limite: LIMITE_DE_BUSQUEDA,
    });
    return c.json((filas ?? []).map((fila) => aPibeDeBusqueda(fila, fecha !== null)));
  })

  .post("/", validar("json", pibeCrearSchema), async (c) => {
    const org = c.var.organizacionId;
    const { fecha, ...pibe } = c.req.valid("json");

    const creado = datos(
      await db
        .from("pibes")
        .insert({ ...pibe, organizacion_id: org })
        .select("id")
        .single(),
    );
    // Alta desde la pantalla de ingreso: queda presente ese mismo día.
    if (fecha) {
      datos(await db.from("asistencias").insert({ pibe_id: creado.id, fecha, organizacion_id: org }));
    }
    return c.json({ ok: true, id: creado.id });
  })

  .get("/:id", idParam, async (c) => {
    const org = c.var.organizacionId;
    const { id } = c.req.valid("param");

    const [pibe, visitas, ultima] = await Promise.all([
      db.from("pibes").select(COLUMNAS_DE_PIBE).eq("id", id).eq("organizacion_id", org).maybeSingle(),
      db
        .from("asistencias")
        .select("id", { count: "exact", head: true })
        .eq("pibe_id", id)
        .eq("organizacion_id", org),
      db
        .from("asistencias")
        .select("fecha")
        .eq("pibe_id", id)
        .eq("organizacion_id", org)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const fila = datos(pibe);
    if (!fila) throw noEncontrado("Pibe no encontrado");
    datos(visitas);
    return c.json({
      ...aPibe(fila),
      visitas: visitas.count || 0,
      ultima_asistencia: datos(ultima)?.fecha || null,
    });
  })

  .patch("/:id", idParam, validar("json", pibeEditarSchema), async (c) => {
    const { id } = c.req.valid("param");
    const cambios = soloDefinidos(c.req.valid("json"));
    const tabla = db.from("pibes");
    const filas = datos(
      await (Object.keys(cambios).length ? tabla.update(cambios).select("id") : tabla.select("id"))
        .eq("id", id)
        .eq("organizacion_id", c.var.organizacionId),
    );
    if (!filas.length) throw noEncontrado("Pibe no encontrado");
    return c.json({ ok: true });
  });
