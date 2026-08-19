# API

Backend Express en `backend/api/index.js`, servido junto con el frontend desde el mismo dominio (ver [ARCHITECTURE.md](ARCHITECTURE.md)). Base URL en producción: la propia del deploy (`https://app-de-garay.vercel.app` o el preview correspondiente). En local: `http://localhost:3000`.

## Autenticación

Todas las rutas bajo `/api/*` **excepto `/api/health`** requieren:

```
Authorization: Bearer <supabase_access_token>
```

El token es el `access_token` de la sesión de Supabase Auth del usuario logueado (Google SSO), y además el email de esa sesión debe estar en la tabla `allowed_emails`. Usar siempre `window.apiFetch()` desde el frontend (definido en `frontend/auth.js`) — arma este header automáticamente.

Respuestas de error de auth:
- `401` — no autenticado o token inválido/expirado.
- `403` — autenticado pero el email no está en `allowed_emails`.

## Forma común de un "pibe"

Varios endpoints devuelven personas con esta misma forma (ver `gradoLabel()` en el backend para el formato de `grado`):

```json
{
  "id": "uuid",
  "nombre": "Juan",
  "apellido": "Pérez",
  "nombreCompleto": "Juan Pérez",
  "grado_id": 3,
  "grado": "Primario 3°",
  "edad_id": 2,
  "edad": "Medianos",
  "ficha": true,
  "obs": "Observaciones o null",
  "telefono": 1122334455,
  "visitas": 5,
  "ultima_asistencia": "2026-08-07T00:00:00.000Z"
}
```

`visitas` y `ultima_asistencia` sólo aparecen en `search` y `GET /:id` (requieren una query extra a `asistencias`).

---

## `GET /api/lookups`

Grados y categorías de edad disponibles, para poblar los `<select>` del formulario de alta.

**Respuesta 200:**
```json
{
  "edades": [{ "id": 1, "nombre": "Chiquitos" }],
  "grados": [{ "id": 1, "label": "Primario 1°" }]
}
```

## `GET /api/students/search?q=`

Busca pibes por nombre o apellido (usa la RPC `buscar_pibes`, ver [DATABASE.md](DATABASE.md#función-rpc-buscar_pibes)). `q` vacío devuelve `[]` sin pegarle a la base.

**Respuesta 200:** array de objetos "pibe" (forma común de arriba, con `visitas` y `ultima_asistencia`).

## `GET /api/students/:id`

Un pibe puntual por id (uuid). Misma forma que un elemento de `search`.

**404 implícito**: si no existe, Supabase devuelve error en `.single()` → responde `500` (no hay manejo especial de "no encontrado" — a tener en cuenta si se toca este endpoint).

## `POST /api/students`

Crea un pibe nuevo. Opcionalmente marca presente el mismo día si se manda `fecha`.

**Body:**
```json
{
  "nombre": "Carlos",
  "apellido": "López",
  "grado_id": 4,
  "edad_id": 3,
  "entrego_ficha": true,
  "telefono_emergencia": 1122334455,
  "observaciones": "opcional",
  "fecha": "2026-08-19"
}
```
`nombre`, `apellido`, `grado_id`, `edad_id` son obligatorios (`400` si falta alguno). `entrego_ficha` acepta `true`/`false` o los strings `"Sí"`/`"Si"` (compat con selects HTML). `fecha` es opcional — si viene, además inserta en `asistencias`.

**Respuesta 200:** `{ "ok": true, "id": "uuid" }`

## `PATCH /api/students/:id`

Edita ficha y/u observaciones de un pibe existente. Ambos campos opcionales, se actualiza sólo lo que venga (`undefined` se ignora).

**Body:** `{ "entrego_ficha": true, "observaciones": "..." }`

**Respuesta 200:** `{ "ok": true }`

## `GET /api/attendance/check?student_id=&date=`

Chequea si un pibe ya tiene una asistencia registrada para una fecha dada (`YYYY-MM-DD`). Usado por la UI para deshabilitar el botón "marcar presente" sin necesidad de abrir la ficha completa.

**Respuesta 200:** `{ "marked": true }`

## `POST /api/attendance/mark`

Registra una asistencia. **Idempotente por día**: si el pibe ya tiene una asistencia ese día, no inserta una segunda fila y devuelve `alreadyMarked: true`.

**Body:** `{ "student_id": "uuid", "fecha": "2026-08-19" }`

**Respuesta 200:** `{ "ok": true, "alreadyMarked": false }`

## `GET /api/attendance/dates?year=`

Historial: días del año (`year`, default año actual) que tuvieron al menos una asistencia, con el total de pibes distintos ese día.

**Respuesta 200:** `[{ "fecha": "2026-08-07", "total": 12 }, ...]` (orden descendente por fecha).

## `GET /api/attendance/top?year=`

Top 3 de pibes con más asistencias en el año (desempate alfabético).

**Respuesta 200:** `[{ "id": "uuid", "nombre": "...", "apellido": "...", "nombreCompleto": "...", "total": 9 }, ...]`

## `GET /api/attendance/by-date?date=YYYY-MM-DD`

Lista completa de pibes presentes en una fecha puntual (drill-down del historial). `date` es obligatorio y debe matchear `YYYY-MM-DD` (`400` si no).

**Respuesta 200:** array de objetos "pibe" (sin `visitas` ni `ultima_asistencia`, incluye `ficha`, `telefono`, `obs`).

## `GET /api/auth/me`

Devuelve el email de la sesión actual si el token es válido y está en la allowlist. Usado por el frontend justo después del login para decidir si mostrar la app o la pantalla de "no autorizado".

**Respuesta 200:** `{ "email": "persona@gmail.com" }`

## `GET /api/health`

Única ruta sin autenticación. Usada por monitoreo de uptime.

**Respuesta 200:** `{ "status": "ok" }`

---

## Errores

Formato uniforme: `{ "error": "mensaje" }`, siempre logueado en el server con `console.error("<Contexto> error:", error)` antes de responder. Casi todos los errores no-auth devuelven `500` (no hay diferenciación fina de status codes salvo `400` en validaciones de input explícitas).
