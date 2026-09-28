# Arquitectura

## Resumen

App de registro de ingreso/asistencia de un oratorio (grupo juvenil parroquial). Monolito simple, sin build step: **un único proyecto Vercel** sirve tanto la API (Express) como el frontend estático (HTML/CSS/JS vanilla), desde el mismo origen. **Supabase** (Postgres) es la única base de datos y también resuelve la autenticación (Google o código por mail).

No hay framework de frontend, no hay ORM, no hay TypeScript, no hay tests automatizados. Es intencional: el proyecto es chico y lo mantiene un grupo de voluntarios, no un equipo dedicado.

## Estructura del repo

```
backend/
  api/
    index.js   ← app Express: todas las rutas /api/* + sirve frontend/ como estático
    auth.js    ← middleware: valida sesión Supabase, resuelve usuario/organización/roles + guards
    admin.js   ← router /api/admin/* (panel de administración)
    registro.js← router /api/registro/* (quien todavía no tiene acceso pide sumarse a un espacio)
    rpc.js     ← llamadas a las funciones SQL y traducción de sus errores a HTTP
    mail.js    ← avisos por mail de las solicitudes (nodemailer + SMTP)
  package.json
  vercel.json  ← única config de deploy (todas las rutas → api/index.js)
frontend/
  index.html   ← Registro (asistencias)
  buffet.html  ← Buffet
  admin.html   ← panel de administración (sólo admins/superadmins)
  auth.js      ← login (Google o código por mail) vía Supabase Auth; expone window.apiFetch() y window.currentUser
  registro.js  ← pantalla "Espacios" para pedir acceso (se carga antes que auth.js)
  nav.js       ← sidebar desplegable en mobile
  index.js / buffet.js / admin.js ← lógica de UI de cada página
  base.css (+ buffet.css, admin.css)
supabase/
  migrations/  ← migraciones versionadas (fuente de verdad del schema, ver DATABASE.md)
  templates/   ← plantilla del mail con el código de login
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

- **Login**: manejado enteramente por Supabase Auth, con dos caminos. No hay backend propio de sesión ni cookies — el estado de sesión vive en el cliente Supabase del browser.
  - Google OAuth (`signInWithOAuth`).
  - Mail + código de 6 dígitos (`signInWithOtp` + `verifyOtp`), sin contraseña. Es el mismo flujo para crear la cuenta y para entrar. Supabase manda el código por el SMTP configurado (Gmail, ver [SETUP.md](SETUP.md#mails)).
- **Registro abierto con aprobación:** cualquiera puede crear una cuenta, pero sin acceso a nada. Si su email no está en `usuarios`, ve la pantalla de registro (`frontend/registro.js`) y pide sumarse a un espacio o crear uno. Un admin o superadmin acepta o rechaza la solicitud desde el panel. Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#registro-y-solicitudes).
- `frontend/auth.js` guarda la sesión y expone `window.apiFetch(path, options)`, un wrapper de `fetch` que agrega `Authorization: Bearer <access_token>` a cada llamada a `/api/*`. **Todo el código nuevo debe usar `apiFetch`, no `fetch` directo**, para no romper la autenticación.
- `backend/api/auth.js` valida ese token con `supabaseAdmin.auth.getUser(token)`, usando el **service role key** (bypassea RLS, nunca se expone al frontend). Después llama a `contexto_usuario(email)`, que devuelve si el email está en `usuarios`, sus organizaciones y sus roles, y deja todo en `req.user`.
- **Autorización:** hay tres niveles, miembro (tener la organización), `admin` (por organización) y `superadmin` (global). El modelo completo, la matriz de permisos y dónde se aplica cada regla están en **[ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md)**. Los usuarios se dan de alta desde el panel `admin.html`, ya no por SQL.
- **Middlewares globales** en `backend/api/index.js`:
  - `/api/health` es la única ruta pública (uptime monitoring).
  - `/api/registro/*` exige sólo una sesión válida (`requireSession`): es para quien todavía no está registrado.
  - Todo lo demás bajo `/api/*` exige sesión válida y usuario registrado (`requireAllowedUser`).
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

1. **Backend y frontend sin tests automatizados.**
   - La base sí tiene tests (pgTAP en `supabase/tests/`, corren en CI).
   - El backend y el frontend se verifican corriendo `npm run dev` y probando a mano.
   - El paso siguiente natural es testear el router `/api/admin` con la base local.
2. **Google no funciona en local:** en local se entra con el código por mail, que llega a Mailpit (ver [SETUP.md](SETUP.md#app-completa-en-local-sin-tocar-producción)). Para probar el flujo real de Google en local hay que cargar credenciales en `[auth.external.google]` de `supabase/config.toml`.
3. **Cambios de schema:** siempre con una migración nueva. Nunca a mano en el SQL Editor de Supabase, porque así se había desincronizado el repo (ver el historial en el CHANGELOG).
4. No hay control de concurrencia más allá de un chequeo puntual ("¿ya tiene presente hoy?") en `/api/attendance/mark`.
5. No hay paginación en `/api/students/search` — aceptable al tamaño actual del padrón, pero a tener en cuenta si crece mucho.
6. Los lookups (`grados_pibes`, `edades`) siguen sin UI: se editan por SQL. Usuarios, roles y organizaciones ya se administran desde `admin.html`.
7. `admin.js` copia los helpers de modal y API de `buffet.js` (`openModal`, `apiGet`, `apiSend`, `escapeHtml`), y `registro.js` repite el patrón de llamadas a la API. Conviene moverlos a un `frontend/ui.js` compartido.
8. Antes de un `supabase db push`, correr `supabase migration list --linked` y `supabase db push --linked --dry-run` para ver exactamente qué se va a aplicar. El historial remoto ya está sincronizado; se reparó en septiembre de 2026, cuando las migraciones de agosto figuraban como no aplicadas.
9. **Mails best-effort:** los avisos de solicitudes se mandan en el mismo request, después de guardar. Si el SMTP falla, la solicitud queda igual (se loguea y la respuesta trae `notificados: 0`), pero no hay reintento. Si se vuelve un problema, el paso siguiente es una tabla de mails pendientes.

## Ver también

- [DATABASE.md](DATABASE.md) — schema, relaciones, RLS.
- [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) — roles, scope de organizaciones, auditoría.
- [CHANGELOG.md](../CHANGELOG.md) — registro de cambios.
- [API.md](API.md) — referencia de endpoints.
- [SETUP.md](SETUP.md) — variables de entorno, desarrollo local, deploy, configuración de auth.
- [legacy/](legacy/) — documentación de la versión anterior (Google Apps Script + Sheets), sólo como contexto histórico.
