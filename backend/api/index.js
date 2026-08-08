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

// Serve frontend static files
// app.use(express.static(path.join(__dirname, "../frontend")));
app.use(express.static(path.join(__dirname, "../../frontend")));


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
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
  res.json({ email: req.user.email });
});

// Escape ilike wildcards/operators so user input can't break the .or() filter syntax
function sanitizeSearchTerm(term) {
  return term.replace(/[%,()]/g, "").trim();
}

function gradoLabel(grado) {
  if (!grado) return null;
  return `${grado.nivel} ${grado.grado}°`;
}

// ─────────────────────────────────────────────────────────
// Lookups (grados & edades) for populating the "new pibe" form
// ─────────────────────────────────────────────────────────
app.get("/api/lookups", async (req, res) => {
  try {
    const [{ data: edades, error: edadesError }, { data: grados, error: gradosError }] =
      await Promise.all([
        supabase.from("edades").select("id, nombre").order("nombre"),
        supabase.from("grados_pibes").select("id, nivel, grado").order("nivel").order("grado"),
      ]);

    if (edadesError) throw edadesError;
    if (gradosError) throw gradosError;

    res.json({
      edades,
      grados: grados.map((g) => ({ id: g.id, label: gradoLabel(g) })),
    });
  } catch (error) {
    console.error("Lookups error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Search pibes by nombre or apellido
// ─────────────────────────────────────────────────────────
app.get("/api/students/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const term = `%${sanitizeSearchTerm(q.toLowerCase())}%`;

    const { data, error } = await supabase
      .from("pibes")
      .select(
        `
        id,
        nombre,
        apellido,
        entrego_ficha,
        observaciones,
        telefono_emergencia,
        grados_pibes ( id, nivel, grado ),
        edades ( id, nombre )
      `
      )
      .or(`nombre.ilike.${term},apellido.ilike.${term}`);

    if (error) throw error;

    const pibesConVisitas = await Promise.all(
      data.map(async (pibe) => {
        const { count, error: visitError } = await supabase
          .from("asistencias")
          .select("*", { count: "exact", head: true })
          .eq("pibe_id", pibe.id);

        if (visitError) throw visitError;

        return {
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
        };
      })
    );

    res.json(pibesConVisitas);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Mark pibe as present (creates a new asistencia row)
// ─────────────────────────────────────────────────────────
app.post("/api/attendance/mark", async (req, res) => {
  try {
    const { student_id, fecha } = req.body;

    if (!student_id || !fecha) {
      return res.status(400).json({ error: "Missing student_id or fecha" });
    }

    const { error } = await supabase.from("asistencias").insert({
      pibe_id: student_id,
      fecha,
    });

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Create new pibe
// ─────────────────────────────────────────────────────────
app.post("/api/students", async (req, res) => {
  try {
    const { nombre, apellido, grado_id, entrego_ficha, edad_id, telefono_emergencia, observaciones, fecha } =
      req.body;

    if (!nombre || !apellido || !grado_id || !edad_id) {
      return res.status(400).json({ error: "Missing nombre, apellido, grado_id or edad_id" });
    }

    const { data, error } = await supabase
      .from("pibes")
      .insert({
        nombre,
        apellido,
        grado_id,
        edad_id,
        entrego_ficha: entrego_ficha === true || entrego_ficha === "Sí" || entrego_ficha === "Si",
        telefono_emergencia: telefono_emergencia || null,
        observaciones: observaciones || null,
      })
      .select();

    if (error) throw error;

    const pibe = data[0];

    if (fecha) {
      await supabase.from("asistencias").insert({
        pibe_id: pibe.id,
        fecha,
      });
    }

    res.json({ ok: true, id: pibe.id });
  } catch (error) {
    console.error("Create student error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Update pibe (edit ficha and observations)
// ─────────────────────────────────────────────────────────
app.patch("/api/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { entrego_ficha, observaciones } = req.body;

    const updateData = {};
    if (entrego_ficha !== undefined) {
      updateData.entrego_ficha = entrego_ficha === true || entrego_ficha === "Sí" || entrego_ficha === "Si";
    }
    if (observaciones !== undefined) {
      updateData.observaciones = observaciones;
    }

    const { error } = await supabase
      .from("pibes")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error("Update student error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export default app;
