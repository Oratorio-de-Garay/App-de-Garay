# Changelog

Registro de cambios relevantes del proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): lo más nuevo arriba, agrupado en *Agregado*, *Cambiado*, *Eliminado*, *Corregido* y *Seguridad*.

Al hacer un cambio relevante, sumalo en **Sin publicar**. Si toca la base, incluí el nombre de la migración.

## Sin publicar

### Agregado

- **Panel de administración** (`frontend/admin.html`). Lo ven sólo admins y superadmins, y tiene cuatro pestañas:
  - **Usuarios**:
    - Alta de un email de Google con una o más organizaciones (ambos requeridos) y nombre opcional.
    - Listado con búsqueda y filtro por organización.
    - Edición y quitar acceso.
  - **Roles**, sólo superadmin: asignar el rol admin con una o más organizaciones (requeridas), editar sus organizaciones o quitarlo.
  - **Organizaciones**, sólo superadmin: crear y renombrar.
  - **Actividad**: historial de cambios de administración, filtrado según el scope de cada uno.
- **Roles** (migración `20260926000000_roles_y_admin.sql`):
  - Catálogo extensible `roles`, con alcance `global` o `organizacion`.
  - Asignaciones en `usuario_roles`.
  - Roles iniciales: `superadmin` (global) y `admin` (por organización).
  - Superadmin inicial: `oratoriogarayy@gmail.com`.
- **Auditoría:** tabla `auditoria_admin`, con una fila por alta, cambio de acceso, rol u organización.
- **Funciones SQL del panel:**
  - `admin_alta_usuario`, `admin_editar_usuario`, `admin_quitar_acceso`.
  - `superadmin_asignar_rol`, `superadmin_quitar_rol`, `superadmin_guardar_organizacion`.
  - Los listados `admin_listar_*` y `contexto_usuario`.
  - Aplican el scope en la base y hacen cada operación en una sola transacción.
- **Endpoints** `/api/admin/*` (`backend/api/admin.js`) y los guards `requireOrganization`, `requireAdmin` y `requireSuperadmin`.
- **`GET /api/auth/me`** ahora devuelve `roles`, `es_superadmin`, `organizaciones_admin` y `puede_administrar`.
- Link "Administración" en el menú lateral, sólo para quien puede administrar.
- Documentación nueva: [docs/ROLES_Y_PERMISOS.md](docs/ROLES_Y_PERMISOS.md) y este CHANGELOG.

### Cambiado

- **`allowed_emails` pasa a llamarse `usuarios`:**
  - `note` pasa a ser `nombre`.
  - Se agregan `id`, `created_by` y `updated_at`.
  - `organizacion_miembros.email` ahora es FK a `usuarios` (`on delete cascade`).
  - Queda una **vista temporal `allowed_emails`** (sólo `service_role`) para que el backend anterior siga funcionando hasta que se despliegue este cambio. Hay que borrarla en una migración posterior al deploy.
- **Middleware `requireAllowedUser`:**
  - Resuelve usuario, membresías y roles con una sola consulta (`contexto_usuario`) en lugar de dos.
  - Un superadmin sin organizaciones puede entrar, pero sólo al panel.
- **Superadmin sin organizaciones:** Registro y Buffet lo redirigen a `admin.html` y el menú oculta esos links.
- El nombre de una organización ahora es único sin importar mayúsculas ni espacios.

### Eliminado

- Columna `organizacion_miembros.rol`. Nunca se leía; los roles viven en `usuario_roles`.

### Seguridad

- **Funciones del panel:** sólo `service_role` puede ejecutarlas (se revocó `EXECUTE` a `anon` y `authenticated`).
- **Escritura desde el cliente:** se revocaron `INSERT`/`UPDATE`/`DELETE` de `anon` y `authenticated` sobre `organizaciones` y `organizacion_miembros`. RLS ya lo bloqueaba; esto agrega una capa más.
- **RLS en las tablas nuevas:** cada usuario sólo lee lo propio y no hay políticas de escritura.

## 2026-08 y anteriores

Cambios previos a este registro. Ver `git log` y las migraciones en `supabase/migrations/`:

- Allowlist de emails.
- Buffet: productos, combos, presupuestos, ventas y eventos.
- Multi-organización.
