# Roles y permisos

Cómo se decide quién entra a la app, qué datos ve y quién puede administrar a quién. La implementación está en:

- **Base de datos:**
  - [`supabase/migrations/20260926000000_roles_y_admin.sql`](../supabase/migrations/20260926000000_roles_y_admin.sql): tablas, funciones con todas las reglas y auditoría.
  - [`supabase/migrations/20260928000000_solicitudes.sql`](../supabase/migrations/20260928000000_solicitudes.sql): registro abierto y solicitudes.
- **Backend:**
  - [`backend/api/auth.js`](../backend/api/auth.js): middleware de sesión y guards.
  - [`backend/api/admin.js`](../backend/api/admin.js): endpoints del panel.
  - [`backend/api/registro.js`](../backend/api/registro.js): pantalla de registro (quien todavía no tiene acceso).
  - [`backend/api/mail.js`](../backend/api/mail.js): avisos por mail de las solicitudes.
- **Frontend:**
  - [`frontend/admin.html`](../frontend/admin.html) y [`admin.js`](../frontend/admin.js): panel de administración.
  - [`frontend/auth.js`](../frontend/auth.js): login (Google o código por mail), link al panel y redirecciones.
  - [`frontend/registro.js`](../frontend/registro.js): pantalla para pedir acceso a un espacio.

## Conceptos

| Concepto | Tabla | Qué significa |
|---|---|---|
| **Usuario** | `usuarios` | Un email habilitado para usar la app. Entra por dos caminos: un admin lo da de alta desde el panel, o la persona se registra sola y un admin **acepta su solicitud**. Cuando inicia sesión (Google o código por mail), el backend encuentra su email y la deja pasar. |
| **Solicitud** | `solicitudes` | Un pedido que tiene que aprobar un admin o superadmin, como un ticket. Hoy el único tipo es `registro_usuario`: sumarse a un espacio o crear uno nuevo. |
| **Membresía** | `organizacion_miembros` | El usuario puede ver y operar los datos (pibes, asistencias, buffet) de esa organización. |
| **Rol** | `roles` (catálogo) + `usuario_roles` (asignaciones) | Permisos extra. Pueden ser **globales** (sin organización) o **por organización**. |

### Invariantes

- **Un usuario sin organizaciones y sin rol global no existe.**
  - Quitarle la última organización borra al usuario, y vuelve a ver "Acceso no autorizado".
  - Queda el registro en la auditoría.
- **Un rol por organización exige ser miembro de esa organización.**
  - Lo garantiza un FK `(email, organizacion_id) → organizacion_miembros`.
  - Si se quita la membresía, el rol cae solo (`on delete cascade`).
- **Un rol global no lleva organización y uno por organización sí la lleva.**
  - Lo garantiza el check `(alcance = 'organizacion') = (organizacion_id is not null)`.
  - El FK compuesto `(rol, alcance) → roles(codigo, alcance)` impide declarar un alcance distinto al del catálogo.

## Roles actuales

| Rol | Alcance | Se asigna desde | Puede |
|---|---|---|---|
| *(miembro)* | por organización | Panel (Usuarios) | Usar Registro y Buffet de sus organizaciones. No es un rol: es tener la membresía. |
| `admin` | por organización | Panel (Roles), sólo superadmin | Todo lo del miembro, más dar de alta, editar y quitar el acceso a usuarios **dentro de las organizaciones que administra**. |
| `superadmin` | global | **Sólo SQL** | Todo lo que puede un admin, **en todas las organizaciones**. Además asigna y quita roles, y crea y renombra organizaciones. No necesita organización para entrar al panel. |

### Matriz de permisos

| Acción | Miembro | Admin de X | Superadmin |
|---|:-:|:-:|:-:|
| Ver datos de una organización | Si es miembro | Si es miembro | Si es miembro¹ |
| Entrar al panel de administración | — | ✓ | ✓ |
| Dar de alta un email en X | — | ✓ | ✓ |
| Dar de alta un email en Y (no administrada) | — | ✗ | ✓ |
| Editar o quitar el acceso a un miembro de X | — | ✓² | ✓ |
| Editar a otro admin de X o a un superadmin | — | ✗ | ✓ |
| Asignar o quitar roles | — | ✗ | ✓ |
| Crear o renombrar organizaciones | — | ✗ | ✓ |
| Ver y resolver solicitudes para sumarse a X | — | ✓ | ✓ |
| Ver y resolver pedidos de espacio nuevo | — | ✗ | ✓ |
| Ver la actividad (auditoría) | — | La de X, más la propia | Toda |

1. Ser superadmin **no** da acceso a los datos de las organizaciones. Para usar Registro o Buffet de una organización tiene que ser miembro, como cualquiera.
2. El admin sólo ve y modifica las membresías de las organizaciones que administra. Si la persona además pertenece a otra organización, esa membresía no se toca y el admin ni siquiera la ve.

## Registro y solicitudes

Cualquiera puede crear una cuenta, con Google o con su mail y un código de 6 dígitos (Supabase OTP, sin contraseña). Crear la cuenta **no da acceso a nada**:

1. **Sin acceso:** si el email no está en `usuarios`, `/api/auth/me` responde `403 SIN_REGISTRO` y el frontend muestra la pantalla de registro.
2. **Pedido:** la persona escribe su nombre y elige un espacio de la lista **"Espacios"** o **"Nuevo"** (con el nombre del espacio). Se crea una solicitud `pendiente` y se avisa por mail:
   - Sumarse a X: a los admins de X y a los superadmins.
   - Espacio nuevo: sólo a los superadmins.
3. **Revisión:** en la pestaña **Solicitudes** del panel. El link del mail abre directamente esa solicitud.
   - **Tomar:** el aprobador queda asignado (`aprobador_id`) y la solicitud sigue pendiente. Otro aprobador puede reasignársela. Resolver sin tomarla también la asigna.
   - **Aceptar** sumarse a X: se da de alta como miembro de X (`admin_alta_usuario`).
   - **Aceptar** un espacio nuevo (sólo superadmin): se crea el espacio (el nombre se puede corregir) y la persona queda **admin**. Si el espacio ya existía, el superadmin lo asigna a ese y la persona queda **miembro, sin rol**.
   - **Rechazar**, con un comentario opcional.
4. **Resultado:** le llega un mail al solicitante con el estado y el comentario. Si fue rechazada puede mandar otra.

Reglas:

- **Una sola pendiente por persona** (índice único parcial), y no se puede pedir crear un espacio con el nombre de uno existente.
- **Cancelar:** el solicitante puede cancelar la suya mientras nadie la haya tomado (estado `cancelada`).
- **Scope:** un admin ve y resuelve sólo las solicitudes de las organizaciones que administra; fuera de su scope una solicitud se informa como inexistente (`P0002`). Los pedidos de espacio nuevo no tienen organización hasta que se aceptan, así que sólo los ve el superadmin.
- **Una solicitud resuelta no se vuelve a resolver** (`55000`).
- **Lista de espacios:** cualquier cuenta con sesión ve los nombres de las organizaciones (sólo `id` y `nombre`). Es necesario para poder elegir.

Estas reglas están cubiertas por [`supabase/tests/solicitudes.test.sql`](../supabase/tests/solicitudes.test.sql).

## Dónde se aplican las reglas

1. **Backend (`requireAllowedUser`)**
   - Valida el token de Google.
   - Llama a `contexto_usuario(email)`, que devuelve en una sola consulta: si está registrado, organizaciones, roles y organizaciones administradas.
   - Deja todo en `req.user`.
   - Un superadmin sin membresías pasa con `organizationId = null`.
2. **Backend (guards):**
   - `requireOrganization`: aplica a todas las rutas de datos y devuelve 403 `SIN_ORGANIZACION` si no hay organización activa.
   - `requireAdmin`: aplica a todo `/api/admin`.
   - `requireSuperadmin`: aplica a roles y organizaciones.
3. **Base de datos (funciones del panel):** es la fuente de verdad.
   - **Actor explícito:** cada función recibe al actor (`p_actor` = email de la sesión) y vuelve a calcular su scope. Aunque un endpoint futuro olvide un guard, la base no permite salirse del scope.
   - **Atomicidad:** cada operación es una única transacción junto con su auditoría. supabase-js no tiene transacciones, así que es la única forma de que un alta no quede a medias.
   - **Permisos de ejecución:** las funciones sólo las puede ejecutar `service_role`. Se revocó `EXECUTE` a `anon` y `authenticated`, para que nadie pueda llamarlas desde el cliente haciéndose pasar por otro actor.
4. **RLS** (defensa en profundidad, porque el backend usa la service role y la bypassea):
   - Desde el cliente cada uno sólo puede leer su propia fila de `usuarios` y `usuario_roles`.
   - El catálogo `roles` es legible.
   - `auditoria_admin` no es accesible.
   - No hay políticas de escritura en ninguna.
5. **Frontend:** oculta botones y pestañas según `currentUser`. **Es sólo UX, no control de acceso.**

Estas reglas están cubiertas por los tests pgTAP de [`supabase/tests/roles_y_permisos.test.sql`](../supabase/tests/roles_y_permisos.test.sql) (`supabase test db`). Si cambiás una regla, actualizá el test.

### Errores de las funciones

Las funciones levantan SQLSTATE específicos y el backend los traduce a HTTP (`responderRpc` en `admin.js`). El mensaje llega tal cual al usuario:

| SQLSTATE | HTTP | Cuándo |
|---|---|---|
| `42501` | 403 | Sin permiso: fuera de scope, objetivo protegido, o no es superadmin. |
| `22023` | 400 | Dato inválido: email mal formado, sin organizaciones, rol inexistente. |
| `P0002` | 404 | No encontrado. Un usuario fuera del scope del admin también se informa así, para no revelar que existe. |
| `23505` | 409 | Nombre de organización duplicado, o ya tiene una solicitud pendiente. |
| `55000` | 409 | La solicitud no está en un estado que lo permita: ya fue resuelta, ya la tomaron (al cancelar), o ya tiene acceso (al pedir). |
| `22P02` | 400 | Id con formato inválido en la URL. |

## Auditoría

Tabla `auditoria_admin`, con una fila por cambio atómico. Se ve en la pestaña **Actividad** del panel.

| `accion` | `organizacion_id` | `detalle` |
|---|---|---|
| `usuario_creado` | — | `{ nombre }` |
| `usuario_renombrado` | — | `{ antes, despues }` |
| `usuario_eliminado` | — | Se quedó sin organizaciones ni rol global. |
| `membresia_agregada` / `membresia_quitada` | la afectada | — |
| `rol_asignado` / `rol_quitado` | la afectada (nula si el rol es global) | `{ rol }` (y `motivo` si cayó por cascada) |
| `organizacion_creada` | la nueva | `{ nombre }` |
| `organizacion_renombrada` | la afectada | `{ antes, despues }` |
| `solicitud_creada` | la pedida (nula si es un espacio nuevo) | `{ numero, solicitud_id, nombre_espacio }`. El actor es el solicitante. |
| `solicitud_aceptada` / `solicitud_rechazada` | la final / la pedida | `{ numero, solicitud_id, comentario }` |
| `solicitud_cancelada` | la pedida | `{ numero, solicitud_id }`. El actor es el solicitante. |

El `actor_email` de los cambios hechos por migraciones es `'migracion'`.

## Operaciones frecuentes

### Agregar otro superadmin

No se puede desde el panel (a propósito: `asignable_desde_panel = false`). Se hace en el SQL Editor de Supabase:

```sql
insert into public.usuarios (email, nombre, created_by)
values ('persona@gmail.com', 'Nombre', 'sql')
on conflict (email) do nothing;

insert into public.usuario_roles (email, rol, alcance, created_by)
values ('persona@gmail.com', 'superadmin', 'global', 'sql')
on conflict do nothing;

insert into public.auditoria_admin (actor_email, accion, objetivo_email, detalle)
values ('sql', 'rol_asignado', 'persona@gmail.com', '{"rol": "superadmin"}');
```

Para quitarlo: `delete from public.usuario_roles where email = '...' and rol = 'superadmin';`. Si no tiene organizaciones, borrá también su fila de `usuarios`.

### Agregar un rol nuevo

1. Crear una migración que inserte la fila en `public.roles` con su `alcance` (`global` u `organizacion`). El panel lo va a ofrecer automáticamente en la pestaña Roles si `asignable_desde_panel = true`, y va a exigir organizaciones si el alcance es `organizacion`.
2. Definir qué habilita el rol:
   - **En el backend:** leer `req.user.roles` (array de `{ rol, organizacion_id }`) y agregar un guard, siguiendo el modelo de `requireAdmin`.
   - **Si debe poder administrar usuarios como un admin:** extender `organizaciones_administradas()` en una migración nueva.
3. Documentarlo en este archivo (tabla de roles y matriz) y en el [CHANGELOG](../CHANGELOG.md).
