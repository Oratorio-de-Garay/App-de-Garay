# Base de datos

Postgres gestionado por Supabase. Acceso desde el backend vía `@supabase/supabase-js`, con la **service role key** en los dos clientes (`backend/api/index.js` y `backend/api/auth.js`). La service role bypassea RLS, así que:

- **Aislamiento entre organizaciones:** se aplica a mano en cada query con `.eq("organizacion_id", req.user.organizationId)`.
- **Administración (usuarios, roles, organizaciones):** se aplica dentro de las funciones SQL del panel. Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).
- **RLS:** queda como defensa en profundidad.

**La fuente de verdad del schema son las migraciones de `supabase/migrations/`.** Aplicadas en orden sobre una base vacía reconstruyen exactamente el schema de producción: se verificó con `supabase db dump` de las dos bases y la diferencia fue cero. Lo verifica también CI en cada PR (ver [SETUP.md](SETUP.md#base-de-datos)).

- **Schema base:** la migración `20260730210820_remote_schema.sql` contiene `organizaciones`, `niveles_grados_pibes`, `grados_pibes`, `edades`, `pibes`, `asistencias` y `buscar_pibes`, que se habían creado a mano.
- **Cambios de schema:** **siempre** van con una migración nueva, nunca a mano en el SQL Editor.

## Tablas

### `organizaciones`
Catálogo de organizaciones (hoy: "Oratorio de Garay" y "Escuadra 3"). Cada tabla de datos tiene `organizacion_id`. El superadmin las crea y renombra desde el panel; no se borran, porque las tablas de datos las referencian sin cascade.
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| nombre | varchar | not null. Único exacto (`organizaciones_nombre_key`) y único sin importar mayúsculas ni espacios (`organizaciones_nombre_ci_key`). |
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
| organizacion_id | uuid | FK → `organizaciones.id` (ON DELETE CASCADE), not null |
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
| organizacion_id | uuid | FK → `organizaciones.id` (ON DELETE RESTRICT), not null |
| created_at | timestamptz | |

### `asistencias`
Una fila = una visita. No hay columna de estado ("marked"): la existencia de la fila **es** la asistencia.
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| pibe_id | uuid | FK → `pibes.id` (ON DELETE RESTRICT), not null |
| fecha | timestamptz | not null |
| organizacion_id | uuid | FK → `organizaciones.id`, not null |
| created_at | timestamptz | |

El backend evita duplicar asistencias del mismo día para el mismo pibe chequeando el rango `[00:00Z, 24:00Z)` de la fecha antes de insertar (`POST /api/attendance/mark`).

### `usuarios` (ex `allowed_emails`)
Emails de Google habilitados para loguearse. Se renombró en `20260926000000_roles_y_admin.sql`; antes estaba en `20260807000000_allowed_emails.sql`.
| Columna | Tipo | Notas |
|---|---|---|
| email | text | PK, normalizado a lowercase/trim por trigger (`normalize_allowed_email`) |
| id | uuid | único, `gen_random_uuid()`. Se usa en las URLs de la API para no exponer emails. |
| nombre | text | nullable (ex `note`) |
| created_at / updated_at | timestamptz | `updated_at` por trigger |
| created_by | text | email de quien lo dio de alta (`'migracion'` / `'sql'` si no fue desde el panel) |

**Se administra desde el panel** (`admin.html`). Invariante: un usuario sin organizaciones y sin rol global se borra solo.

### `organizacion_miembros`
Membresía: el usuario puede ver y operar los datos de esa organización.
| Columna | Tipo | Notas |
|---|---|---|
| email | text | FK → `usuarios.email` (ON DELETE CASCADE) |
| organizacion_id | uuid | FK → `organizaciones.id` (ON DELETE CASCADE) |
| created_at | timestamptz | |
| created_by | text | |

PK `(email, organizacion_id)`. La columna `rol` que existía se eliminó en `20260926000000`: nunca se leyó, y los roles viven en `usuario_roles`.

### `roles`
Catálogo de roles. Agregar un rol es un `insert` acá (ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#agregar-un-rol-nuevo)).
| Columna | Tipo | Notas |
|---|---|---|
| codigo | text | PK (`superadmin`, `admin`) |
| nombre / descripcion | text | se muestran en el panel |
| alcance | text | `global` \| `organizacion` |
| asignable_desde_panel | bool | `superadmin` es `false`: sólo se asigna por SQL |

### `usuario_roles`
Roles asignados. Una fila por (usuario, rol, organización).
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| email | text | FK → `usuarios.email` (ON DELETE CASCADE) |
| rol, alcance | text | FK compuesto → `roles(codigo, alcance)` |
| organizacion_id | uuid | nullable. Check: obligatorio si `alcance = 'organizacion'`, nulo si es `global`. |
| created_at / created_by | | |

Además, el FK `(email, organizacion_id) → organizacion_miembros` hace que un rol por organización exija la membresía y caiga solo si se la quita. Unicidad con dos índices parciales (global / por organización).

### `auditoria_admin`
Una fila por cambio de administración: altas, membresías, roles y organizaciones. Columnas: `actor_email`, `accion`, `objetivo_email`, `organizacion_id` (FK, ON DELETE SET NULL), `detalle jsonb` y `created_at`. El detalle de cada `accion` está en [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#auditoría). Sin RLS pública: sólo la lee el backend.

### `solicitud_tipos`
Catálogo de tipos de solicitud (como `roles`). Hoy: `registro_usuario`. Versionada en `20260928000000_solicitudes.sql`.

### `solicitudes`
Pedidos que aprueba un admin o superadmin, como tickets. Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#registro-y-solicitudes).
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| numero | int8 identity | único; el "#12" del panel y los mails |
| tipo | text | FK → `solicitud_tipos.codigo` |
| estado | text | `pendiente` \| `aceptada` \| `rechazada` \| `cancelada`. Check: `resuelta_at` es nulo si y sólo si está pendiente. |
| solicitante_email | text | normalizado. No es FK: todavía no está en `usuarios`. |
| solicitante_nombre | text | not null, hasta 120 |
| organizacion_id | uuid | FK → `organizaciones.id`, nullable. Define quién la ve. Nula = espacio nuevo pendiente; al aceptarla se completa con la organización final. |
| datos | jsonb | lo propio de cada tipo. `registro_usuario`: `{ espacio_nuevo, nombre_espacio, organizacion_creada, rol_asignado }` |
| aprobador_id | uuid | FK → `usuarios.id` (ON DELETE SET NULL). Quien la tomó o la resolvió. |
| comentario_aprobador | text | hasta 1000 |
| created_at / updated_at / tomada_at / resuelta_at | timestamptz | `updated_at` por trigger |

Índice único parcial `(solicitante_email, tipo) where estado = 'pendiente'`: una sola pendiente por persona. Sin RLS pública: sólo la lee el backend.

### `buffet_eventos`
Una jornada de venta ("Feria del Plato 29/08/2026"). Se crea una vez y agrupa todas sus ventas. Versionada en `supabase/migrations/20260830000000_buffet_eventos.sql`.
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| nombre | text | not null — único por organización |
| fecha | date | not null, default `current_date` |
| estado | text | not null, default `'abierto'` — `abierto` \| `cerrado` |
| observacion | text | nullable |
| organizacion_id | uuid | FK → `organizaciones.id`, not null |
| created_at / updated_at | timestamptz | `updated_at` por trigger |

### `buffet_sales` / `buffet_sale_items`
Una venta = un cobro dentro de un evento. Definidas en `20260828000000_buffet_sales.sql`; `event_id` se agregó en `20260830000000_buffet_eventos.sql`.

Columnas relevantes de `buffet_sales`: `event_id` (FK → `buffet_eventos.id`, ON DELETE CASCADE, **not null**), `event_name` (snapshot del nombre del evento al momento de la venta, se conserva legible aunque después se renombre), `sale_date`, `payment_method`, `observation`, `total_amount`, `organizacion_id`.

`buffet_sale_items` guarda `description` (snapshot del nombre del producto/combo), `quantity`, `unit_price` y `line_total`. Las columnas son `numeric(12,2)` pero **el backend redondea cantidades y precios a enteros**: no se venden medias porciones ni se cobran centavos.

Los totales los recalcula siempre el servidor (`normalizeSaleItems` en `backend/api/index.js`); lo que manda el cliente no se toma como fuente de verdad.

## Relaciones

```
usuarios ──< organizacion_miembros >── organizaciones
usuarios ──< usuario_roles >── roles          (usuario_roles >── organizacion_miembros para roles por organización)
organizaciones ──< edades
niveles_grados_pibes ──< grados_pibes ──< pibes >── edades
pibes ──< asistencias
organizaciones ──< buffet_eventos ──< buffet_sales ──< buffet_sale_items
solicitud_tipos ──< solicitudes >── organizaciones   (solicitudes.aprobador_id >── usuarios)
```

## Row Level Security (RLS)

RLS está **habilitado en todas las tablas**, y toda tabla nueva de `public` nace con RLS (event trigger `ensure_rls`). Como el backend usa la service role, las políticas son defensa en profundidad para el día que se consulte desde el cliente.

**`anon` no tiene acceso a ninguna tabla ni a `buscar_pibes`.** Hasta `20260927000000_cerrar_acceso_publico.sql`, el schema original tenía políticas `public read/insert/update ... USING (true)` sin `TO`, que junto con `GRANT ALL` a `anon` dejaban leer y modificar pibes y asistencias con la publishable key del frontend. No volver a crear políticas sin `TO authenticated` (o más restrictivo).

- **Tablas de datos** (`pibes`, `asistencias`, `buffet_*`): política "org scope" para `authenticated`, filtrada por `organizaciones_del_usuario()` (ver `20260829000000_organizaciones.sql`).
- **Catálogos:** `edades` es "org scope" para `authenticated`; `grados_pibes` y `niveles_grados_pibes` se pueden leer siendo `authenticated`.
- **`organizaciones` / `organizacion_miembros`:** sólo `SELECT` de lo propio. Desde `20260926000000` además se les revocó `INSERT`/`UPDATE`/`DELETE` a `anon` y `authenticated`.
- **`usuarios` / `usuario_roles`:** cada uno lee sólo su propia fila (`email = auth.jwt()->>'email'`). Sin escritura.
- **`roles`:** lectura para `authenticated`.
- **`auditoria_admin`, `solicitudes`, `solicitud_tipos`:** sin políticas. Sólo la service role.

Recordatorio importante (ya mordió una vez): **RLS habilitado no implica el `GRANT` a nivel de tabla**, hacen falta ambos. El proyecto tiene los privilegios por defecto restringidos: una tabla, secuencia o función nueva **no** recibe `SELECT`/`INSERT`/`EXECUTE` automáticos, ni siquiera para `service_role`.

- **Síntoma:** si una tabla nueva da `permission denied for table X` (código `42501`), falta el `GRANT ... TO service_role` en la migración.
- **Local igual que producción:** la migración base replica esos privilegios por defecto, así el error aparece también en local.

## Funciones del panel de administración

Definidas en `20260926000000_roles_y_admin.sql`. **Sólo `service_role` tiene `EXECUTE`.** Todas reciben al actor (`p_actor`, el email de la sesión), recalculan su scope y auditan en la misma transacción.

| Función | Uso |
|---|---|
| `contexto_usuario(email)` | Middleware: registrado, organizaciones, roles, `es_superadmin`, `organizaciones_admin`. |
| `es_superadmin(email)`, `organizaciones_administradas(email)` | Helpers de permisos. Son `security definer` y reutilizables desde RLS. |
| `admin_alta_usuario`, `admin_editar_usuario`, `admin_quitar_acceso` | Usuarios, dentro del scope del admin. |
| `superadmin_asignar_rol`, `superadmin_quitar_rol` | Roles (sólo superadmin). |
| `superadmin_guardar_organizacion` | Crear o renombrar organización (sólo superadmin). |
| `admin_listar_usuarios`, `admin_listar_organizaciones`, `admin_listar_auditoria` | Listados filtrados por scope. |

Las de solicitudes están en `20260928000000_solicitudes.sql`, con las mismas reglas (sólo `service_role`, actor explícito, auditoría en la misma transacción):

| Función | Uso |
|---|---|
| `registro_estado(email)` | Pantalla de registro: si ya tiene acceso, su última solicitud y los espacios. |
| `registro_crear_solicitud`, `registro_cancelar_solicitud` | Las usa el solicitante (el email lo pone el backend desde la sesión). `registro_crear_solicitud` devuelve además a quién avisar. |
| `admin_listar_solicitudes`, `admin_tomar_solicitud`, `admin_resolver_solicitud` | Panel, dentro del scope del actor. |
| `solicitud_json`, `solicitud_visible_para`, `solicitud_aprobadores` | Helpers: forma única de una solicitud, scope y destinatarios de los avisos. |

Los SQLSTATE que levantan (y cómo se traducen a HTTP) están en [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#errores-de-las-funciones).

## Función RPC: `buscar_pibes`

`GET /api/students/search` llama a `supabase.rpc("buscar_pibes", { termino })` y encadena `.select(...)` para traer los datos embebidos de `grados_pibes` y `edades`.

- **Qué busca:** coincidencia parcial en `nombre` o `apellido`, sin distinguir mayúsculas ni tildes (`extensions.unaccent`). Devuelve filas de `pibes`.
- **Organización:** la función no filtra por organización; ese filtro lo agrega el backend.
- **Permisos:** es `SECURITY INVOKER`, así que respeta la RLS de `pibes`.
- **Definición:** en `20260730210820_remote_schema.sql`.

## Seed de datos mínimos

Antes de poder crear un pibe hace falta que existan filas en las tablas de lookup, por las FK `NOT NULL`.

- **En local:** [`supabase/seed.sql`](../supabase/seed.sql) carga niveles, grados, edades por organización y un pibe de prueba por organización. `supabase db reset --local` lo aplica solo.
- **Organizaciones y superadmin:** los crean las migraciones.
- **En producción:** los lookups ya existen; si hiciera falta agregar alguno, va con una migración.

## Tests

[`supabase/tests/`](../supabase/tests/) tiene tests pgTAP: reglas de roles y scope, constraints, auditoría y que `anon` o una cuenta no registrada no vean datos. Se corren contra la base local con `supabase test db`, y en CI en cada PR que toque `supabase/`.

## Credenciales

- `SUPABASE_URL` / `SUPABASE_KEY` (anon/publishable): en `backend/.env`, también hardcodeadas en `frontend/index.html` (son públicas por diseño, el control de acceso real pasa por RLS + backend).
- `SUPABASE_SERVICE_ROLE_KEY`: sólo en `backend/.env`, **nunca** al frontend.

Ver [SETUP.md](SETUP.md) para dónde conseguir cada una.
