# Database Setup Guide

This describes the **actual** schema in use (already created directly in Supabase), the Row Level Security policies required for the app's anon key to work, and the seed data needed before you can register any pibe.

## Schema Overview

```
organizaciones           (id, nombre)
niveles_grados_pibes     (id, nivel)                         -- e.g. "Primario", "Secundario"
grados_pibes             (id, nivel → niveles_grados_pibes.nivel, grado int2)
edades                   (id, nombre, organizacion → organizaciones.nombre)
pibes                    (id uuid, nombre, apellido, grado_id → grados_pibes.id,
                           entrego_ficha bool, telefono_emergencia int8 null,
                           edad_id → edades.id, observaciones text null)
asistencias              (id uuid, fecha timestamptz, pibe_id → pibes.id)
```

All tables have RLS **enabled**. Since the backend connects with the anon/publishable key, **no request will work until you add policies** — by default RLS with zero policies blocks everything.

## 1. Row Level Security Policies

Run this in the Supabase SQL Editor. It allows the app (using the anon key) to read the lookup tables and read/write `pibes` and `asistencias`. Adjust later if you add authentication.

```sql
-- Lookup tables: read-only for the app
CREATE POLICY "public read niveles" ON public.niveles_grados_pibes
  FOR SELECT USING (true);

CREATE POLICY "public read grados" ON public.grados_pibes
  FOR SELECT USING (true);

CREATE POLICY "public read organizaciones" ON public.organizaciones
  FOR SELECT USING (true);

CREATE POLICY "public read edades" ON public.edades
  FOR SELECT USING (true);

-- pibes: the app needs to read, create, and update
CREATE POLICY "public read pibes" ON public.pibes
  FOR SELECT USING (true);

CREATE POLICY "public insert pibes" ON public.pibes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "public update pibes" ON public.pibes
  FOR UPDATE USING (true);

-- asistencias: the app needs to read (visit counts) and create (mark present)
CREATE POLICY "public read asistencias" ON public.asistencias
  FOR SELECT USING (true);

CREATE POLICY "public insert asistencias" ON public.asistencias
  FOR INSERT WITH CHECK (true);
```

**Note:** these policies allow anyone with the anon key to read/write. That matches the original Apps Script app (no auth). Tighten later with Supabase Auth if needed.

## 2. Seed the Lookup Tables

`pibes.grado_id` and `pibes.edad_id` are `NOT NULL` foreign keys — you can't create a pibe until `grados_pibes` and `edades` have rows, and `edades` itself requires a row in `organizaciones`. Run this once (edit the values to match your actual org/grades/categories):

```sql
-- 1. Your organization
INSERT INTO public.organizaciones (nombre) VALUES ('Oratorio');

-- 2. Grade levels (nivel)
INSERT INTO public.niveles_grados_pibes (nivel) VALUES
  ('Jardín'),
  ('Primario'),
  ('Secundario');

-- 3. Grados (nivel + grado number)
INSERT INTO public.grados_pibes (nivel, grado) VALUES
  ('Jardín', 4),
  ('Jardín', 5),
  ('Primario', 1),
  ('Primario', 2),
  ('Primario', 3),
  ('Primario', 4),
  ('Primario', 5),
  ('Primario', 6),
  ('Secundario', 1),
  ('Secundario', 2),
  ('Secundario', 3);

-- 4. Age categories (same ones the old Apps Script used)
INSERT INTO public.edades (nombre, organizacion) VALUES
  ('Chiquitos', 'Oratorio'),
  ('Medianos', 'Oratorio'),
  ('Grandes', 'Oratorio'),
  ('Gigantes', 'Oratorio');
```

The app's "Nuevo chico" form fetches these via `GET /api/lookups` and renders them as dropdowns — no need to touch the frontend when you add/remove grados or categories, just edit these tables.

## 3. Indexes (recommended)

```sql
CREATE INDEX IF NOT EXISTS idx_pibes_nombre ON public.pibes (nombre);
CREATE INDEX IF NOT EXISTS idx_pibes_apellido ON public.pibes (apellido);
CREATE INDEX IF NOT EXISTS idx_asistencias_pibe_id ON public.asistencias (pibe_id);
```

## Schema Reference

### pibes
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| nombre | text | required |
| apellido | text | required |
| grado_id | int8 | FK → grados_pibes.id, required |
| entrego_ficha | bool | required |
| telefono_emergencia | int8 | optional |
| edad_id | int8 | FK → edades.id, required |
| observaciones | text | optional |
| created_at | timestamptz | auto |

### asistencias
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| pibe_id | uuid | FK → pibes.id |
| fecha | timestamptz | date/time of attendance |
| created_at | timestamptz | auto |

Each row = one visit. Visit count is `COUNT(*) FROM asistencias WHERE pibe_id = ...`.

### grados_pibes / niveles_grados_pibes
A "grado" is a nivel (e.g. "Primario") + a grade number (e.g. 3), displayed as `Primario 3°`.

### edades / organizaciones
`edades` rows are scoped per organization by name — the app currently doesn't filter by organization; it lists every row in `edades`, so only seed the organization(s) you actually use.

## Getting Your Credentials

1. In Supabase, go to **Project Settings → Data API**
2. Copy the **Project URL** → this is `SUPABASE_URL`
3. Copy the **anon/publishable key** → this is `SUPABASE_KEY`
4. Put them in `backend/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-publishable-key
```

## Verifying Setup

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Should list: `asistencias`, `edades`, `grados_pibes`, `niveles_grados_pibes`, `organizaciones`, `pibes`.

```sql
-- Confirm lookups have data
SELECT * FROM edades;
SELECT g.id, n.nivel, g.grado FROM grados_pibes g JOIN niveles_grados_pibes n ON n.nivel = g.nivel;
```

If either is empty, the "Nuevo chico" form will show "No hay grados cargados" / "No hay categorías cargadas" — go back to step 2.
