# Arquitectura

## Resumen

App de registro de ingreso/asistencia y buffet de un oratorio (grupo juvenil parroquial). Es un **monolito modular**: un solo repositorio y **un único proyecto Vercel** que sirve, desde el mismo origen, la aplicación (React) y la API (Hono). **Supabase** (Postgres) es la única base de datos y también resuelve la autenticación (Google o código por mail).

Todo el código es TypeScript estricto y cada cambio se verifica con un comando (`npm run check`) y tres niveles de tests. El porqué de este stack está en [adr/0001-migracion-framework.md](adr/0001-migracion-framework.md); cómo se llegó, en [MIGRACION.md](MIGRACION.md).

## Estructura del repo

```
apps/
  api/                 ← la API (Hono)
    src/
      app.ts           ← monta los módulos y declara qué exige cada grupo de rutas
      env.ts           ← variables de entorno validadas; sin las obligatorias no arranca
      middleware/auth.ts ← sesión, usuario, organización activa y roles
      lib/             ← errores, cliente de Supabase, validación, mails, push, caché
      modules/<dominio>/routes.ts ← buffet, pibes, asistencia, admin, registro, push
      server.ts        ← servidor local
      vercel.ts        ← entrada de la función de Vercel
    test/              ← tests de integración contra la base local
  web/                 ← la aplicación (React + Vite)
    public/            ← sw.js, manifest.json, icon.svg (se sirven desde la raíz)
    src/
      styles/app.css   ← Tailwind y TODOS los colores, como tokens
      components/ui/   ← piezas base (botón, campos, diálogo, pestañas…)
      components/      ← Listado, DialogoDeFormulario, useConfirmar, Stepper, Shell
      features/<dominio>/ ← auth, asistencia, buffet, admin, push
      lib/             ← cliente de la API, sesión, formato, storage
      router.tsx       ← rutas
packages/
  shared/              ← lo que usan la API y la app: esquemas Zod, tipos, fechas,
                         cálculo de ventas y los tipos generados de la base
e2e/                   ← tests de punta a punta (Playwright)
scripts/
  vercel-build.mjs     ← build de producción (Build Output API de Vercel)
supabase/
  migrations/          ← migraciones versionadas (fuente de verdad del schema)
  tests/               ← tests pgTAP de las reglas que viven en SQL
  templates/           ← plantilla del mail con el código de login
docs/                  ← esta documentación
```

## Cómo se reparte la responsabilidad

| Capa | Hace | No hace |
|---|---|---|
| **Base (funciones SQL)** | Las reglas que no se pueden saltear: permisos, scope por organización, auditoría, stock de una venta. Cada operación en una transacción | — |
| **API** | Autenticar, validar la forma del pedido, elegir la organización activa, llamar a la base, traducir errores a HTTP, mandar mails y push | Reglas de permisos finos (están en SQL) |
| **App** | Mostrar, navegar, validar formularios con los mismos esquemas, guardar datos en caché | Decidir permisos: lo que oculta es comodidad, el control real es de la API |

**La API es "gorda" y la app "tonta":** armar la etiqueta de un grado, contar visitas, evitar un presente duplicado o calcular el total de una venta se hace en el servidor. La app pide datos ya resueltos y los muestra.

## La API (`apps/api`)

- **Un módulo por dominio.** Cada `modules/<dominio>/routes.ts` define sus rutas encadenadas (`new Hono().get(...).post(...)`): así el tipo `ApiRoutes` que exporta `app.ts` describe toda la API y el frontend lo usa para tipar sus llamadas.
- **Quién entra a qué se declara al montar** cada grupo en `app.ts`, no ruta por ruta:

  | Rutas | Exigen |
  |---|---|
  | `/api/health` | nada |
  | `/api/registro/*` | sesión válida (quien todavía no tiene acceso) |
  | `/api/push/despachar` | el secreto compartido con `pg_cron` |
  | `/api/auth/me`, `/api/push/suscripciones` | usuario registrado |
  | `/api/admin/*` | usuario registrado + administrar algo |
  | el resto | usuario registrado + organización activa |

- **Las rutas no arman errores: lanzan.** `ErrorHttp` para lo esperable; lo que devuelve Supabase sale como `ErrorDeBase` y `manejarError` lo traduce por SQLSTATE. Un `500` nunca muestra el mensaje interno.
- **Validación con Zod** (`validar("json", esquema)`): el handler recibe el valor ya tipado y transformado. Los esquemas viven en `packages/shared` para que los formularios usen las mismas reglas.
- **Toda consulta a una tabla con `organizacion_id` filtra por ella.** El cliente usa la service role key (saltea RLS), así que ese filtro es la barrera real; RLS queda como defensa en profundidad.
- **Forma común de un "pibe":** todos los endpoints que devuelven personas usan el tipo `Pibe` de `packages/shared`, armado por `modules/pibes/mappers.ts`. Un endpoint nuevo que devuelva pibes usa ese mapper.

## La app (`apps/web`)

- **Una sola aplicación.** Rutas `/`, `/buffet` y `/admin` (TanStack Router); cada pantalla se baja recién cuando se entra. Las direcciones anteriores (`/admin.html?...`) redirigen.
- **Lo que se ve sale de la URL:** la ficha abierta, el día del historial, la pestaña, el evento. El botón "atrás" del celular funciona y un link lleva a esa vista.
- **Datos con TanStack Query.** Cada dominio tiene su `consultas.ts` con las lecturas (`useQuery`) y los cambios (`useMutation`). Un cambio invalida sólo lo que tocó. Las claves empiezan con la organización, así al cambiarla no se mezcla nada.
- **Cliente tipado:** `pedir(api.buffet.products.$get())`. Si cambia un endpoint, la app deja de compilar donde lo usa.
- **Componentes compartidos.** Todo listado usa `Listado`; todo alta o edición, `DialogoDeFormulario`; toda confirmación, `useConfirmar`; todo aviso, `toast` de `sonner`. No se usan `alert()` ni `confirm()`.
- **Lógica fuera de los componentes** cuando se puede: `features/buffet/carrito.ts` o `features/admin/textos.ts` son funciones puras con sus tests.
- **Estilos:** clases de Tailwind sobre los tokens de `styles/app.css` (`bg-primary`, `text-muted-foreground`). Ningún color suelto en un componente.
- **Nada se arma como HTML a mano:** React escapa lo que escribió el usuario.
- **Los datos no se guardan en el dispositivo.** Viven en memoria y se borran al cerrar sesión: son datos de menores y los teléfonos a veces se comparten. En `localStorage` sólo quedan la sesión de Supabase y comodidades (organización elegida, tamaño de página).

## Autenticación y autorización

- **Login:** lo maneja Supabase Auth en el navegador (`features/auth/`), sin backend propio de sesión ni cookies.
  - Google OAuth (`signInWithOAuth`), que siempre vuelve a la raíz del sitio.
  - Mail + código de 6 dígitos (`signInWithOtp` + `verifyOtp`), sin contraseña. Es el mismo flujo para crear la cuenta y para entrar.
  - Si alguien abre un link sin sesión (ej: el de una solicitud en un mail), al terminar el login vuelve a ese link (`lib/almacen.ts`; sólo acepta rutas del mismo sitio).
- **Estados de sesión** (`features/auth/sesion.tsx`): sin sesión → login; con sesión pero sin acceso → pantalla para pedirlo; con acceso → la app. Hasta que la API confirma el acceso no se monta nada de la app.
- **Registro abierto con aprobación:** cualquiera puede crear una cuenta, pero sin acceso a nada. Pide sumarse a un espacio o crear uno, y un admin o superadmin lo acepta o rechaza desde el panel. Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#registro-y-solicitudes).
- **Cada pedido a la API** lleva `Authorization: Bearer <access_token>` y `X-Organization-Id` (los agrega `lib/api.ts`).
- **La API valida el token localmente** con `getClaims` (firma ES256 y vencimiento contra las claves públicas del proyecto), sin viaje a Auth; si falla, cae a `getUser`. Después llama a `contexto_usuario(email)`, que devuelve si está registrado, sus organizaciones y sus roles. Las dos cosas se cachean 30 s en memoria.
- **Tres niveles:** miembro (tener la organización), `admin` (por organización) y `superadmin` (global). El modelo completo está en **[ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md)**.
- **Panel:** la API sólo decide quién entra a cada endpoint. Las reglas de scope viven en funciones SQL que reciben al actor y hacen cada operación en una transacción con su auditoría.

## Despliegue (Vercel)

- Un solo proyecto, con *Root Directory* en la raíz del repo. El comando de build es `npm run vercel-build` ([`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs)), que escribe `.vercel/output` con la [Build Output API](https://vercel.com/docs/build-output-api):
  - `static/`: la app compilada. La sirve el CDN, sin pasar por la función.
  - `functions/api.func/`: **toda la API en una sola función**, empaquetada con esbuild, en la región `gru1` (al lado de la base, `sa-east-1`).
  - `config.json`: `/api/*` va a la función; los archivos de `/assets` se cachean para siempre (llevan hash); cualquier otra dirección devuelve `index.html`.
- **Mismas variables para la API y la app.** `SUPABASE_URL`, `SUPABASE_KEY` y `VAPID_PUBLIC_KEY` se leen también al compilar la app (`apps/web/vite.config.ts` elige una por una las que pueden viajar al navegador). Por eso **cambiar una de esas tres exige un redeploy**.
- Cada push genera un **deploy preview** con URL propia; `app-de-garay.vercel.app` es el alias de producción. Esto condiciona la configuración de OAuth (ver [SETUP.md](SETUP.md#autenticación-google--supabase)).
- El detalle, y cómo probar el build en una PC, está en [SETUP.md](SETUP.md#deploy-vercel).

## Convenciones de código

- **Nombres y comentarios en español** (el dominio habla de "pibes", "ficha", "presente"). Los comentarios explican el porqué, no lo que el código ya dice.
- **Antes de dar por terminado un cambio:** `npm run check`, y `npm run e2e` si tocó algo visible o un endpoint. Ver [TESTING.md](TESTING.md).
- **Endpoint nuevo:** esquema en `packages/shared`, ruta en el módulo de su dominio, test de integración, y [API.md](API.md).
- **Pantalla o listado nuevo:** componer con lo que hay en `components/`; si falta una pieza base, se agrega en `components/ui/`.
- **Cambio de schema:** siempre con una migración nueva en `supabase/migrations/`, y después `npm run db:types`.
- Registrar los cambios relevantes en [CHANGELOG.md](../CHANGELOG.md) (sección *Sin publicar*).

## Pendientes y cosas a tener en cuenta

1. **Google no funciona en local:** se entra con el código por mail, que llega a Mailpit. Para probar Google hay que cargar credenciales en `[auth.external.google]` de `supabase/config.toml`.
2. **Mejoras de rendimiento que necesitan una migración:**
   - `GET /api/buffet/events` suma las ventas de cada evento en JavaScript; debería agregarse en SQL.
   - `POST /api/students` hace dos inserts sin transacción (el pibe y su presente).
   - Las ventas de un evento no tienen paginación del lado del servidor.
3. **Paginación del lado del cliente:** cada listado trae todos sus datos y `Listado` muestra una página. Si alguno llegara a miles de filas habría que paginar en el servidor.
4. **`/api/students/search` devuelve como máximo 100 resultados.**
5. **Rendimiento:** la latencia la domina la cantidad de viajes API↔Supabase por pedido. Regla: evitar loops con `await` sobre consultas; preferir una RPC o un select embebido. **Compromiso de la validación local del token:** un access token sigue valiendo hasta que vence (1 h) aunque la sesión se cierre en otro dispositivo.
6. **Tamaño del bundle:** las librerías pesan 241 KB gzip. El candidato a achicar es `supabase-js` (56 KB), del que sólo se usa la sesión; hay que poder probar el login con Google antes de tocarlo.
7. **No hay control de concurrencia** más allá del chequeo "¿ya tiene presente hoy?" al marcar.
8. **Los catálogos (`grados_pibes`, `edades`) no tienen pantalla:** se editan por SQL.
9. **Mails best-effort:** los avisos de solicitudes se mandan en el mismo pedido, después de guardar. Si el SMTP falla, la solicitud queda igual (la respuesta trae `notificados: 0`) y no hay reintento.
10. **Antes de un `supabase db push`:** `supabase migration list --linked` y `supabase db push --linked --dry-run` para ver qué se va a aplicar.
11. **Notificaciones push (Web Push, no FCM):** estándar Web Push con claves VAPID y la librería `web-push`; no hace falta Firebase.
    - **Serverless:** la función se congela al responder, así que el envío se espera dentro del pedido (timeout de 8 s por dispositivo, hasta 50 destinatarios por envío).
    - **SSRF:** el servidor hace un POST a la URL que manda el navegador, por eso `endpointPermitido()` sólo acepta los servicios push conocidos.
    - **iOS** (16.4+) sólo recibe push con la app instalada en la pantalla de inicio.
    - **Aviso para activarlas:** `features/push/avisos.tsx`, dentro de la app. Preferencias en `localStorage`: `oratorio.push.pospuesto` (7 días) y `oratorio.push.desactivado`.
    - **Sin reintentos:** un dispositivo que falla queda como fallido; los 404/410 se borran.
    - **Programadas (cola en la base):** `pg_cron` corre cada minuto y, sólo si hay algo vencido, llama con `pg_net` a `POST /api/push/despachar`, que toma las vencidas con `for update skip locked`, envía y cierra. Salen con hasta ~1 minuto de demora.
12. **Íconos de la app instalable:** el `manifest.json` sólo declara un SVG. Falta generar PNG de 192 y 512 (más una variante `maskable`) y un `apple-touch-icon` de 180.

## Ver también

- [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md) — levantar todo en una PC, paso a paso.
- [TESTING.md](TESTING.md) — qué se prueba en cada nivel y cómo escribir un test.
- [API.md](API.md) — referencia de endpoints.
- [DATABASE.md](DATABASE.md) — schema, relaciones, RLS.
- [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) — roles, scope de organizaciones, auditoría.
- [SETUP.md](SETUP.md) — variables de entorno, deploy, configuración de auth.
- [CHANGELOG.md](../CHANGELOG.md) — registro de cambios.
- [legacy/](legacy/) — documentación de la primera versión (Google Apps Script + Sheets), sólo como contexto histórico.
