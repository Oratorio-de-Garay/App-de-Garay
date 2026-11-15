import {
  anioQuerySchema,
  asistenciaCheckQuerySchema,
  asistenciaPorFechaQuerySchema,
  asistenciaSchema,
  rangoDiaUTC,
} from "@garay/shared";
import { Hono } from "hono";
import { noEncontrado } from "../../lib/errores";
import { datos, db, rpc } from "../../lib/supabase";
import { validar } from "../../lib/validar";
import type { AppEnv } from "../../tipos";
import { aPibe } from "../pibes/mappers";
import { COLUMNAS_DE_PIBE } from "../pibes/routes";

// ========================================================
// ASISTENCIA: marcar y desmarcar el presente, e historial.
//
// Un presente es una fila en `asistencias` con un instante; "el día" es
// siempre el día UTC de ese instante (rangoDiaUTC), igual que en las funciones
// SQL asistencia_fechas y asistencia_top. Un pibe cuenta una vez por día.
// ========================================================

/** Id de la asistencia de un pibe en un día, o null. */
async function asistenciaDelDia(org: string, pibeId: string, fecha: string): Promise<string | null> {
  const { desde, hasta } = rangoDiaUTC(fecha);
  const filas = datos(
    await db
      .from("asistencias")
      .select("id")
      .eq("pibe_id", pibeId)
      .eq("organizacion_id", org)
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .limit(1),
  );
  return filas[0]?.id ?? null;
}

/**
 * Verifica que el pibe sea de la organización y trae su asistencia del día,
 * las dos cosas a la vez (una espera menos).
 */
async function pibeYAsistencia(org: string, pibeId: string, fecha: string): Promise<string | null> {
  const [pibe, asistenciaId] = await Promise.all([
    db.from("pibes").select("id").eq("id", pibeId).eq("organizacion_id", org).maybeSingle(),
    asistenciaDelDia(org, pibeId, fecha),
  ]);
  if (!datos(pibe)) throw noEncontrado("El pibe no existe en tu organización");
  return asistenciaId;
}

const anioPedido = (year: string | undefined) => Number(year) || new Date().getFullYear();

export const asistenciaRoutes = new Hono<AppEnv>()
  .get("/check", validar("query", asistenciaCheckQuerySchema), async (c) => {
    const { student_id, date } = c.req.valid("query");
    return c.json({ marked: (await asistenciaDelDia(c.var.organizacionId, student_id, date)) !== null });
  })

  // Marcar dos veces el mismo día no duplica: por eso es seguro reintentar.
  .post("/mark", validar("json", asistenciaSchema), async (c) => {
    const org = c.var.organizacionId;
    const { student_id, fecha } = c.req.valid("json");

    if (await pibeYAsistencia(org, student_id, fecha)) return c.json({ ok: true, alreadyMarked: true });

    datos(await db.from("asistencias").insert({ pibe_id: student_id, fecha, organizacion_id: org }));
    return c.json({ ok: true, alreadyMarked: false });
  })

  .delete("/unmark", validar("json", asistenciaSchema), async (c) => {
    const org = c.var.organizacionId;
    const { student_id, fecha } = c.req.valid("json");

    const asistenciaId = await pibeYAsistencia(org, student_id, fecha);
    if (!asistenciaId) throw noEncontrado("No hay asistencia registrada para ese día");

    datos(await db.from("asistencias").delete().eq("id", asistenciaId).eq("organizacion_id", org));
    return c.json({ ok: true });
  })

  // Días del año con al menos un presente, con su total (agrupado en SQL).
  .get("/dates", validar("query", anioQuerySchema), async (c) => {
    const filas = await rpc<{ fecha: string; total: number | string }[] | null>("asistencia_fechas", {
      p_org: c.var.organizacionId,
      p_anio: anioPedido(c.req.valid("query").year),
    });
    return c.json(
      (filas ?? []).map((fila) => ({
        fecha: String(fila.fecha).slice(0, 10),
        total: Number(fila.total) || 0,
      })),
    );
  })

  // Podio del año. La función ya resuelve los empates; acá sólo se ordena.
  .get("/top", validar("query", anioQuerySchema), async (c) => {
    const filas = await rpc<
      { id: string; nombre: string; apellido: string; total: number | string }[] | null
    >("asistencia_top", { p_org: c.var.organizacionId, p_anio: anioPedido(c.req.valid("query").year) });
    return c.json(
      (filas ?? [])
        .map((pibe) => ({
          id: pibe.id,
          nombre: pibe.nombre,
          apellido: pibe.apellido,
          nombreCompleto: `${pibe.nombre} ${pibe.apellido}`,
          total: Number(pibe.total) || 0,
        }))
        .sort((a, b) => b.total - a.total || a.nombreCompleto.localeCompare(b.nombreCompleto, "es"))
        .slice(0, 3),
    );
  })

  // Quiénes vinieron un día. Una sola consulta: los pibes de la organización
  // que tienen una asistencia en ese rango.
  .get("/by-date", validar("query", asistenciaPorFechaQuerySchema), async (c) => {
    const { desde, hasta } = rangoDiaUTC(c.req.valid("query").date);
    const filas = datos(
      await db
        .from("pibes")
        .select(`${COLUMNAS_DE_PIBE}, asistencias!inner(id)`)
        .eq("organizacion_id", c.var.organizacionId)
        .gte("asistencias.fecha", desde)
        .lt("asistencias.fecha", hasta)
        .order("apellido")
        .order("nombre"),
    );
    return c.json(filas.map((fila) => aPibe(fila)));
  });
