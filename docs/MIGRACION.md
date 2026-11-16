# Bitácora de la migración a React + Vite + Hono

El porqué de cada decisión está en [`adr/0001-migracion-framework.md`](adr/0001-migracion-framework.md).
Acá queda **qué se hizo en cada fase, cómo se verificó y qué quedó pendiente**.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Rama, ADR y tests e2e de caracterización sobre la app actual | Hecha |
| 1 | Monorepo, TypeScript, lint, tests unitarios y CI | Hecha |
| 2 | Backend a Hono con el mismo contrato HTTP | Hecha |
| 3 | Frontend a React + Tailwind + shadcn/ui | Hecha |
| 4 | Despliegue, limpieza del código viejo y documentación | Hecha |
| — | Publicación en producción | Hecha el 16/11/2026 (PR #37) |

## Fase 0 — Red de seguridad

**Objetivo:** tener una prueba automática de que la app "sigue funcionando"
antes de tocar nada, para poder comparar el antes y el después.

**Qué se agregó**
- `package.json` en la raíz (antes no había) y `package-lock.json` versionado:
  sin lockfile, Vercel resolvía versiones distintas en cada build.
- `playwright.config.ts` y la carpeta `e2e/`:
  - `e2e/support/`: variables de entorno (se niega a correr si la base no es
    local), lectura del código de acceso desde Mailpit, creación de sesiones
    reales sin pasar por el login, y limpieza de lo que crean los tests.
  - `e2e/pages/app.ts`: objetos de página. Es el único archivo que conoce el
    HTML; al rediseñar la interfaz se actualiza éste y los specs no cambian.
  - Specs: `auth`, `asistencia`, `buffet`, `admin`.

**Qué cubren los 13 tests**

| Spec | Flujos |
|---|---|
| `auth` | Sin sesión no se ve la app · login con el código que llega por mail y salida · código incorrecto · usuario sin acceso ve su solicitud · miembro sin rol admin no entra al panel |
| `asistencia` | Alta de un chico con presente · búsqueda · desmarcar y volver a marcar · búsqueda sin resultados ofrece el alta · historial (también en viewport de celular) |
| `buffet` | Crear y eliminar un producto · validación de nombre obligatorio |
| `admin` | Listado de usuarios de la organización · dar de alta y quitar acceso |

**Decisiones**
- Los tests comparten una base, así que corren en serie (un worker).
- Sólo un test pasa por la pantalla de login; el resto arranca con una sesión
  creada por la API de administración de Auth. Auth no manda dos códigos al
  mismo mail en menos de un segundo, y loguearse por pantalla en cada test lo
  volvía lento e inestable.
- Todo lo que crean los tests lleva la marca `E2E` y se borra al terminar
  (`e2e/support/limpieza.ts`). No se toca ningún otro dato de la base local.

**Verificación:** `npm run e2e` → 13 de 13 en verde contra la app actual, dos
corridas seguidas; después de correr no quedan filas con la marca `E2E`.

**No cubierto por e2e:** login con Google (no está configurado en local),
notificaciones push reales, ventas y presupuestos de buffet, y el flujo
completo de aprobar una solicitud. Los tres últimos se cubren con tests de
integración de la API en la Fase 2.

## Fase 1 — Herramientas

**Objetivo:** que cualquier cambio posterior se pueda verificar con un solo
comando, antes de escribir código nuevo de la aplicación.

**Qué se agregó**

| Pieza | Archivos | Para qué |
|---|---|---|
| Monorepo | `package.json` (workspaces `apps/*` y `packages/*`) | Un solo `npm install` y un solo lockfile para API, web y código compartido |
| TypeScript estricto | `tsconfig.base.json`, `tsconfig.json` | `strict` + `noUncheckedIndexedAccess`: acceder a un índice que puede no existir es un error de compilación |
| Lint y formato | `eslint.config.js`, `.prettierrc.json`, `.prettierignore` | Estilo único sin discutirlo; imports de tipos explícitos |
| Tests unitarios | `vitest.config.ts` | Un proyecto por paquete |
| Código compartido | `packages/shared` | Tipos de la base generados (`npm run db:types`) y utilidades comunes; primer módulo: `fechas.ts` |
| Fin de línea | `.gitattributes` | LF en el repo aunque se trabaje en Windows |
| CI | `.github/workflows/app.yml` | Calidad en cada PR y e2e contra una base efímera |
| Guía | `docs/TESTING.md` | Qué se prueba en cada nivel y cómo escribir un test |

**Decisiones**
- **TypeScript 6 y no 7:** `typescript-eslint` todavía exige `<6.1`. Se sube
  cuando lo soporte.
- **`backend/` y `frontend/` quedan fuera del linter y del formateador:** son
  el código que se reemplaza; formatearlos sólo ensuciaría el historial.
- **Los `.md` no pasan por Prettier:** la documentación se escribe a mano.
- **`packages/shared` se consume como fuente TypeScript** (sin paso de build
  propio): lo compilan Vite y el empaquetado de la API.
- **`rangoDiaUTC` es el primer código compartido** porque el mismo cálculo
  estaba copiado cuatro veces en `backend/api/index.js`. Valida la fecha de
  verdad: `2026-02-31` antes se corría en silencio a marzo.

**Verificación:** `npm run check` en verde (lint, formato, tipos, 13 tests
unitarios) y `npm run e2e` 13 de 13.

**Sin verificar en esta fase:** el workflow `app.yml` no corrió en GitHub hasta
el PR de la migración. Ahí pasó a la primera, incluido el paso que arma el
archivo de variables a partir de `supabase status -o env` (ver
[Publicación](#publicación)).

## Fase 2 — Backend a Hono

**Objetivo:** reescribir la API con validación, errores y permisos en un solo
lugar cada uno, **sin cambiar el contrato HTTP**, de modo que el frontend
anterior siga funcionando contra ella.

**Estructura** (`apps/api/src/`)

| Archivo | Qué hace |
|---|---|
| `app.ts` | Monta los módulos y declara qué exige cada grupo de rutas. Exporta `ApiRoutes`, el tipo que usa el cliente del frontend |
| `env.ts` | Variables de entorno validadas con Zod; si falta una obligatoria el server no arranca |
| `middleware/auth.ts` | `requiereSesion`, `requiereUsuario`, `requiereOrganizacion`, `requiereAdmin`, `requiereSuperadmin` |
| `lib/errores.ts` | `ErrorHttp`, `ErrorDeBase` y `manejarError`: la única traducción de errores a HTTP |
| `lib/supabase.ts` | El único cliente (antes había dos), `datos()` y `rpc()` |
| `lib/validar.ts` | Valida json/query/param con un esquema y responde 400 en español |
| `lib/mail.ts`, `lib/push.ts`, `lib/cache.ts` | Mails, Web Push y caché con vencimiento |
| `modules/<dominio>/routes.ts` | `buffet`, `pibes`, `asistencia`, `admin`, `registro`, `push` |
| `server.ts` | Servidor local. `frontend-anterior.ts` sirve `frontend/` mientras dure la migración |

Los esquemas de entrada viven en `packages/shared/src/schemas/` para que los
formularios del frontend validen con las mismas reglas.

**Duplicación eliminada**

| Antes (`backend/api/index.js`) | Ahora |
|---|---|
| Rango de un día en UTC, 4 copias | `rangoDiaUTC` (`packages/shared`) |
| "Buscar el pibe y su asistencia del día" en `mark` y `unmark` | `pibeYAsistencia` |
| Mapeo de un pibe a la forma común, 3 copias | `aPibe` / `aPibeDeBusqueda` |
| CRUD de productos, combos y presupuestos, 12 handlers | `crudDeCatalogo`, 3 instancias |
| `try/catch` con `res.status(500)` en cada handler, 3 estilos | `manejarError` |
| Traducción de SQLSTATE sólo en admin, registro y push | En todas las rutas |

**Decisiones**
- **Las rutas se definen encadenadas** (`new Hono().get(...).post(...)`): es lo
  que le permite a `hono/client` inferir rutas, parámetros y respuestas.
- **Los permisos se declaran al montar** cada grupo en `app.ts`, no con una
  lista de excepciones por ruta como antes. Se lee de un vistazo quién entra a
  qué.
- **En el panel los esquemas sólo aseguran la forma del pedido.** Las reglas
  (scope, emails, estados) siguen en las funciones SQL, que ya tienen 178
  aserciones pgTAP y mensajes en español.
- **Un `500` ya no muestra el error interno:** antes viajaba el mensaje de
  Postgres al navegador.
- **Se sacó `cors()`**, que aceptaba cualquier origen: la app y la API
  comparten origen.
- **Se sacó la dependencia `ws`:** Node 22 trae WebSocket.

**Errores que corrigió la reescritura**
- `GET /api/lookups` devolvía las categorías de todas las organizaciones.
- Datos faltantes terminaban en `500` con el error de Postgres; ahora `400`.
- `PATCH` de un evento inexistente devolvía `500`; ahora `404`.

El detalle de los cambios visibles desde afuera está en
[`API.md`](API.md#cambios-respecto-del-backend-anterior-express).

**Rendimiento**
- `GET /api/attendance/by-date`: una consulta en vez de dos.
- `GET /api/lookups`: se puede cachear 5 minutos en el navegador.
- Un cliente de Supabase en vez de dos (un solo juego de claves JWKS).

**Tests agregados**

| Nivel | Cantidad | Qué cubren |
|---|---|---|
| Unitarios | 94 (13 ya estaban) | Esquemas, cálculo de ventas, caché, traducción de errores, sesión y organización activa, forma común del pibe, filtro anti-SSRF de push, contenido de los mails |
| Integración | 42 | La app en memoria contra la base local con tokens reales: quién entra a qué, pibes y asistencia, buffet con stock, panel, y el flujo completo de una solicitud con sus mails |

Los unitarios encontraron un error antes de llegar a integración: un campo
opcional (`entrego_ficha`, `organizaciones`) quedaba como obligatorio.

**Verificación**
- `npm run check`: lint, formato, tipos y 94 unitarios en verde.
- `npm run test:integration`: 42 de 42.
- `npm run e2e`: los mismos 13 tests de la fase 0, **sin tocar el frontend**,
  ahora contra la API en Hono: 13 de 13.
- Después de correr todo no quedan filas con las marcas `E2E` ni `ITEST`.

**Pendiente (necesita una migración de base, fuera de esta rama)**
- `GET /api/buffet/events` suma las ventas en JavaScript; debería agregarse en SQL.
- `POST /api/students` hace dos inserts sin transacción (pibe y asistencia).
- Las listas de ventas no tienen paginación del lado del servidor.

**A tener en cuenta**
- Los tests de integración dejan filas en `auditoria_admin` (es un registro
  que no se borra) y mails en Mailpit.
- `backend/` sigue en el repo sin uso hasta la fase 4. `npm run dev` ya
  levanta la API nueva; el backend anterior se puede correr con
  `npm --prefix backend run dev` para comparar.

## Fase 3 — Frontend a React

**Objetivo:** reemplazar las tres páginas HTML por una sola aplicación con
navegación sin recargas, componentes compartidos y un diseño nuevo, sin perder
ninguna función.

**Estructura** (`apps/web/src/`)

| Carpeta | Qué hay |
|---|---|
| `styles/app.css` | Tailwind v4 y **todos** los colores de la app como tokens |
| `components/ui/` | Piezas base al estilo shadcn/ui: botón, campos, diálogo, pestañas, tarjeta, insignia, alerta, avatar |
| `components/` | `Listado` (tabla paginada que en el celular es una lista de tarjetas), `DialogoDeFormulario`, `useConfirmar`, `Stepper`, `Consulta`, `Shell` |
| `features/<dominio>/` | `auth`, `asistencia`, `buffet`, `admin`, `push`: cada una con su `pagina.tsx`, sus `consultas.ts` y su lógica pura |
| `lib/` | Cliente de la API tipado (`api.ts`), sesión de Supabase, formato y storage |
| `router.tsx` | Rutas `/`, `/buffet`, `/admin` y redirecciones desde `*.html` |

**Qué reemplaza a qué**

| Antes | Ahora |
|---|---|
| Tres HTML con el encabezado y el menú copiados | `Shell` |
| `crearListadoPaginado` + tui-pagination (CDN) | `Listado` |
| Tres implementaciones de modal, `alert()` y `confirm()` | `DialogoDeFormulario`, `useConfirmar` y avisos (`sonner`) |
| `escapeHtml` en 5 lugares e `innerHTML` | React escapa solo: desaparece el XSS de `mostrarMensaje` |
| `apiFetch` + `apiGet`/`apiSend` por página | `api` + `pedir` (tipados con las rutas de la API) |
| Variables globales y "recargar todo" tras guardar | TanStack Query: cada cambio invalida sólo lo suyo |
| `/config.js` servido por la función en cada carga | Configuración resuelta al compilar |
| `supabase-js` desde un CDN, sin versión fija | Dependencia versionada dentro del bundle |

**Decisiones**
- **Lo que se ve sale de la URL** (ficha abierta, historial, pestaña, evento):
  el botón "atrás" del celular hace lo esperado y un link lleva a esa vista.
- **Los formularios validan con los esquemas de `packages/shared`**, los
  mismos que usa la API.
- **Sin TanStack Table:** el plan lo mencionaba, pero la paginación es del
  lado del cliente y `Listado` la resuelve en ~200 líneas. Se suma cuando haga
  falta ordenar o filtrar por columna.
- **Sin caché persistida en el dispositivo:** el plan la proponía para abrir
  más rápido. Se descartó porque dejaría nombres y datos de menores guardados
  en teléfonos que a veces son compartidos. Los datos viven en memoria y se
  borran al cerrar sesión.
- **`<select>` nativo** en vez del de Radix: en el celular abre el selector
  del sistema, que es lo más cómodo con una mano.
- **Componentes escritos a mano siguiendo a shadcn/ui** (mismas piezas de
  Radix y misma estructura), sin usar su instalador: así quedan en español y
  ajustados a esta app. Para sumar uno nuevo se puede copiar de shadcn/ui.
- **Las direcciones viejas siguen funcionando** (`/admin.html?tab=…`): los
  links de los mails ya enviados no se rompen.

**Cambios que se notan al usar la app**
- En la ficha, "Visitas este año" pasó a llamarse "Visitas": el número
  siempre fue el total histórico.
- "Editar datos" ahora abre con la ficha y las observaciones actuales (antes
  abría siempre vacío y pisaba la observación).
- Los presupuestos se pueden editar (antes sólo borrar).
- Después de dar de alta un chico se abre su ficha.
- Las confirmaciones y los avisos son de la app, no del navegador.
- La ficha muestra el teléfono de emergencia, que antes no se veía.

**Un error mío durante la fase (corregido)**
La primera configuración de Vite elegía el archivo de variables según el modo
de build, y `vite build` corre en modo *production*: el bundle local quedó
apuntando a la base **real**. Con ese bundle se pidió un código de acceso para
`admin@local.test` contra el Auth de producción (un solo pedido, sin datos).
Ahora el modo de Vite no elige la base: en una PC se usa siempre `.env.local`,
y el build falla si la URL no es local salvo que se pida con
`ENTORNO=produccion`. Ver `apps/web/vite.config.ts`.

**Tamaño**

| | Antes | Ahora |
|---|---|---|
| JS propio | ~287 KB sin minificar, repartido en 8 scripts por página | 16 KB gzip de arranque + 6 a 11 KB gzip por pantalla |
| Librerías | supabase-js y tui-pagination desde un CDN, en cada carga de página | 241 KB gzip en tres archivos con hash, que el navegador guarda entre deploys |
| Al cambiar de pantalla | Recarga completa: se baja y ejecuta todo de nuevo y se vuelve a pedir `/api/auth/me` | Nada: sólo los datos de la pantalla, si no estaban ya en memoria |

Las librerías pesan más que el código propio. El mayor candidato a achicar es
`supabase-js` (56 KB gzip), del que sólo se usa la parte de sesión; no se tocó
porque el login con Google no se puede probar en local.

**Tests agregados**

| Nivel | Cantidad | Qué cubren |
|---|---|---|
| Unitarios (frontend) | 73 | Formato, vuelta al link original sin redirecciones externas, cliente de la API, carrito de ventas, textos del panel, `Listado`, `Stepper`, diálogos y confirmación |
| Punta a punta | 16 (antes 13) | Los mismos flujos de la fase 0 sobre la interfaz nueva, más una venta completa de buffet y la navegación por el menú sin recargar |

`npm run capturas` saca una imagen de cada pantalla en escritorio y celular
(`test-results/capturas/`) para revisar el diseño.

**Verificación**
- `npm run check`: lint, formato, tipos y 167 unitarios.
- `npm run test:integration`: 42 de 42.
- `npm run e2e`: 16 de 16 contra la app compilada, servida como en producción.
- Capturas de las 16 pantallas revisadas en 1280×800 y 390×844.

**Sin verificar**
- **Login con Google:** no está configurado en local.
- **Notificaciones push e instalación como app:** el código se portó tal cual,
  pero necesitan un dispositivo real y claves VAPID válidas para su origen.
- **Acciones de superadmin** (asignar y quitar roles, crear y renombrar
  organizaciones): las pestañas se revisaron con capturas entrando como el
  superadmin local, y las rutas de la API tienen tests, pero los formularios no
  se enviaron desde la interfaz.

## Fase 4 — Despliegue, limpieza y documentación

**Objetivo:** que el repo quede sólo con el código nuevo, con un despliegue que se pueda probar en una PC y la documentación al día.

**Qué cambió**

| Tema | Antes | Ahora |
|---|---|---|
| Código anterior | `backend/` y `frontend/` | Borrados |
| Variables de entorno | `backend/.env.local` y `backend/.env.production` | `.env.local` y `.env.production` en la raíz, un solo archivo para la API, la app y los tests |
| Config de Vercel | `backend/vercel.json` con `builds` legacy, *Root Directory* `backend`, build que copiaba `frontend/` a `public/` | `vercel.json` en la raíz + `scripts/vercel-build.mjs` (Build Output API v3) |
| Función | `backend/api/index.js` compilado por Vercel | La API empaquetada con esbuild en un solo archivo |
| Config del frontend | `/config.js` servido por la función en cada carga | Resuelta al compilar |
| Link de los mails | `/admin.html?tab=solicitudes…` | `/admin?tab=solicitudes…` (el viejo redirige) |

**Por qué la Build Output API y no una carpeta `api/`**

Lo documentado para Hono en Vercel es exportar la app desde `api/index.ts` y dejar que Vercel la compile. El problema es que esta API importa TypeScript de otro paquete del repo (`@garay/shared`), y no encontré garantía de que Vercel compile bien ese caso; tampoco hay forma de probarlo sin desplegar. Con la Build Output API el build arma todo:

- la app, en `.vercel/output/static`;
- la API, empaquetada con esbuild, en `.vercel/output/functions/api.func`;
- las rutas, en `.vercel/output/config.json`.

Así el resultado no depende de cómo Vercel trate un monorepo, y `npm run vercel-build:probar` lo ejercita en una PC: compila y le hace pedidos reales a la función, cargándola como un módulo que exporta `(req, res)`.

Esa prueba ya encontró un error: el repo es `"type": "module"`, así que el paquete (CommonJS) fallaba al cargarse como ESM. Se resolvió escribiendo un `package.json` con `"type": "commonjs"` dentro de la función.

**Decisiones**
- **Una sola función para toda la API:** menos arranques en frío y una sola caché de sesión en memoria.
- **Región `gru1`** en tres lugares (`vercel.json`, el script y los ajustes del proyecto), como antes.
- **Los mapas de código de la app no se publican;** el de la función sí, para tener trazas legibles en los logs.
- **`index.html` y `sw.js` se revalidan siempre; `/assets/*` se cachea para siempre** (los nombres llevan hash).
- **No se agregaron variables de entorno:** la app toma al compilar las mismas `SUPABASE_URL`, `SUPABASE_KEY` y `VAPID_PUBLIC_KEY` que ya estaban cargadas en Vercel.

**Paso manual**

Cambiar el *Root Directory* del proyecto de Vercel de `backend` a la raíz, justo antes de mergear (ver [Publicación](#publicación)).

**Verificación (en una PC)**
- `npm run check`: lint, formato, tipos y 167 unitarios.
- `npm run test:integration`: 42 de 42.
- `npm run e2e`: 16 de 16 contra la app compilada.
- `npx supabase test db`: los tests pgTAP de la base, sin cambios.
- `npm run vercel-build:probar`: el build de Vercel termina y la función empaquetada responde bien a 4 pedidos.
- `npm run dev`: la app en Vite y la API detrás del proxy responden (probado en puertos alternativos, porque el 3000 estaba ocupado).

Lo que en una PC no se podía probar (el deploy en Vercel, el CI en GitHub, el
login con Google, push e instalación como app) se verificó al publicar.

## Publicación

16/11/2026, PR #37.

1. **CI en GitHub:** pasaron los dos jobs del workflow nuevo a la primera
   (`calidad` y `integracion-y-e2e`, con Supabase dentro del runner).
2. **Corte en Vercel:** *Root Directory* de `backend` a la raíz y Node.js 22.x
   (el *Framework Preset* ya estaba en *Other*).
3. **Preview:** redeploy y revisión manual con la lista de
   [SETUP.md](SETUP.md#deploy-vercel); el deploy de Vercel pasó.
4. **Merge a `main`** y revisión manual en producción: funciona.

El primer deploy del PR, antes del corte, falló como se esperaba: el proyecto
seguía construyendo desde `backend/`, que ya no existía.
