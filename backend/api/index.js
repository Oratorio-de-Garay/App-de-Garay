import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─────────────────────────────────────────────────────────
// Search students by name
// ─────────────────────────────────────────────────────────
app.get("/api/students/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const searchTerm = `%${q.toLowerCase()}%`;

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .ilike("nombre", searchTerm);

    if (error) throw error;

    const studentsWithVisits = await Promise.all(
      data.map(async (student) => {
        const { data: visits, error: visitError } = await supabase
          .from("attendance")
          .select("*")
          .eq("student_id", student.id);

        if (visitError) throw visitError;

        return {
          id: student.id,
          nombre: student.nombre,
          grado: student.grado,
          ficha: student.tiene_ficha,
          edad: student.edad,
          obs: student.observaciones,
          visitas: visits ? visits.length : 0,
        };
      })
    );

    res.json(studentsWithVisits);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Mark student as present
// ─────────────────────────────────────────────────────────
app.post("/api/attendance/mark", async (req, res) => {
  try {
    const { student_id, fecha } = req.body;

    if (!student_id || !fecha) {
      return res.status(400).json({ error: "Missing student_id or fecha" });
    }

    const { error } = await supabase.from("attendance").insert({
      student_id,
      fecha,
      marked: true,
    });

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Create new student
// ─────────────────────────────────────────────────────────
app.post("/api/students", async (req, res) => {
  try {
    const { nombre, grado, tiene_ficha, edad, observaciones } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: "Missing nombre" });
    }

    const { data, error } = await supabase
      .from("students")
      .insert({
        nombre,
        grado: grado || null,
        tiene_ficha: tiene_ficha === "Sí" || tiene_ficha === "Si",
        edad: edad || null,
        observaciones: observaciones || null,
      })
      .select();

    if (error) throw error;

    const student = data[0];

    // Mark as present on creation
    if (req.body.fecha) {
      await supabase.from("attendance").insert({
        student_id: student.id,
        fecha: req.body.fecha,
        marked: true,
      });
    }

    res.json({ ok: true, id: student.id });
  } catch (error) {
    console.error("Create student error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// Update student (edit ficha and observations)
// ─────────────────────────────────────────────────────────
app.patch("/api/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { tiene_ficha, observaciones } = req.body;

    const updateData = {};
    if (tiene_ficha !== undefined) {
      updateData.tiene_ficha = tiene_ficha === "Sí" || tiene_ficha === "Si";
    }
    if (observaciones !== undefined) {
      updateData.observaciones = observaciones;
    }

    const { error } = await supabase
      .from("students")
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

export default app;
