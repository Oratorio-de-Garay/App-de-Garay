# Changelog

Registro de cambios relevantes del proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): lo más nuevo arriba, agrupado en *Agregado*, *Cambiado*, *Eliminado*, *Corregido* y *Seguridad*.

Al hacer un cambio relevante, sumalo en **Sin publicar**. Si toca la base, incluí el nombre de la migración.

## Sin publicar

### Agregado

- **Registro abierto con aprobación.** Cualquiera puede crear una cuenta, pero no tiene acceso a nada hasta que lo aprueben:
  - **Login con el mail**, además de Google: se escribe el mail y se ingresa un código de 6 dígitos, sin contraseña. Es el mismo flujo para registrarse y para entrar.
  - **Pantalla de registro** (`frontend/registro.js`):
    - Quien no tiene acceso pone su nombre y elige un espacio de la lista "Espacios", o "Nuevo".
    - La solicitud queda pendiente, y se puede cancelar mientras nadie la tome.
  - **Pestaña Solicitudes** en el panel:
    - Contador de pendientes.
    - Tomar, aceptar o rechazar con comentario.
    - Para un espacio nuevo, el superadmin puede corregir el nombre o asignarlo a uno que ya existía.
  - **Mails** (Gmail por SMTP, `backend/api/mail.js`):
    - A los superadmins y admins del espacio cuando hay una solicitud nueva, con un link directo a ella.
    - Al solicitante cuando se resuelve.
- **Solicitudes genéricas** (migración `20260928000000_solicitudes.sql`):
  - Tablas `solicitud_tipos` y `solicitudes`: estado, aprobador, comentario y datos por tipo.
  - Funciones `registro_*` y `admin_*_solicitud*`.
  - Cuatro acciones nuevas de auditoría.
  - Tests pgTAP en `supabase/tests/solicitudes.test.sql`.
- **Endpoints** `/api/registro/*` y `/api/admin/solicitudes*`.
- **Volver al link después del login:** si alguien abre un link sin sesión (ej: el de un mail), después de iniciar sesión, con Google o con código, vuelve a ese link y no al inicio.

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
- **Schema base versionado:** `20260730210820_remote_schema.sql`, que estaba vacía, ahora contiene las tablas que se habían creado a mano (`organizaciones`, `niveles_grados_pibes`, `grados_pibes`, `edades`, `pibes`, `asistencias`), `buscar_pibes`, el event trigger `ensure_rls` y los privilegios por defecto del proyecto. Las migraciones del repo reconstruyen la base de producción **sin diferencias**, verificado con `supabase db dump`.
- **Stack local de Supabase:**
  - `supabase/config.toml`, con Postgres 17 como producción.
  - `supabase/seed.sql`, con lookups y un pibe de prueba por organización.
- **Tests de la base** (pgTAP, `supabase/tests/`): 32 pruebas de roles, scope, constraints, auditoría y acceso directo. Se corren con `supabase test db`.
- **App completa en local:**
  - `npm run dev:local` con `backend/.env.local` apunta a Supabase local.
  - El frontend toma la configuración de `GET /config.js` en lugar de tenerla hardcodeada en cada HTML.
  - Con base local, el login suma un magic link que llega a Mailpit.
  - El seed trae usuarios de prueba (admin y miembro).
- **CI** (`.github/workflows/base-de-datos.yml`): en cada PR que toca `supabase/`, aplica las migraciones sobre una base vacía y corre los tests.

### Cambiado

- **Cuenta sin acceso:**
  - Ya no ve "Acceso no autorizado", sino la pantalla de registro.
  - `/api/auth/me` responde `403` con `code: "SIN_REGISTRO"`.
- **Login en local:** se entra con el código por mail, que llega a Mailpit. Se eliminó el magic link de desarrollo.
- **`allowed_emails` pasa a llamarse `usuarios`:**
  - `note` pasa a ser `nombre`.
  - Se agregan `id`, `created_by` y `updated_at`.
  - `organizacion_miembros.email` ahora es FK a `usuarios` (`on delete cascade`).
  - Hubo una vista temporal `allowed_emails` de compatibilidad durante el deploy; se borró en `20260927010000_borrar_vista_allowed_emails.sql`.
- **Middleware `requireAllowedUser`:**
  - Resuelve usuario, membresías y roles con una sola consulta (`contexto_usuario`) en lugar de dos.
  - Un superadmin sin organizaciones puede entrar, pero sólo al panel.
- **Superadmin sin organizaciones:** Registro y Buffet lo redirigen a `admin.html` y el menú oculta esos links.
- El nombre de una organización ahora es único sin importar mayúsculas ni espacios.

### Corregido

- **Login de usuarios habilitados en un navegador compartido:**
  - **Qué pasaba:** la organización activa guardada en el navegador (de otro usuario que había usado la misma computadora) se mandaba también en `/api/auth/me`. El backend respondía 403 y un usuario recién dado de alta veía "Acceso no autorizado".
  - **Arreglo:**
    - `/me` ya no manda la organización, y el backend la ignora en esa ruta.
    - Al cerrar sesión se borra la organización guardada.
- **La app parpadeaba antes de "Acceso no autorizado":**
  - **Qué pasaba:** mientras se verificaba el acceso se veía la página vacía con su encabezado, y `/me` se pedía tres veces por login.
  - **Arreglo:** ahora se muestra "Verificando tu acceso…" desde el primer instante, sin encabezado, y `/me` se pide una sola vez por sesión.

- **Registro (`frontend/index.js`):** `init()` se ejecutaba dos veces, una al cargar la página (antes del login) y otra al confirmarse la sesión. Por eso cada listener quedaba registrado dos veces (Enter disparaba dos búsquedas) y se pedía `/api/lookups` sin sesión. Ahora sólo lo llama `auth.js`; la fecha del header se pinta aparte, al cargar.
- **Migración `20260811000000_buffet_grants.sql`:** por su timestamp corría antes de `20260812000000_buffet.sql`, que crea las tablas, y sobre una base limpia fallaba.
  - Los grants se movieron al final de `20260812000000_buffet.sql`.
  - `20260811` ahora sólo otorga sobre las tablas que ya existan.
  - No se renombró el archivo porque su versión ya figura como aplicada en el historial remoto. En producción no cambia nada.

### Eliminado

- Columna `organizacion_miembros.rol`. Nunca se leía; los roles viven en `usuario_roles`.

### Seguridad

- **Exposición de datos cerrada** (`20260927000000_cerrar_acceso_publico.sql`, **aplicada en producción el 2026-09-27**).
  - **Qué pasaba:** el schema original tenía políticas `public read/insert/update` con `USING (true)` y sin `TO`, más `GRANT ALL` a `anon` sobre `pibes` y `asistencias`.
  - **Impacto:** cualquiera con la publishable key (visible en el HTML) podía leer, crear y modificar los datos de los chicos (55 pibes, 336 asistencias), incluidos teléfonos de emergencia, directo por la API de Supabase. También cualquier cuenta de Google logueada aunque no estuviera registrada.
  - **Arreglo:**
    - Se eliminaron esas políticas.
    - Se revocó todo a `anon`, incluida `buscar_pibes`.
    - Los catálogos quedaron legibles sólo para `authenticated`.
  - **Efecto en la app:** ninguno, porque el backend usa `service_role`.

- **Funciones del panel:** sólo `service_role` puede ejecutarlas (se revocó `EXECUTE` a `anon` y `authenticated`).
- **Escritura desde el cliente:** se revocaron `INSERT`/`UPDATE`/`DELETE` de `anon` y `authenticated` sobre `organizaciones` y `organizacion_miembros`. RLS ya lo bloqueaba; esto agrega una capa más.
- **RLS en las tablas nuevas:** cada usuario sólo lee lo propio y no hay políticas de escritura.

## 2026-08 y anteriores

Cambios previos a este registro. Ver `git log` y las migraciones en `supabase/migrations/`:

- Allowlist de emails.
- Buffet: productos, combos, presupuestos, ventas y eventos.
- Multi-organización.
