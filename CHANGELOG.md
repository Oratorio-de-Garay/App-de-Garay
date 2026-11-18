# Changelog

Registro de cambios relevantes del proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): lo más nuevo arriba, agrupado en *Agregado*, *Cambiado*, *Eliminado*, *Corregido* y *Seguridad*.

Al hacer un cambio relevante, sumalo en **Sin publicar**. Si toca la base, incluí el nombre de la migración.

## Sin publicar

### Agregado
- **Migración a React + Vite + Hono, fase 0: tests e2e de caracterización.** Decisión y motivos en `docs/adr/0001-migracion-framework.md`; avance por fases en `docs/MIGRACION.md`. Se agrega `package.json` en la raíz, Playwright (`playwright.config.ts`, `e2e/`) y 13 tests que recorren login con código, asistencia, buffet y administración contra la base local (`npm run e2e`). Los datos que crean llevan la marca `E2E` y se borran al terminar.
- **Migración, fase 1: herramientas.** Monorepo con npm workspaces, TypeScript estricto, ESLint, Prettier y Vitest; paquete `packages/shared` con los tipos de la base generados (`npm run db:types`) y utilidades comunes; workflow `.github/workflows/app.yml` (lint, formato, tipos, unitarios y e2e en cada PR). Un solo comando para verificar: `npm run check`. Guía en `docs/TESTING.md`.
- **Migración, fase 2: API en Hono + TypeScript** (`apps/api/`). Mismas rutas y respuestas que el backend Express, ahora por módulos (`buffet`, `pibes`, `asistencia`, `admin`, `registro`, `push`), con validación Zod compartida con el frontend (`packages/shared/src/schemas/`), un único manejo de errores y permisos declarados al montar cada grupo de rutas. 94 tests unitarios y 42 de integración contra la base local (`npm run test:integration`). `docs/API.md` suma los endpoints del catálogo de buffet y `PATCH /api/buffet/sales/:id`, que no estaban documentados. No requiere migración de base.
- **Migración, fase 3: frontend en React + Vite + TypeScript** (`apps/web/`), con Tailwind CSS v4 y componentes al estilo shadcn/ui. Una sola aplicación con direcciones limpias (`/`, `/buffet`, `/admin`; las `*.html` anteriores redirigen), navegación sin recargar, datos en caché con TanStack Query y un diseño nuevo pensado primero para el celular. Formularios validados con los mismos esquemas que la API. 73 tests unitarios de frontend y 16 e2e; `npm run capturas` saca una imagen de cada pantalla. Detalle y decisiones en `docs/MIGRACION.md`.
- **Migración, fase 4: despliegue y limpieza.** Se borraron `backend/` y `frontend/`. El build de Vercel pasa a `npm run vercel-build` (`scripts/vercel-build.mjs`, Build Output API): la app desde el CDN y toda la API empaquetada en una sola función en `gru1`. `npm run vercel-build:probar` lo ejercita en una PC. **Requirió un cambio manual en Vercel:** *Root Directory* de `backend` a la raíz y Node.js 22.x (hecho el 16/11/2026, con la publicación). No requiere variables nuevas ni migración de base.

### Corregido
- **XSS en la pantalla de registro:** el nombre de un chico y los mensajes de error se insertaban como HTML sin escapar (`mostrarMensaje`). La interfaz nueva no arma HTML a mano.
- **"Editar datos" de un chico abría vacío** y, al guardar, borraba la observación que tenía. Ahora abre con los datos actuales.
- **"Visitas este año" mostraba el total histórico.** Pasó a llamarse "Visitas".
- **`GET /api/lookups` mostraba las categorías de todas las organizaciones** (aparecían repetidas en "Nuevo chico"). Ahora sólo las de la organización activa.
- **Datos faltantes o mal formados respondían `500`** con el error de Postgres; ahora `400` con un mensaje en español. Un evento de buffet inexistente respondía `500` al editarlo; ahora `404`.

### Seguridad
- **Cualquier miembro podía eliminar o cerrar un evento de buffet.** Ahora sólo los admins de la organización pueden eliminar, cerrar o reabrir un evento (`403` para el resto), y un evento cerrado no se puede eliminar (`409`). En la app, el botón *Eliminar* se oculta para quien no es admin y queda inhabilitado en eventos cerrados; el campo *Estado* sólo lo ve un admin. Sin migración.
- **Los errores inesperados ya no devuelven el mensaje interno de la base** al navegador; queda sólo en el log del servidor.
- **Se quitó `cors()` abierto a cualquier origen:** la app y la API comparten origen.

### Cambiado
- **Los archivos de variables pasan a la raíz:** `backend/.env.local` → `.env.local` y `backend/.env.production` → `.env.production` (ejemplo en `.env.local.example`). Los usan la API, la app y los tests.
- **Todos los comandos se corren desde la raíz.** `npm run dev` levanta la app (Vite, puerto 3000) y la API (3001); `npm run start` compila y sirve todo junto como en producción; `npm run check` verifica un cambio. Node 22.12 o más nuevo.
- **La app local nunca se arma contra producción por accidente:** el build usa siempre `.env.local` y falla si la base no es la local; a la base real sólo se llega con `npm run dev:prod`.
- **Los links de los mails de solicitudes** apuntan a `/admin?tab=solicitudes…`. Los ya enviados (`/admin.html?…`) siguen funcionando.
- **`/config.js` ya no existe:** la configuración pública de la app se resuelve al compilar. Cambiar `SUPABASE_URL`, `SUPABASE_KEY` o `VAPID_PUBLIC_KEY` en Vercel exige un redeploy.
- **`package-lock.json` pasa a versionarse** (raíz y `backend/`): sin lockfile, cada build de Vercel podía resolver versiones distintas de las dependencias.

### Rendimiento
- **Frontend estático servido por la CDN de Vercel, no por la función** (`backend/vercel.json`, `backend/scripts/copiar-frontend.mjs`, script `vercel-build`). Antes HTML, JS y CSS pasaban por la función Express: sin caché de CDN, sin compresión y con cold starts incluso para ver una pantalla. Ahora el build copia `frontend/` a `backend/public/` (ignorado por git) y Vercel lo sirve; la función solo atiende `/api/*` y `/config.js`. En local no cambia nada. Requiere *Include source files outside of the Root Directory* activado en Vercel.
- **Auth: el JWT se valida localmente** (`backend/api/auth.js`). `getClaims` verifica firma (ES256) y vencimiento contra el JWKS del proyecto, que se baja una vez por instancia, en vez de llamar a `auth.getUser` en cada request que no está en el caché. Si la verificación local falla, se usa `getUser` como respaldo. Se rechazan los tokens sin email o sin rol `authenticated` (anon/service role). No requiere migración ni subir dependencias (el lockfile ya fija `supabase-js` 2.109.0). **Compromiso:** un access token sigue valiendo hasta su vencimiento (1 h) aunque se cierre la sesión en otro dispositivo.
- **La app iba lenta por la cantidad de viajes a Supabase por request** (la base está en São Paulo). Cambios:
  - **Auth con caché** (`backend/api/auth.js`): el token y el contexto del usuario (roles/organizaciones) se cachean 30 s en memoria por instancia, en vez de 2 viajes a Supabase por cada request. Un cambio de roles puede tardar hasta 30 s en verse.
  - **Región de Vercel `gru1`** (`backend/vercel.json`), cerca de la base.
  - **Búsqueda de pibes en una sola consulta** (migración `20261114300000_buscar_pibes_resumen.sql`): nueva RPC `buscar_pibes_resumen` que filtra por organización adentro, busca por palabras (sirve "Juan Perez" y el orden da igual), limita a 30 y devuelve visitas, última asistencia y `marcado_hoy`. Antes eran ~2 consultas por resultado más un `GET /api/attendance/check` por tarjeta. Índice trigram sobre nombre+apellido e índices `asistencias(organizacion_id, fecha)` y `asistencias(pibe_id, fecha desc)`. La búsqueda anterior ahora se cancela de verdad (`AbortController`).
  - **Ventas de buffet transaccionales** (migración `20261114400000_buffet_ventas_transaccionales.sql`): crear, editar y borrar una venta son una sola función SQL que descuenta el stock de forma atómica (corrige la condición de carrera que podía perder stock). Combos y presupuestos traen el conteo de ítems embebido (sin N+1) y se agregaron índices en `buffet_combo_items(combo_id)` y `buffet_budget_items(budget_id)`. Tras guardar o borrar una venta el frontend recarga 3 endpoints en lugar de 6.
  - `GET /api/students/:id` hace sus 3 consultas en paralelo.
  - **Historial agrupado en SQL** (migración `20261115000000_historial_asistencia_agrupado.sql`): `GET /api/attendance/dates` y `/top` ya no traen todas las asistencias del año para contar en JS; las funciones `asistencia_fechas` y `asistencia_top` devuelven el resultado agrupado (mismo criterio: día UTC, un pibe cuenta una vez por día). Mismas respuestas que antes.
  - `POST /api/attendance/mark` y `DELETE /api/attendance/unmark` consultan el pibe y la asistencia del día a la vez (una espera menos).

### Cambiado
- **Notificaciones: orden de los destinatarios.** En "Nueva notificación", la lista de usuarios muestra primero a quienes tienen dispositivos activados y después al resto; dentro de cada grupo, por nombre (`frontend/admin.js`).

### Agregado
- **Paginación y tablas modernas en todos los listados** (`frontend/utils/paginacion.js`, `frontend/utils/tabla.css`, librería tui-pagination 3.4.1). Registro (búsqueda de pibes, presentes por fecha, historial de fechas), Buffet (productos, eventos, ventas, combos, presupuestos) y Admin (usuarios, solicitudes, roles, organizaciones, envíos, dispositivos, actividad) se muestran en tabla —tarjetas en el celular— con selector de 10/25/50/100/200 ítems por página (25 por defecto, se recuerda por listado), flechas atrás/adelante que se ponen grises en los extremos y botones numerados arriba y abajo. La paginación es del lado del cliente: cambiar de página no hace requests. El historial de fechas ya no se agrupa por mes: ahora es una tabla Fecha / Mes / Presentes. El buscador de eventos de Buffet ya no repinta el panel entero. `GET /api/students/search` devuelve hasta 100 resultados (antes 30) y el frontend avisa si hay más.
- **Botón "Instalar como app"** en el header, a la izquierda de "Salir" (`frontend/install.js`). En Chrome/Edge/Android dispara el diálogo de instalación; en iOS explica cómo agregarla desde Compartir. No aparece si la app ya está instalada o el navegador no puede instalarla.
- **Administración > Notificaciones: subpestañas Envíos y Dispositivos** (migración `20261114000000_admin_listar_dispositivos_push.sql`). *Envíos* es el historial de siempre; *Dispositivos* lista los usuarios de las organizaciones que administra con sus dispositivos que activaron las notificaciones (navegador y sistema, alta, último uso), filtrable por organización, y marca a quienes no activaron ninguna. "Nueva notificación" está en ambas. Endpoint `GET /api/admin/dispositivos`; no expone endpoint ni claves de la suscripción.
- **Buffet: productos y combos activos/inactivos.** El formulario de "Editar" (y el de alta) de productos y de combos tiene un checkbox *activo*, igual que "Producto donado". Sólo los activos aparecen en "Elegí un producto o combo" de Nueva venta; los inactivos se muestran en gris en sus listados. Desactivar un producto **no** desactiva sus combos (cada uno tiene su propio estado). Los combos ahora tienen botón **Editar**. No requiere migración: `active` ya existía. Antes el formulario mandaba `active: true` fijo, así que guardar un producto lo reactivaba.
- **Buffet: ítems editables en Nueva venta.** Elegir un producto o combo lo agrega directo a la venta (se eliminó el botón "Agregar" y sus alertas). El selector sólo ofrece lo que todavía no está en la venta; lo ya agregado se modifica desde su línea. Cada línea tiene producto/combo, cantidad y precio editables, así no hace falta quitarla y volver a cargarla. Al editar una venta vieja, una línea conserva su producto aunque después se haya desactivado.
- **Notificaciones push** (migración `20261106000000_notificaciones_push.sql`):
  - Un admin envía un título y un texto, de forma inmediata, a todos los dispositivos de un usuario de una organización que administra (pestaña **Notificaciones** del panel, con historial y resultado del envío).
  - Web Push estándar (VAPID, librería `web-push`): sin Firebase ni otra dependencia externa. Variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (ver docs/SETUP.md); sin ellas el push queda deshabilitado.
  - Cada usuario las activa desde un aviso en su dispositivo y, si quiere, las desactiva desde la configuración de su navegador (`frontend/push.js`, `sw.js`, `manifest.json`).
  - Tablas `dispositivos_push` y `notificaciones_push`, funciones `push_*` y `admin_*_notificacion*`, y la acción de auditoría `notificacion_enviada`.
  - Endpoints `POST`/`GET /api/admin/notificaciones` y `POST`/`DELETE /api/push/suscripciones`.
  - **Aviso para activarlas:** a todo usuario con sesión iniciada que no las tenga activadas, en cualquier página, se le muestra un aviso para habilitarlas. "Ahora no" lo pospone 7 días; no se pregunta si el navegador las bloqueó ni si el usuario las desactivó a propósito en ese dispositivo.
  - En iOS (16.4+) sólo llegan si la app está instalada en la pantalla de inicio.
  - **Fix iOS:** tocar la notificación ahora abre la app aunque esté cerrada. En iOS `focus()` de una ventana suspendida rechaza o no hace nada y el service worker nunca llegaba a `openWindow`; ahora se captura el fallo y se abre la app. El payload incluye `url` (por defecto `/`).
- **Notificaciones push programadas y a varios usuarios** (migración `20261110000000_notificaciones_programadas.sql`):
  - El formulario permite elegir **varios usuarios** (con "Seleccionar todos", hasta 50 por envío) y **cuándo** enviar: *Inmediata* o *Programar* con fecha y hora. La fecha tiene que ser posterior a ahora: se valida en el formulario y, como autoridad, en la base. Se crea una notificación por destinatario; los que no pertenecen a la organización se rechazan sin abortar el lote.
  - Las programadas se pueden **cancelar** mientras no salgan (`DELETE /api/admin/notificaciones/:id`). Estados nuevos: `programada`, `enviando`, `cancelada`.
  - Sin worker propio: la tabla `notificaciones_push` es la cola y `pg_cron` llama cada minuto a `POST /api/push/despachar` **sólo si hay algo vencido** (autenticado con `CRON_SECRET`, sin sesión de usuario). Salen con hasta ~1 minuto de demora. Al enviar se re-valida que el destinatario siga en la organización. Ver docs/SETUP.md (URL y secreto en Supabase Vault) y docs/ARCHITECTURE.md.
  - Funciones `admin_crear_notificaciones`, `admin_cancelar_notificacion`, `push_tomar_vencidas`, `push_cerrar_programada`, `despachar_notificaciones_programadas`; acciones de auditoría `notificacion_programada` y `notificacion_cancelada`.
  - `POST /api/admin/notificaciones` ahora recibe `destinatarios_email` (lista) y `programada_para` opcional, y responde `{ lote_id, notificaciones, rechazados }` en vez de una sola notificación.
- **Desmarcar presente** (`DELETE /api/attendance/unmark`): cualquier miembro puede revertir una asistencia ya marcada con confirmación previa. El botón "✔ Presente marcado" pasa a ser "✘ Desmarcar presente" (habilitado) tanto en la ficha individual como en los botones de la lista rápida, funcionando como toggle.


- **Aviso de base de producción:** al arrancar, el backend dice en la terminal a qué base apunta. Si la app corre en `localhost` contra producción, muestra una franja roja.
- **Guía para correr el proyecto en local** ([docs/DESARROLLO_LOCAL.md](docs/DESARROLLO_LOCAL.md)): requisitos, Supabase local, `.env.local`, usuarios de prueba, mails en Mailpit y problemas comunes.
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

- **Notificaciones push: un dispositivo vencido se marca como desactivado en vez de borrarse** (migración `20261114100000_dispositivos_push_desactivados.sql`, columna `dispositivos_push.desactivado_at`). Cuando el servicio push responde 404/410 (p. ej. el usuario las desactivó desde el navegador) el dispositivo deja de recibir envíos pero se conserva: *Administración > Notificaciones > Dispositivos* lo muestra como "Desactivado el …" y distingue "notificaciones desactivadas" de "sin notificaciones activadas". Volver a activarlas desde el mismo navegador lo reactiva. El tope de 20 por usuario descarta primero los desactivados. Quitar el dispositivo a pedido del usuario (`DELETE /api/push/suscripciones`) sigue borrándolo.
- **Supabase local levanta sólo lo que usa la app** (`supabase/config.toml`): Postgres, Auth, PostgREST, Kong y Mailpit.
  - Se apagaron Studio, Storage, Edge Runtime, Analytics y Realtime.
  - Docker baja unos 2,1 GB en lugar de 8,5 GB.
  - Para ver los datos, se usa `psql` o un cliente de Postgres; Studio se puede prender a mano (ver `docs/DESARROLLO_LOCAL.md`).
- **`npm run dev` usa siempre la base local** (`backend/.env.local`). Antes leía `backend/.env` y, con las claves de producción ahí, modificaba datos reales.
  - Contra producción, a propósito: `npm run dev:prod`, que lee `backend/.env.production`. Se eliminó `npm run dev:local`.
  - El backend ya no cae en los valores de producción si faltan variables: no arranca (`backend/api/entorno.js`).
  - Se sacó `dotenv`: cada script indica su archivo con `node --env-file`.
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

- **Notificaciones push: un dispositivo cuya suscripción vencía quedaba sin notificaciones para siempre.** El servicio push (FCM) puede dar por vencida una suscripción sin que el navegador se entere (permiso "Permitido" y suscripción local intactas): el envío fallaba como "sin dispositivos" y, como la app se veía activa, nunca volvía a mostrar el aviso de activar. Ahora `frontend/push.js` re-registra la suscripción local en cada carga y, si el servidor la tenía desactivada o no la conocía, crea una suscripción nueva y la registra. `POST /api/push/suscripciones` devuelve además `renovar` (migración `20261114200000_push_registrar_informa_renovacion.sql`). Un dispositivo ya desactivado se recupera la próxima vez que el usuario abre la app.
- **Desmarcar presente no se podía usar:** el endpoint existía pero ningún botón lo llamaba, y el botón de presente quedaba deshabilitado al marcar. Ahora funciona como toggle en la ficha y en la lista rápida.
- **"No se pudo marcar el presente" en el primer intento:** marcar se reintenta una vez ante error de red, 5xx o 401 (marcar es idempotente), y el mensaje de error muestra el motivo real (`Error 502`, etc.) en vez de uno genérico.
- **Estilos que no se aplicaban:** a `@keyframes toast-in` de `base.css` le faltaba la llave de cierre, y anulaba las reglas que venían después: toasts en celular, movimiento reducido y el encabezado oculto mientras se verifica el acceso.
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

- Opción "Activar/Desactivar notificaciones" del menú lateral: quien quiera desactivarlas lo hace desde su navegador. El aviso para activarlas se mantiene.
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
