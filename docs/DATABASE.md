# Base de datos

Postgres gestionado por Supabase. Acceso desde el backend vía `@supabase/supabase-js`, con dos clientes distintos (ver [ARCHITECTURE.md](ARCHITECTURE.md#autenticación-y-autorización)):

- Cliente con **anon/publishable key** (`backend/api/index.js`) — sujeto a RLS, usado para todas las rutas de datos (`pibes`, `asistencias`, lookups).
- Cliente con **service role key** (`backend/api/auth.js`) — bypassea RLS, usado únicamente para validar sesión y chequear `allowed_emails`.

> ⚠️ **El schema descripto acá no está completamente versionado en `supabase/migrations/`** (ver el punto 1 de deuda técnica en [ARCHITECTURE.md](ARCHITECTURE.md)). Esta es la fuente de verdad más confiable hoy — si hacés un cambio de schema, además de aplicarlo en Supabase, agregá una migración nueva para no perder más terreno.

## Tablas

### `organizaciones`
Catálogo de organizaciones (para este proyecto, una sola fila — "el oratorio").
| Columna | Tipo | Notas |
|---|---|---|
| id | int8 identity | PK |
| nombre | varchar | único, not null |
| created_at | timestamptz | |

### `niveles_grados_pibes`
Niveles educativos (ej: "Primario", "Secundario").
| Columna | Tipo | Notas |
|---|---|---|
| id | int8 identity | PK |
| nivel | varchar | único, not null |
| created_at | timestamptz | |

### `grados_pibes`
Un grado concreto = nivel + número (ej: nivel "Primario" + grado 3 → se muestra como **"Primario 3°"**, ver `gradoLabel()` en `backend/api/index.js`).
| Columna | Tipo | Notas |
|---|---|---|
| id | int8 identity | PK |
| nivel | varchar | FK → `niveles_grados_pibes.nivel` (ON DELETE RESTRICT) |
| grado | int2 | not null |
| created_at | timestamptz | |

### `edades`
Categoría etaria (ej: "Chiquitos", "Medianos", "Grandes", "Gigantes"). **Es un eje de clasificación independiente de `grado`**, no una jerarquía del mismo árbol.
| Columna | Tipo | Notas |
|---|---|---|
| id | int8 identity | PK |
| nombre | varchar | not null |
| organizacion | varchar | FK → `organizaciones.nombre` (ON DELETE CASCADE), not null |
| created_at | timestamptz | |

### `pibes`
Entidad principal: cada chico/a registrado.
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| nombre | varchar | not null |
| apellido | varchar | not null |
| grado_id | int8 | FK → `grados_pibes.id` (ON DELETE RESTRICT), not null |
| edad_id | int8 | FK → `edades.id` (ON DELETE RESTRICT), not null |
| entrego_ficha | bool | not null — si presentó la ficha médica/de inscripción |
| telefono_emergencia | int8 | nullable |
| observaciones | text | nullable |
| created_at | timestamptz | |

### `asistencias`
Una fila = una visita. No hay columna de estado ("marked"): la existencia de la fila **es** la asistencia.
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| pibe_id | uuid | FK → `pibes.id` (ON DELETE RESTRICT), not null |
| fecha | timestamptz | not null |
| created_at | timestamptz | |

El backend evita duplicar asistencias del mismo día para el mismo pibe chequeando el rango `[00:00Z, 24:00Z)` de la fecha antes de insertar (`POST /api/attendance/mark`).

### `allowed_emails`
Allowlist de logins de Google permitidos. Versionada en `supabase/migrations/20260807000000_allowed_emails.sql` y `20260807010000_grant_allowed_emails.sql`.
| Columna | Tipo | Notas |
|---|---|---|
| email | text | PK, normalizado a lowercase/trim por trigger (`normalize_allowed_email`) |
| note | text | nullable — para anotar de quién es el email |
| created_at | timestamptz | |

Para agregar a alguien: `insert into public.allowed_emails (email, note) values ('persona@gmail.com', 'Motivo/rol');` en el SQL Editor de Supabase. **No hay UI para esto.**

## Relaciones

```
organizaciones ──< edades
niveles_grados_pibes ──< grados_pibes ──< pibes >── edades
pibes ──< asistencias
```

## Row Level Security (RLS)

RLS está **habilitado en todas las tablas**. Estado real de acceso (configurado a mano vía SQL Editor, no versionado):

- `organizaciones`, `niveles_grados_pibes`, `grados_pibes`, `edades`: `SELECT` público para el rol `anon` (necesario para poblar los dropdowns de "nuevo chico" vía `GET /api/lookups`).
- `pibes`: `SELECT`, `INSERT`, `UPDATE` para `anon`.
- `asistencias`: `SELECT`, `INSERT` para `anon`.
- `allowed_emails`: **sin políticas públicas**. Sólo `service_role` tiene `GRANT SELECT`. Sólo se lee server-side con la service role key — intencional, así ningún cliente puede leer/alterar la allowlist directamente.

Recordatorio importante (ya mordió una vez): **RLS habilitado no implica el `GRANT` a nivel de tabla** — hacen falta ambos. Si una tabla nueva da `permission denied for table X` (código `42501`) aunque tenga políticas RLS correctas, probablemente falte el `GRANT SELECT/INSERT/... ON <tabla> TO anon;` (o `TO service_role`, según el cliente).

## Función RPC: `buscar_pibes`

`GET /api/students/search` llama a `supabase.rpc("buscar_pibes", { termino })` y encadena `.select(...)` para traer los datos embebidos de `grados_pibes` y `edades`. **El cuerpo SQL de esta función no está en el repo** — vive únicamente en la base remota. Por su uso se infiere que busca por coincidencia parcial en `nombre` y/o `apellido` y devuelve filas de `pibes`. Si necesitás tocar el comportamiento de búsqueda, primero traé la definición real desde Supabase (SQL Editor → Database → Functions, o `supabase db pull`) antes de asumir su lógica.

## Seed de datos mínimos

Antes de poder crear un pibe hace falta que existan filas en las tablas de lookup (por las FK `NOT NULL`):

```sql
insert into organizaciones (nombre) values ('Oratorio');
insert into niveles_grados_pibes (nivel) values ('Jardín'), ('Primario'), ('Secundario');
insert into grados_pibes (nivel, grado) values ('Primario', 1), ('Primario', 2), ('Primario', 3); -- etc.
insert into edades (nombre, organizacion) values ('Chiquitos', 'Oratorio'), ('Medianos', 'Oratorio'), ('Grandes', 'Oratorio'), ('Gigantes', 'Oratorio');
```

## Credenciales

- `SUPABASE_URL` / `SUPABASE_KEY` (anon/publishable): en `backend/.env`, también hardcodeadas en `frontend/index.html` (son públicas por diseño, el control de acceso real pasa por RLS + backend).
- `SUPABASE_SERVICE_ROLE_KEY`: sólo en `backend/.env`, **nunca** al frontend.

Ver [SETUP.md](SETUP.md) para dónde conseguir cada una.
