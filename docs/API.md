# API

API en Hono + TypeScript (`apps/api/`), servida junto con el frontend desde el mismo dominio (ver [ARCHITECTURE.md](ARCHITECTURE.md)). Cada grupo de rutas es un módulo en `apps/api/src/modules/<dominio>/routes.ts`; `apps/api/src/app.ts` los monta y declara qué exige cada uno para entrar. Los datos de entrada se validan con los esquemas Zod de `packages/shared/src/schemas/`. Base URL en producción: la propia del deploy (`https://app-de-garay.vercel.app` o el preview correspondiente). En local: `http://localhost:3000`.

## Autenticación

Todas las rutas bajo `/api/*` **excepto `/api/health`** requieren:

```
Authorization: Bearer <supabase_access_token>
```

El token es el `access_token` de la sesión de Supabase Auth del usuario logueado (Google o código por mail), y además el email de esa sesión debe estar en la tabla `usuarios` (salvo en `/api/registro/*`, que es justamente para quien todavía no está). Usar siempre `window.apiFetch()` desde el frontend (definido en `frontend/auth.js`): arma este header y además `X-Organization-Id` con la organización activa.

Respuestas de error de auth:
- `401`: no autenticado, o token inválido o expirado.
- `403` con `code: "SIN_REGISTRO"`: autenticado pero el email no está en `usuarios`. El frontend muestra la pantalla de registro (`/api/registro`).
- `403` con `code: "SIN_ORGANIZACION"`: está registrado pero no tiene organizaciones. Un superadmin sin organizaciones recibe este error sólo en las rutas de datos; `/api/auth/me` y `/api/admin/*` le funcionan.
- `403` "No pertenecés a esa organización": `X-Organization-Id` apunta a una organización de la que no es miembro.

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

## `GET /api/students/search?q=&date=`

Busca pibes de la organización activa por nombre y/o apellido, por palabras (sin tildes ni mayúsculas; `juan perez` y `perez juan` encuentran a Juan Pérez). Usa la RPC `buscar_pibes_resumen` (ver [DATABASE.md](DATABASE.md#función-rpc-buscar_pibes_resumen)): una sola consulta, máximo 100 resultados (el frontend los pagina del lado del cliente; si llegan 100 avisa que hay que refinar la búsqueda). `q` vacío devuelve `[]` sin pegarle a la base.

`date` (opcional, `YYYY-MM-DD`): si viene, cada pibe incluye `marcado_hoy` (¿tiene presente ese día?); si no, `marcado_hoy` es `null`. Así el frontend no necesita un `GET /api/attendance/check` por resultado.

**Respuesta 200:** array de objetos "pibe" (forma común de arriba, con `visitas`, `ultima_asistencia` y `marcado_hoy`).

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


## `DELETE /api/attendance/unmark`

Revierte una asistencia ya registrada. Borra la fila de `asistencias` del pibe para la fecha indicada dentro de la organización activa.

**Body:** `{ "student_id": "uuid", "fecha": "YYYY-MM-DD" }`

**Respuesta 200:** `{ "ok": true }`

**400** si falta `student_id` o `fecha`.
**404** si el pibe no pertenece a la organización activa, o si no tiene asistencia registrada para esa fecha.

## `GET /api/attendance/dates?year=`

Historial: días del año (`year`, default año actual) que tuvieron al menos una asistencia, con el total de pibes distintos ese día.

**Respuesta 200:** `[{ "fecha": "2026-08-07", "total": 12 }, ...]` (orden descendente por fecha).

## `GET /api/attendance/top?year=`

Top 3 de pibes con más asistencias en el año (desempate alfabético).

**Respuesta 200:** `[{ "id": "uuid", "nombre": "...", "apellido": "...", "nombreCompleto": "...", "total": 9 }, ...]`

## `GET /api/attendance/by-date?date=YYYY-MM-DD`

Lista completa de pibes presentes en una fecha puntual (drill-down del historial). `date` es obligatorio y debe matchear `YYYY-MM-DD` (`400` si no).

**Respuesta 200:** array de objetos "pibe" (sin `visitas` ni `ultima_asistencia`, incluye `ficha`, `telefono`, `obs`).

---

## Buffet: eventos y ventas

Todo el módulo de buffet (`/api/buffet/*`) está scopeado por `X-Organization-Id`: cada query filtra por `organizacion_id`. Acá se documentan sólo eventos y ventas; el resto (`/products`, `/combos`, `/budgets`, `/meta`) sigue el mismo patrón CRUD.

**Productos y combos activos.** `POST`/`PATCH` de `/products` y `/combos` aceptan `active` (boolean). `GET` lo devuelve en cada fila. Si no viene en el body, se guarda `true`: un `PATCH` sin `active` **reactiva** el registro, así que el cliente siempre lo manda. La UI de Nueva venta ofrece sólo los activos; el backend **no** rechaza ventas con productos o combos inactivos a propósito, para poder editar ventas viejas cuyo producto se desactivó después. Desactivar un producto no toca los combos que lo contienen.

Un **evento** ("Feria del Plato 29/08/2026") se crea una vez y después se le cargan las ventas de a una: cada venta es un cobro, con los ítems que sean.

### `GET /api/buffet/events`

Query params opcionales: `q` (búsqueda parcial por nombre).

**Respuesta 200:** array de `{ id, nombre, fecha, estado, observacion, sales_count, total_amount }`, ordenado por fecha descendente.

### `POST /api/buffet/events`

**Body:** `{ "nombre": "Feria del Plato 29/08/2026", "fecha": "2026-08-29", "observacion": null }`. `nombre` es obligatorio (`400` si viene vacío); `fecha` default hoy; `estado` default `"abierto"`.

**Respuesta 201:** el evento creado.

### `PATCH /api/buffet/events/:id`

Permite renombrar y cambiar `fecha`, `estado` y `observacion`. Sólo aplica sobre eventos de la organización del header.

### `DELETE /api/buffet/events/:id`

**`400`** si el evento tiene ventas cargadas (borrarlo en cascada se llevaría las ventas sin devolver el stock). Hay que eliminar las ventas primero.

### `GET /api/buffet/sales`

Query params opcionales: `event_id` (el que usa el detalle de evento), `from`, `to` (rango sobre `sale_date`), `event` (búsqueda parcial sobre el nombre del evento guardado en la venta).

**Respuesta 200:** `{ sales: [...], summary: { sales_count, total_amount } }`, donde cada venta trae sus `items` y el `items_count`.

### `POST /api/buffet/sales`

**Body:**
```json
{
  "event_id": "uuid",
  "payment_method": "efectivo",
  "observation": null,
  "items": [{ "product_id": "uuid|null", "combo_id": "uuid|null", "description": "Empanada de carne", "quantity": 3, "unit_price": 2500 }]
}
```

`event_id` es obligatorio (`400 "Falta el evento."`) y tiene que pertenecer a la organización del header (`400 "El evento no existe."`). `sale_date` y `event_name` salen del evento; `event_name` queda como snapshot.

El servidor **recalcula los totales** y **redondea `quantity` y `unit_price` a enteros**; los ítems sin producto/combo o con cantidad ≤ 0 se descartan. Si no queda ninguno: `400 "La venta debe tener al menos un ítem."`.

Registrar la venta descuenta stock (los combos se expanden a sus productos). Se permite stock negativo a propósito: en las ferias los productos son donaciones y no suelen tener stock cargado.

**Respuesta 201:** `{ id, total_amount }`.

### `PATCH /api/buffet/sales/:id`

Reemplaza el carrito entero de una venta en una sola transacción: devuelve el stock de los ítems anteriores y descuenta el de los nuevos. **Body:** `{ payment_method?, observation?, items }` (mismos ítems que el alta). **Respuesta 200:** `{ id, total_amount }`. `404` si la venta no existe en la organización.

### `DELETE /api/buffet/sales/:id`

Devuelve el stock descontado y borra la venta (los ítems caen por cascada). **Respuesta 200:** `{ "ok": true }`.

## Buffet: catálogo

Productos, combos y presupuestos comparten el mismo comportamiento (`apps/api/src/modules/buffet/crud.ts`): toda operación filtra por la organización activa además del id.

| Ruta | Body | Respuesta |
|---|---|---|
| `GET /api/buffet/meta` | — | `{ categories, units, suppliers }`: catálogos para los formularios. Las categorías sin organización son globales; las unidades son un catálogo global. |
| `GET /api/buffet/products` | — | Lista con `id, name, stock_current, sale_price, observation, active, is_donated, category_id, unit_id` más `category_name`, `unit_name`, `unit_abbreviation` y `pack_size`. |
| `POST /api/buffet/products` | `{ name, category_id?, unit_id?, stock_current?, sale_price?, observation?, active?, is_donated? }` | `201 { id }` |
| `PATCH /api/buffet/products/:id` | Igual que el alta (reemplaza todos los campos) | `{ id }` · `404` si no existe |
| `DELETE /api/buffet/products/:id` | — | `{ ok: true }` · `409` si tiene ventas que lo referencian |
| `GET /api/buffet/combos` | — | Lista con `id, name, description, sale_price, active, items_count` |
| `POST` · `PATCH` · `DELETE /api/buffet/combos[/:id]` | `{ name, description?, sale_price?, active? }` | Igual que productos |
| `GET /api/buffet/budgets` | — | Lista con `id, title, client_name, observation, status, total_amount, items_count` |
| `POST` · `PATCH` · `DELETE /api/buffet/budgets[/:id]` | `{ title, client_name?, observation?, status?, total_amount? }` (`status` por defecto `borrador`) | Igual que productos |

Validaciones: `name` / `title` obligatorio; `sale_price` y `total_amount` no negativos; `stock_current` puede ser negativo; `category_id` y `unit_id` son uuid o vacío.

---

## `GET /api/auth/me`

Devuelve la sesión actual si el token es válido y el email está registrado. El frontend lo usa justo después del login para decidir si mostrar la app, la pantalla de "no autorizado" o el link al panel. `auth.js` lo guarda en `window.currentUser`.

**Respuesta 200:**
```json
{
  "email": "persona@gmail.com",
  "organizacion_id": "uuid | null",
  "organizations": [{ "id": "uuid", "name": "Oratorio de Garay" }],
  "roles": [{ "rol": "admin", "organizacion_id": "uuid" }],
  "es_superadmin": false,
  "organizaciones_admin": ["uuid"],
  "puede_administrar": true
}
```

## Administración (`/api/admin/*`)

Router en `backend/api/admin.js`. Todas las rutas exigen ser **admin de al menos una organización o superadmin** (`requireAdmin`); las marcadas con 🔒 exigen **superadmin**. Las reglas finas (scope, a quién se puede modificar) las aplica la base: ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

Los errores esperables devuelven `{ "error": "<mensaje en español>" }` con 400 (dato inválido), 403 (sin permiso), 404 (no encontrado o fuera de scope) o 409 (duplicado).

| Método y ruta | Body | Respuesta |
|---|---|---|
| `GET /api/admin/usuarios` | — | Usuarios con alguna membresía en el scope (el superadmin ve todos): `[{ id, email, nombre, created_at, organizaciones: [{id, nombre}], roles: [{rol, nombre, alcance, organizacion_id, organizacion_nombre}], editable }]`. Sólo se incluyen las organizaciones del scope. La búsqueda se hace en el cliente. |
| `POST /api/admin/usuarios` | `{ email, nombre?, organizaciones: [uuid] }` (≥1) | **201** `{ id, email, creado, organizaciones_agregadas }`. Si el email ya existía se le agrega el acceso. |
| `PATCH /api/admin/usuarios/:id` | `{ nombre?, organizaciones: [uuid] }` | `{ id, email, eliminado }`. Reemplaza las membresías **dentro del scope**. Con `[]` le quita el acceso; si no le queda ninguna, `eliminado: true`. |
| `DELETE /api/admin/usuarios/:id` | — | `{ id, email, eliminado }`. Le quita todas las membresías del scope. |
| `GET /api/admin/organizaciones` | — | Organizaciones del scope: `[{ id, nombre, created_at, miembros, admins }]`. |
| `GET /api/admin/roles` | — | Catálogo: `[{ codigo, nombre, descripcion, alcance, asignable_desde_panel }]`. |
| `GET /api/admin/auditoria?limit=` | — | Últimas N filas (default 100, máx. 500) dentro del scope, más las propias. |
| 🔒 `POST /api/admin/roles/asignaciones` | `{ email, nombre?, rol, organizaciones: [uuid] }` | `{ id, email }`. Deja el rol **exactamente** en esas organizaciones (reemplazo). Crea el usuario y las membresías que falten. Si el rol es por organización exige ≥1 organización; si es global, ninguna. |
| 🔒 `DELETE /api/admin/usuarios/:id/roles/:rol` | — | `{ id, email, eliminado }`. |
| 🔒 `POST /api/admin/organizaciones` | `{ nombre }` | **201** `{ id, nombre }` |
| 🔒 `PATCH /api/admin/organizaciones/:id` | `{ nombre }` | `{ id, nombre }` |

### Solicitudes

Las listan y resuelven los admins (las de sus organizaciones) y los superadmins (todas, incluidos los pedidos de espacio nuevo). Forma de una solicitud:

```json
{
  "id": "uuid", "numero": 12, "tipo": "registro_usuario", "tipo_nombre": "Registro de usuario",
  "estado": "pendiente | aceptada | rechazada | cancelada",
  "solicitante_email": "x@gmail.com", "solicitante_nombre": "María Pérez",
  "organizacion_id": "uuid | null", "organizacion_nombre": "Oratorio de Garay | null",
  "datos": { "espacio_nuevo": true, "nombre_espacio": "Escuadra 4", "organizacion_creada": true, "rol_asignado": "admin" },
  "aprobador_id": "uuid | null", "aprobador_email": "...", "aprobador_nombre": "...",
  "comentario_aprobador": "texto | null",
  "created_at": "...", "tomada_at": "...", "resuelta_at": "..."
}
```

| Endpoint | Body | Respuesta |
|---|---|---|
| `GET /api/admin/solicitudes?estado=` | — | `[solicitud]` del scope, pendientes primero. `estado` opcional. |
| `POST /api/admin/solicitudes/:id/tomar` | — | `solicitud`. El actor queda como aprobador; sigue pendiente. Reasigna si ya la tenía otro. |
| `POST /api/admin/solicitudes/:id/resolver` | `{ decision: "aceptar" \| "rechazar", comentario?, organizacion_id?, nombre_espacio? }` | `solicitud` + `notificados` (mails enviados). Para un espacio nuevo (sólo superadmin): `organizacion_id` lo asigna a uno existente (miembro, sin rol); si no, se crea con `nombre_espacio` (o el pedido) y queda admin. `409` si ya estaba resuelta. |

### Notificaciones push

Un admin envía un título y un texto a **todos los dispositivos** de uno o varios usuarios de una organización que administra (el superadmin, de cualquiera), **ahora o programado** para una fecha y hora futuras. Si el server no tiene claves VAPID responde `503`. Forma de una notificación:

```json
{
  "id": "uuid", "organizacion_id": "uuid", "organizacion_nombre": "Oratorio de Garay",
  "remitente_email": "admin@gmail.com", "destinatario_email": "x@gmail.com", "destinatario_nombre": "María Pérez",
  "titulo": "Cambio de horario", "texto": "El sábado arrancamos a las 15.",
  "estado": "pendiente | programada | enviando | enviada | parcial | fallida | sin_dispositivos | cancelada",
  "dispositivos_total": 2, "enviados": 2, "fallidos": 0,
  "created_at": "...", "enviada_at": "... | null",
  "programada_para": "... | null", "lote_id": "uuid", "cancelada_at": "... | null", "motivo": "... | null"
}
```

Se crea **una notificación por destinatario** (mismo `lote_id`), cada una con su estado y contadores.

- **Inmediata** (sin `programada_para`): el endpoint envía a todos los dispositivos y espera la respuesta de los servicios push antes de contestar.
- **Programada** (con `programada_para`): sólo crea las notificaciones en estado `programada`. Las envía el despachador (`POST /api/push/despachar`, lo dispara `pg_cron` cuando hay alguna vencida), por lo que salen con **hasta ~1 minuto de demora**. Al enviarse se vuelve a validar que el destinatario siga siendo miembro de la organización; si no, queda `fallida` con el `motivo`.

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/admin/notificaciones` | `{ organizacion_id, destinatarios_email: [email] (1–50), titulo (≤65), texto (≤240), programada_para? }`. `programada_para` es una fecha ISO 8601 (el cliente manda UTC) y **tiene que ser posterior a ahora**. También se acepta `destinatario_email` (uno solo). | **201** `{ lote_id, notificaciones: [notificacion], rechazados: [email] }`. Un destinatario que no es miembro de la organización no aborta el lote: va en `rechazados` (no se revela si existe). `sin_dispositivos` si el usuario no activó las notificaciones (queda registrada igual). `403` si no administra la organización, `404` si **ningún** destinatario es miembro, `400` si faltan campos, se pasan de largo, hay más de 50 destinatarios o la fecha no es posterior a ahora. |
| `GET /api/admin/notificaciones?organizacion_id=&limit=` | — | `[notificacion]` del scope: primero las `programada`/`enviando`, después las más nuevas (default 50, máx. 200). `organizacion_id` opcional. |
| `GET /api/admin/dispositivos?organizacion_id=` | — | `[{ email, nombre, organizaciones: [{id, nombre}], dispositivos: [{ id, user_agent, servicio, created_at, ultimo_uso_at, desactivado_at }] }]`: los usuarios del scope (miembros de las organizaciones que administra) con sus dispositivos; `desactivado_at` no nulo = el servicio push lo dio por vencido (p. ej. el usuario las desactivó desde el navegador) y no recibe envíos; `dispositivos: []` si nunca activó nada. `servicio` es sólo el host del endpoint push. **No** se devuelven `endpoint`, `p256dh` ni `auth`. Primero los que tienen dispositivos. `organizacion_id` opcional. |
| `DELETE /api/admin/notificaciones/:id` | — | La `notificacion` en estado `cancelada`. `409` si ya no está `programada` (una inmediata o ya enviada no se cancela), `404` si no existe o es de una organización fuera de su scope. |

#### `POST /api/push/despachar`

Lo llama el cron de la base (`pg_cron` + `pg_net`) y **no usa sesión de usuario**: se autentica con `Authorization: Bearer <CRON_SECRET>` (comparación en tiempo constante) y no lee nada del body. Toma hasta 20 notificaciones vencidas, las envía y las cierra. `200 { procesadas }`, `401` si el secreto no coincide, `503` si falta `CRON_SECRET` o las claves VAPID. Es la única ruta de `/api` exceptuada de la sesión (ver `backend/api/index.js`).

### Dispositivos push (`/api/push/*`)

Los usa cualquier usuario con sesión sobre **sí mismo** (el email sale del token, nunca del body). No exigen organización activa. Responden `503` si el push no está configurado.

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/push/suscripciones` | La `PushSubscription` del navegador: `{ endpoint, keys: { p256dh, auth } }` | **201** `{ id, renovar }`. Upsert por `endpoint`; reactiva un dispositivo desactivado. `renovar` es `true` si el endpoint no existía o estaba desactivado (el frontend entonces crea una suscripción nueva y la registra). El frontend lo llama en cada carga para auto-repararse. `400` si el endpoint no es de un servicio push conocido (FCM, Mozilla, Apple, Windows). Hasta 20 dispositivos por usuario: se descartan los más viejos. |
| `DELETE /api/push/suscripciones` | `{ endpoint }` | `{ eliminados }`. Sólo borra un dispositivo propio. |

`GET /config.js` suma `window.VAPID_PUBLIC_KEY` (vacía si el push no está configurado).

## Registro (`/api/registro/*`)

Router en `backend/api/registro.js`. Sólo exige una sesión válida (`requireSession`), no estar registrado: lo usa quien inició sesión pero todavía no tiene acceso. Todo se hace sobre el email de la sesión.

| Endpoint | Body | Respuesta |
|---|---|---|
| `GET /api/registro` | — | `{ email, nombre_sugerido, registrado, solicitud, espacios: [{id, nombre}] }`. `solicitud` es la última (en cualquier estado) o `null`. |
| `POST /api/registro/solicitudes` | `{ nombre, organizacion_id }` o `{ nombre, nombre_espacio }` | **201** `solicitud` + `notificados`. Avisa por mail a los superadmins y a los admins del espacio. `409` si ya tiene una pendiente, si el espacio nuevo ya existe o si ya tiene acceso. |
| `POST /api/registro/solicitudes/:id/cancelar` | — | `solicitud` cancelada. Sólo la propia, pendiente y sin tomar (`409` si ya la tomaron). |

## `GET /api/health`

Única ruta sin autenticación. Usada por monitoreo de uptime.

**Respuesta 200:** `{ "status": "ok" }`

---

## Errores

Formato uniforme: `{ "error": "mensaje" }`, con `code` cuando el frontend tiene que distinguir el caso (`SIN_REGISTRO`, `SIN_ORGANIZACION`). Las rutas no arman respuestas de error: lanzan, y `manejarError` (`apps/api/src/lib/errores.ts`) responde.

| Status | Cuándo |
|---|---|
| `400` | El pedido no pasa la validación del esquema (mensaje del campo que falla), un id con formato inválido, o un JSON mal formado |
| `401` | Sin token, o token inválido o vencido |
| `403` | Sin acceso, sin organización, organización ajena, o sin el rol necesario |
| `404` | El recurso no existe **en la organización activa**, o la ruta no existe |
| `409` | Duplicado, estado que no permite la operación, o algo que otros datos referencian |
| `500` | Inesperado. La respuesta es genérica (`"Ocurrió un error inesperado. Intentá de nuevo."`); el detalle queda sólo en el log del servidor |
| `503` | Push o despacho sin configurar en este entorno |

Los errores de las funciones SQL (cualquier ruta, no sólo `/api/admin`) se traducen por SQLSTATE y conservan el mensaje en español que arma la función (ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#errores-de-las-funciones)).

### Cambios respecto del backend anterior (Express)

Las rutas y la forma de las respuestas exitosas son las mismas. Cambió esto:

- **Validación:** antes los datos faltantes o mal formados terminaban casi siempre en `500` con el error de Postgres; ahora son `400` con un mensaje en español. Los mensajes de validación que estaban en inglés (`"Missing student_id or fecha"`) pasaron a español.
- **No encontrado:** `PATCH /api/buffet/events/:id` sobre un evento inexistente devolvía `500`; ahora `404`.
- **Errores inesperados:** el `500` ya no incluye el mensaje interno de la base.
- **`GET /api/lookups`:** `edades` devolvía las categorías de **todas** las organizaciones (aparecían repetidas en el formulario); ahora sólo las de la organización activa. La respuesta lleva `Cache-Control: private, max-age=300`.
- **`GET /api/attendance/by-date`:** una sola consulta en vez de dos; misma respuesta.
- **`POST /api/students`:** `telefono_emergencia` se guarda sólo con sus dígitos.
- **Rutas inexistentes bajo `/api`:** responden `404` en JSON.
- **CORS:** ya no se aceptan pedidos desde cualquier origen; la app y la API comparten origen.
