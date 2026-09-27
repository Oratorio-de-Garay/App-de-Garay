# Roles y permisos

Cómo se decide quién entra a la app, qué datos ve y quién puede administrar a quién. La implementación está en:

- **Base de datos:** [`supabase/migrations/20260926000000_roles_y_admin.sql`](../supabase/migrations/20260926000000_roles_y_admin.sql). Contiene las tablas, las funciones con todas las reglas y la auditoría.
- **Backend:**
  - [`backend/api/auth.js`](../backend/api/auth.js): middleware de sesión y guards.
  - [`backend/api/admin.js`](../backend/api/admin.js): endpoints del panel.
- **Frontend:**
  - [`frontend/admin.html`](../frontend/admin.html) y [`admin.js`](../frontend/admin.js): panel de administración.
  - [`frontend/auth.js`](../frontend/auth.js): link al panel y redirecciones.

## Conceptos

| Concepto | Tabla | Qué significa |
|---|---|---|
| **Usuario** | `usuarios` | Un email de Google habilitado para loguearse. Se da de alta **antes** de que la persona entre por primera vez. Cuando inicia sesión con Google, el backend encuentra su email y la deja pasar. |
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
| Ver la actividad (auditoría) | — | La de X, más la propia | Toda |

1. Ser superadmin **no** da acceso a los datos de las organizaciones. Para usar Registro o Buffet de una organización tiene que ser miembro, como cualquiera.
2. El admin sólo ve y modifica las membresías de las organizaciones que administra. Si la persona además pertenece a otra organización, esa membresía no se toca y el admin ni siquiera la ve.

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
| `23505` | 409 | Nombre de organización duplicado. |
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
