# Arquitectura

## Resumen

App de registro de ingreso/asistencia de un oratorio (grupo juvenil parroquial). Monolito simple, sin build step: **un único proyecto Vercel** sirve tanto la API (Express) como el frontend estático (HTML/CSS/JS vanilla), desde el mismo origen. **Supabase** (Postgres) es la única base de datos y también resuelve la autenticación (Google SSO).

No hay framework de frontend, no hay ORM, no hay TypeScript, no hay tests automatizados. Es intencional: el proyecto es chico y lo mantiene un grupo de voluntarios, no un equipo dedicado.

## Estructura del repo

```
backend/
  api/
    index.js   ← app Express: todas las rutas /api/* + sirve frontend/ como estático
    auth.js    ← middleware: valida sesión Supabase, resuelve usuario/organización/roles + guards
    admin.js   ← router /api/admin/* (panel de administración)
  package.json
  vercel.json  ← única config de deploy (todas las rutas → api/index.js)
frontend/
  index.html   ← Registro (asistencias)
  buffet.html  ← Buffet
  admin.html   ← panel de administración (sólo admins/superadmins)
  auth.js      ← login con Google vía Supabase Auth; expone window.apiFetch() y window.currentUser
  nav.js       ← sidebar desplegable en mobile
  index.js / buffet.js / admin.js ← lógica de UI de cada página
  base.css (+ buffet.css, admin.css)
supabase/
  migrations/  ← migraciones versionadas — PARCIALES, ver DATABASE.md
docs/          ← esta documentación
```

Cada archivo `.js` del frontend se sirve tal cual al browser (sin bundler). El orden de carga en `index.html` importa: `supabase-js` (UMD, CDN) → `auth.js` → `index.js`.

## Despliegue (Vercel)

- Un solo proyecto Vercel, configurado en [`backend/vercel.json`](../backend/vercel.json).
- Todas las rutas (`/(.*)`) se enrutan a la función serverless `backend/api/index.js`.
- Dentro de esa función, Express sirve `frontend/` como estático (`express.static`) y expone `/api/*`. Por eso el frontend usa `API_URL = ""` (mismo origen) en vez de una URL absoluta — ver `frontend/index.html`.
- Variables de entorno se configuran en el dashboard de Vercel (Project → Settings → Environment Variables). Ver [SETUP.md](SETUP.md) para la lista completa.
- Cada push genera un **deploy preview** con URL única (`app-de-garay-<hash>-<team>.vercel.app`); `app-de-garay.vercel.app` es el alias estable de producción. Esto tiene implicancias directas en la configuración de OAuth (ver más abajo y SETUP.md).

## Autenticación y autorización

- **Login**: Google OAuth manejado enteramente por Supabase Auth (`supabaseClient.auth.signInWithOAuth`). No hay backend propio de sesión ni cookies — el estado de sesión vive en el cliente Supabase del browser.
- `frontend/auth.js` guarda la sesión y expone `window.apiFetch(path, options)`, un wrapper de `fetch` que agrega `Authorization: Bearer <access_token>` a cada llamada a `/api/*`. **Todo el código nuevo debe usar `apiFetch`, no `fetch` directo**, para no romper la autenticación.
- `backend/api/auth.js` valida ese token con `supabaseAdmin.auth.getUser(token)`, usando el **service role key** (bypassea RLS, nunca se expone al frontend). Después llama a `contexto_usuario(email)`, que devuelve si el email está en `usuarios`, sus organizaciones y sus roles, y deja todo en `req.user`.
- **Autorización:** hay tres niveles, miembro (tener la organización), `admin` (por organización) y `superadmin` (global). El modelo completo, la matriz de permisos y dónde se aplica cada regla están en **[ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md)**. Los usuarios se dan de alta desde el panel `admin.html`, ya no por SQL.
- **Middlewares globales** en `backend/api/index.js`:
  - `/api/health` es la única ruta pública (uptime monitoring).
  - Todo lo demás bajo `/api/*` exige sesión válida y usuario registrado.
  - Las rutas de datos exigen además una organización activa (`requireOrganization`). `/api/auth/me` y `/api/admin/*` no la exigen, para que un superadmin sin organizaciones pueda entrar al panel.
- **Lógica del panel:** el router `/api/admin` (`backend/api/admin.js`) sólo aplica los guards `requireAdmin` / `requireSuperadmin`. Las reglas de scope viven en funciones SQL que reciben al actor y hacen cada operación en una transacción con su auditoría.
- El flujo de OAuth con múltiples URLs de Vercel (producción + previews) requiere configuración específica en Supabase (Site URL vs. Redirect URLs con wildcard). Ver [SETUP.md](SETUP.md#autenticación-google--supabase).

## Patrones usados en el frontend

- **Sin módulos ES, sin bundler**: todo son globals cargados por `<script>` en orden. `auth.js` corre primero y define `window.apiFetch`; `index.js` arranca recién cuando `auth.js` confirma sesión válida (`window.onAuthenticated = init`).
- **Render manual por `innerHTML`**: no hay virtual DOM ni templates. `agregarHTML()` / `limpiarContenido()` inyectan strings de HTML directamente en `#contenido`. **Todo dato dinámico debe pasar por `escapeHtml()`** antes de interpolarse — es la única defensa contra XSS en el proyecto.
- **Dos modos de búsqueda**:
  - *Asistida*: mientras el usuario tipea (debounce 250ms), sólo sugiere resultados, nunca dispara el alta de un chico nuevo.
  - *Explícita*: Enter o botón "Buscar" — si no hay resultados, ofrece el formulario de alta.
- **Guard de carreras**: `renderRequestId` (contador incremental) + `AbortController` (`activeSearchController`) descartan respuestas de búsquedas viejas si el usuario siguió tipeando o disparó otra acción mientras la request estaba en vuelo.
- **Backend "gordo", frontend "tonto"**: toda lógica de negocio (armar el label de grado, contar visitas, evitar asistencias duplicadas el mismo día, rankings) vive en `backend/api/index.js`. El frontend sólo pide datos ya resueltos y los pinta.
- **Forma de respuesta consistente para un "pibe"**: los distintos endpoints que devuelven personas (`/api/students/search`, `/api/students/:id`, `/api/attendance/by-date`) devuelven la misma forma de objeto (`id, nombre, apellido, nombreCompleto, grado_id, grado, edad_id, edad, ficha, obs, telefono, ...`). Si agregás un endpoint nuevo que devuelve pibes, mantené esa forma.

## Convenciones de código

- Registrar los cambios relevantes en [CHANGELOG.md](../CHANGELOG.md) (sección *Sin publicar*).
- Comentarios y nombres de variables/funciones en **español** (dominio: "pibes", "ficha", "presente", "asistencias"). Mantener esa convención al extender el código.
- Cada handler de Express sigue el mismo esqueleto: `try { ... } catch (error) { console.error("<Contexto> error:", error); res.status(500).json({ error: error.message }); }`.
- El frontend usa nombres de función en español (`buscar`, `agregarNuevo`, `mostrarResultado`, etc.) — seguir la misma convención.

## Deuda técnica / cosas a tener en cuenta antes de tocar el proyecto

1. **El schema base de la base de datos no está versionado.** Las tablas `organizaciones`, `niveles_grados_pibes`, `grados_pibes`, `edades`, `pibes`, `asistencias`, sus políticas RLS y la función `buscar_pibes` (RPC usada por la búsqueda) se crearon a mano desde el SQL Editor de Supabase. La migración `supabase/migrations/20260730210820_remote_schema.sql` está **vacía**. Sólo `allowed_emails` tiene migraciones reales y actualizadas. Antes de modificar el schema: correr `supabase db pull` para traer el estado real, o como mínimo documentar el cambio en una migración nueva. Ver [DATABASE.md](DATABASE.md).
2. No hay `supabase/config.toml` — no hay stack local de Supabase configurado (`supabase start`); todo el desarrollo apunta directo al proyecto remoto.
3. No hay tests automatizados. Verificar cambios corriendo el backend local (`npm run dev`) y probando a mano.
4. No hay control de concurrencia más allá de un chequeo puntual ("¿ya tiene presente hoy?") en `/api/attendance/mark`.
5. No hay paginación en `/api/students/search` — aceptable al tamaño actual del padrón, pero a tener en cuenta si crece mucho.
6. Los lookups (`grados_pibes`, `edades`) siguen sin UI: se editan por SQL. Usuarios, roles y organizaciones ya se administran desde `admin.html`.
7. `admin.js` copia los helpers de modal y API de `buffet.js` (`openModal`, `apiGet`, `apiSend`, `escapeHtml`). Si aparece una tercera página que los necesite, conviene moverlos a un `frontend/ui.js` compartido.
8. Vista temporal `public.allowed_emails` (ver DATABASE.md): borrarla en una migración nueva cuando el backend con `usuarios` esté desplegado en producción.
9. El historial de migraciones remoto (`supabase_migrations.schema_migrations`) no registraba las migraciones de agosto (se aplicaron a mano). Antes de un `supabase db push` correr `supabase migration list --linked` y, si hay migraciones aplicadas a mano, marcarlas con `supabase migration repair --status applied <versión>`.

## Ver también

- [DATABASE.md](DATABASE.md) — schema, relaciones, RLS.
- [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) — roles, scope de organizaciones, auditoría.
- [CHANGELOG.md](../CHANGELOG.md) — registro de cambios.
- [API.md](API.md) — referencia de endpoints.
- [SETUP.md](SETUP.md) — variables de entorno, desarrollo local, deploy, configuración de auth.
- [legacy/](legacy/) — documentación de la versión anterior (Google Apps Script + Sheets), sólo como contexto histórico.
