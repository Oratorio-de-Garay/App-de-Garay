# Setup

## Variables de entorno

Las mismas variables sirven a la API, a la app y a los tests. La API no arranca si falta alguna de las tres de Supabase (no hay valores por defecto, ver `apps/api/src/env.ts`).

| Dónde | Archivo / lugar | Lo usa |
|---|---|---|
| Local, base local | `.env.local` en la raíz (ver `.env.local.example`) | `npm run dev`, `npm run start`, los tests |
| Local, base de producción | `.env.production` en la raíz | sólo `npm run dev:prod` |
| Vercel | Project → Settings → Environment Variables | el build y la función |

Los dos archivos están en `.gitignore`. Variables:

| Variable | Dónde conseguirla | Uso |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → **Data API** | La API y la app. **Entra al bundle de la app.** |
| `SUPABASE_KEY` | Supabase → Project Settings → Data API → **anon/publishable key** | La app (sesión de Supabase Auth). Es pública por diseño. **Entra al bundle de la app.** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → Data API → **service_role key** | El cliente de la API (`apps/api/src/lib/supabase.ts`), saltea RLS. **Secreto: nunca llega al navegador.** |
| `PORT` | — | Puerto de `npm run start` (la app compilada + la API). `npm run dev` usa el 3000 para la app y el 3001 para la API. |
| `SMTP_HOST` / `SMTP_PORT` | Producción: `smtp.gmail.com` / `465`. Local: `127.0.0.1` / `54325` (Mailpit). | Avisos por mail de las solicitudes (`apps/api/src/lib/mail.ts`). Sin `SMTP_HOST` no se manda ningún aviso (la app funciona igual). |
| `SMTP_USER` / `SMTP_PASS` | Producción: `oratoriogarayy@gmail.com` y su **contraseña de aplicación** (ver [Mails](#mails)). Local: vacías. | Idem. `SMTP_PASS` es **secreto**. |
| `MAIL_FROM` | — | Remitente, ej: `Oratorio de Garay <oratoriogarayy@gmail.com>`. Con Gmail tiene que ser la misma cuenta que `SMTP_USER`. |
| `APP_URL` | — | URL de la app para los links de los mails (`https://app-de-garay.vercel.app`). Sin ella se usa la del request, que en un preview de Vercel es la del preview. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Generar el par **una vez** con `npx web-push generate-vapid-keys` y usar el mismo en cada entorno donde quieras push. | Notificaciones push (`apps/api/src/lib/push.ts`). Opcionales: sin ellas el push queda deshabilitado (503) y el resto funciona. La pública **entra al bundle de la app**. `VAPID_PRIVATE_KEY` es **secreta**. Si se cambia el par, los dispositivos ya suscriptos dejan de recibir y tienen que reactivar. |
| `VAPID_SUBJECT` | `mailto:` de contacto, ej: `mailto:oratoriogarayy@gmail.com` (es el default) | Identifica al emisor ante los servicios push. |
| `CRON_SECRET` | Generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. El mismo valor va en Vercel y en Supabase Vault (`despacho_secreto`, ver [Notificaciones programadas](#notificaciones-programadas)). | Autentica a `POST /api/push/despachar`. Opcional: sin él las notificaciones programadas no se envían (503). **Secreto.** |
| `GOOGLE_AUTH_CLIENT_ID` / `GOOGLE_AUTH_CLIENT_SECRET` | Google Cloud Console → Credentials | **Informativos únicamente** — la API no los lee. Se cargan directo en Supabase Auth → Providers → Google, no en el código. |

**Qué viaja al navegador.** La app necesita `SUPABASE_URL`, `SUPABASE_KEY` y `VAPID_PUBLIC_KEY`. Las tres son públicas por diseño y se incluyen **al compilar** (`apps/web/vite.config.ts` las elige una por una; ninguna otra variable entra al bundle). Consecuencias:

- Cambiar una de esas tres en Vercel exige un **redeploy**.
- **En una PC la app siempre se compila contra `.env.local`.** El build falla si `SUPABASE_URL` no es local, salvo que se pida la base real a propósito con `npm run dev:prod`. Así un `npm run build` no puede dejar una app local hablándole a producción.

## Desarrollo local

**La guía completa, paso a paso y con problemas comunes, está en [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md).** Lo que sigue es un resumen.

```bash
npm install        # una sola vez, en la raíz
npm run dev        # contra Supabase local (.env.local) → http://localhost:3000
npm run start      # compila y sirve todo junto, como en producción
npm run dev:prod   # contra producción, a propósito (.env.production)
```

`npm run dev` levanta dos procesos: la app con Vite en el **3000** (recarga al guardar) y la API en el **3001**; Vite le reenvía `/api`. Abrir siempre `http://localhost:3000`: es la única dirección a la que el login de Supabase local sabe volver.

## Base de datos

Ver [DATABASE.md](DATABASE.md) para el schema completo y las políticas RLS. Las migraciones de `supabase/migrations/` reconstruyen toda la base desde cero.

### Base local (Docker)

**Requisitos:** Docker Desktop corriendo. En Windows necesita WSL2: `wsl --install --no-distribution` y reiniciar. Si Docker Desktop dice "Resource saver mode" está bien: se despierta solo al usarlo.

```bash
npx supabase db start          # levanta Postgres local y aplica migraciones + seed.sql
npx supabase db reset --local  # vuelve a crear la base local desde cero
npx supabase test db           # corre los tests pgTAP de supabase/tests/
npx supabase stop              # apaga la base local
```

> ⚠️ **Usá siempre `--local` con `db reset`.** `supabase db reset --linked` **borra y recrea la base de producción**. Y `db reset --local` borra tus datos locales: para aplicar una migración nueva usá `npx supabase migration up` (ver [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md)).

La base local escucha en `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### App completa en local (sin tocar producción)

Resumen; el detalle está en [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md).

1. `npx supabase start`: levanta base, auth, API y Mailpit. Aplica las migraciones y `seed.sql` la primera vez; después usá `db reset --local` para volver a sembrar.
2. Copiá `.env.local.example` a `.env.local` (en la raíz) y completalo con la *Publishable key* y la *Secret key* de `npx supabase status`. `.env.local` está en `.gitignore`.
3. `npm install` y `npm run dev` (en la raíz), y abrí `http://localhost:3000`.
4. **Login:** con "o con tu mail". Escribís cualquier email y el código de 6 dígitos llega a **Mailpit** (`http://127.0.0.1:54324`). Los avisos de solicitudes también llegan ahí.
   - Usuarios del seed: `oratoriogarayy@gmail.com` (superadmin), `admin@local.test` (admin de Oratorio) y `miembro@local.test` (miembro de las dos organizaciones).
   - Cualquier otro email ve la pantalla de registro, para probar las solicitudes. El seed deja una pendiente de `nuevo@local.test` para Oratorio.

**Cómo decide la app a qué base apuntar:** por el archivo de variables con el que se levantó (`.env.local` siempre, salvo `npm run dev:prod`). Si falta alguna variable de Supabase, ni la API ni el build arrancan. Contra la base local, la pantalla del código avisa que el mail llega a Mailpit. Si la app corre en `localhost` contra otra base, muestra una franja roja de "Base de PRODUCCIÓN", y la terminal lo avisa al arrancar. El botón de Google en local no funciona salvo que cargues credenciales en `[auth.external.google]` de `supabase/config.toml`.

### Aplicar migraciones a producción

1. **Probar en local:** `db reset --local` y `test db`, para confirmar que la migración aplica desde cero y no rompe reglas.
2. **Ver qué se va a aplicar:**
   ```bash
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   ```
3. **Aplicar:** `npx supabase db push --linked`.
4. **Chequear que no haya diferencias:** comparar `npx supabase db dump --linked` contra `npx supabase db dump --local`.

### Proyecto Supabase nuevo

1. `npx supabase link --project-ref <ref>` y `npx supabase db push`. Esto crea todo el schema, incluidas las tablas base.
2. Cargar los lookups: niveles, grados y edades (ver `supabase/seed.sql` como referencia).
3. La migración `20260926000000_roles_y_admin.sql` carga como **superadmin** a `oratoriogarayy@gmail.com`. Con esa cuenta:
   - Entrás a `/admin`.
   - Creás o revisás las organizaciones.
   - Asignás admins.
   - Das de alta usuarios.

   Para sumar otro superadmin, ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md#agregar-otro-superadmin).

## Autenticación: Google + Supabase

1. **Google Cloud Console** → Credentials → OAuth 2.0 Client ID. Authorized redirect URI:
   ```
   https://<tu-proyecto>.supabase.co/auth/v1/callback
   ```
   (No hace falta listar acá las URLs de tu app — Google sólo necesita saber a qué dominio de Supabase puede volver.)

2. **Supabase** → Authentication → Providers → Google: cargar el Client ID y Client Secret de Google ahí.

3. **Supabase** → Authentication → URL Configuration:
   - **Site URL**: la URL de producción (`https://app-de-garay.vercel.app`). Es el fallback si el `redirectTo` pedido no matchea ninguna entrada permitida — si esto pasa "sin explicación", es la causa más probable.
   - **Redirect URLs** (allow list): tiene que incluir, con wildcard, todos los orígenes desde los que se puede loguear:
     ```
     http://localhost:3000
     http://localhost:3000/*
     https://app-de-garay.vercel.app
     https://app-de-garay.vercel.app/*
     https://app-de-garay*.vercel.app
     https://app-de-garay*.vercel.app/*
     ```
     El último par cubre los **deploy previews de Vercel** (`app-de-garay-<hash>-<team>.vercel.app`), que cambian en cada push. Sin la variante `/*`, un `redirectTo` con trailing slash no matchea y Supabase cae silenciosamente al Site URL — así se manifiesta: el login "funciona" pero siempre termina en producción en vez de en el preview desde el que arrancó.

4. La app (`apps/web/src/features/auth/login.tsx`) arma el `redirectTo` como `location.origin + "/"`: siempre la raíz del deploy desde el que se inició sesión. No hay nada que tocar ahí al agregar un preview nuevo, sólo mantener actualizada la allow list de Supabase.
   - **Por qué la raíz y no la página actual:** es la única dirección que seguro matchea la allow list; con cualquier otra, si no matchea, Supabase cae en el Site URL.
   - **Volver al link original:** al empezar el login (Google o código) se guarda en `localStorage` la ruta a la que quería ir el usuario (`oratorio.retorno`, vigente 30 minutos; `apps/web/src/lib/almacen.ts`). Cuando la sesión queda confirmada, lo lleva ahí. Sólo acepta rutas del mismo sitio.

## Mails

Se mandan mails en dos lugares, y los dos salen por **Gmail** desde `oratoriogarayy@gmail.com`:

- **Supabase Auth:** el código de 6 dígitos para entrar con el mail.
- **La API** (`apps/api/src/lib/mail.ts`): los avisos de solicitudes (a los aprobadores cuando hay una nueva, y al solicitante cuando se resuelve).

El SMTP que trae Supabase de fábrica **no sirve**: sólo manda a los miembros del equipo del proyecto y unos pocos mails por hora.

### 1. Contraseña de aplicación de Gmail

1. En la cuenta `oratoriogarayy@gmail.com`, activar la **verificación en 2 pasos** (Cuenta de Google → Seguridad).
2. Crear una **contraseña de aplicación** en <https://myaccount.google.com/apppasswords>, con un nombre como "App de Garay".
   - Google ya no la muestra en el menú de Seguridad: hay que entrar por ese link, o buscar "contraseñas de aplicaciones" en el buscador de la cuenta.
   - Si dice que la opción no está disponible, falta activar la verificación en 2 pasos (paso 1).
   - Google muestra la contraseña una sola vez: 16 letras, en grupos de 4. Se carga sin los espacios.
3. Guardarla: se usa en los dos pasos siguientes. Gmail permite unos 500 mails por día.

### 2. Supabase (producción) → Authentication

- **Emails → SMTP Settings:** habilitar el SMTP propio.
  - Host `smtp.gmail.com`, puerto `465`.
  - Usuario `oratoriogarayy@gmail.com`, contraseña: la de aplicación.
  - Sender email `oratoriogarayy@gmail.com`, sender name `Oratorio de Garay`.
- **Emails → Templates:** en **Confirm signup** (cuenta nueva) y **Magic Link** (cuenta existente):
  - Asunto: `Tu código para entrar: {{ .Token }}`.
  - Cuerpo: el HTML de [`supabase/templates/codigo.html`](../supabase/templates/codigo.html). Muestra `{{ .Token }}` en vez de un link.
- **Sign In / Providers → Email:** habilitado, con signups permitidos. Largo del código (OTP length) `6` y vencimiento (Email OTP Expiration) `600` segundos.
- **Rate Limits:** subir "emails sent per hour" (con SMTP propio se puede; por ejemplo, 60).

En local todo esto ya está en `supabase/config.toml`, y los mails llegan a Mailpit.

### 3. Vercel

Cargar `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` y `APP_URL` (ver la tabla de variables de entorno) y hacer un redeploy.

## Notificaciones programadas

Las notificaciones push programadas las dispara la base: `pg_cron` corre cada minuto `despachar_notificaciones_programadas()` y, **sólo si hay alguna vencida**, llama con `pg_net` a `POST /api/push/despachar`. La migración `20261110000000_notificaciones_programadas.sql` activa `pg_cron` y `pg_net` y crea el job. Falta decirle **a qué URL llamar y con qué secreto**, que no viven en el repo sino en Supabase Vault. Una sola vez por entorno:

1. Generar el secreto (ver `CRON_SECRET` en [Variables de entorno](#variables-de-entorno)) y cargarlo como `CRON_SECRET` en Vercel (Production y, si se quiere probar ahí, Preview). Redeploy.
2. En el SQL Editor de Supabase (es un dato de configuración, no un cambio de schema):

   ```sql
   select vault.create_secret('https://app-de-garay.vercel.app/api/push/despachar', 'despacho_url');
   select vault.create_secret('<el mismo CRON_SECRET>', 'despacho_secreto');
   ```

   Para cambiarlos después: `select vault.update_secret(id, '<nuevo valor>') from vault.secrets where name = 'despacho_url';` (idem `despacho_secreto`).

Mientras falten, las programadas quedan en `programada` y la base avisa con un warning en cada pasada; las inmediatas no se ven afectadas. Para ver qué pasó: `select * from cron.job_run_details order by start_time desc limit 10;` y `select * from net._http_response order by created desc limit 10;`.

**Local:** `pg_cron` no puede llamar a `localhost:3000` desde el contenedor sin configuración extra. Para probar se dispara a mano, con `CRON_SECRET` en `.env.local`:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/push/despachar
```

**Alternativa sin `pg_cron`:** un Vercel Cron (por minuto sólo en plan Pro) o un servicio externo que haga ese mismo `POST` cada minuto. El endpoint es el mismo.

## Deploy (Vercel)

Un solo proyecto Vercel sirve la app y la API desde el mismo origen.

### Configuración del proyecto

| Ajuste (Settings → General / Build) | Valor |
|---|---|
| **Root Directory** | la raíz del repo (vacío). **No** `backend`, que ya no existe. |
| Framework Preset | Other |
| Build Command | `npm run vercel-build` (lo fija [`vercel.json`](../vercel.json)) |
| Install Command | `npm ci` (lo fija `vercel.json`) |
| Output Directory | sin completar: el build escribe `.vercel/output` |
| Node.js Version | 22.x |
| Functions → Region | `gru1` (São Paulo). También está en `vercel.json` y en `scripts/vercel-build.mjs`: si se cambia una, cambiar las otras. |

Ya no hace falta *Include source files outside of the Root Directory*.

### Cómo se arma

`npm run vercel-build` corre [`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs), que escribe `.vercel/output` con la [Build Output API v3](https://vercel.com/docs/build-output-api):

- `static/`: la app compilada por Vite. La sirve el CDN, con compresión y sin pasar por la función.
- `functions/api.func/`: **toda la API en una sola función**, empaquetada con esbuild (un archivo con sus dependencias adentro).
- `config.json`: las rutas. `/api/*` → la función; `/assets/*` con caché para siempre (los nombres llevan hash); cualquier otra dirección → `index.html`, que resuelve el router de la app.

**Por qué se empaqueta acá y no con una carpeta `api/`:** la API importa TypeScript de otro paquete del repo (`@garay/shared`). Empaquetándola en el build, el resultado no depende de cómo Vercel compile un monorepo, y **se puede probar en una PC**:

```bash
npm run vercel-build:probar
```

Compila (contra la base local) y le hace pedidos reales a la función empaquetada, cargándola como un módulo que exporta `(req, res)`.

### Cómo se publicó la migración (hecho el 16/11/2026)

Hasta la migración a React + Hono el proyecto tenía *Root Directory* `backend`. Se pasó a la raíz con el PR de la migración listo, se revisó el preview con la lista de abajo y recién después se mergeó (PR #37). Queda como referencia por si alguna vez hay que repetir un corte así: ese ajuste es de todo el proyecto, no de una rama, así que mientras dure el cambio los deploys de las otras ramas fallan.

### Qué revisar en un preview

Sirve después de cualquier cambio en el build, en `vercel.json` o en `scripts/vercel-build.mjs`.

Los previews están protegidos por el login de Vercel (a `curl` responden 302): hay que iniciar sesión en el navegador (pidiéndoselo al usuario si lo hace un agente).

- [ ] La app carga, y `/admin` abierto directo en la barra de direcciones también (no da 404).
- [ ] `/api/health` responde `{"status":"ok"}`.
- [ ] Login con **Google** y con **código por mail**. Con Google, que vuelva al preview y no a producción (allow list de Supabase, ver arriba).
- [ ] Un link viejo (`/admin.html?tab=solicitudes`) redirige a `/admin?tab=solicitudes`.
- [ ] Buscar un chico, marcar y desmarcar un presente.
- [ ] En las herramientas del navegador: los archivos de `/assets/` vienen con `Cache-Control: … immutable` y `Content-Encoding: br`; los pedidos a `/api` muestran la región `gru1` en `x-vercel-id`.
- [ ] Notificaciones push e "Instalar como app", en un celular. `VAPID_PUBLIC_KEY` suele estar vacía en el entorno **Preview**: sin ella el push no se puede probar ahí.

Si un deploy falla en el build, el log de Vercel y `scripts/vercel-build.mjs` son el lugar donde mirar; antes de subir un cambio así, `npm run vercel-build:probar` reproduce el build en una PC.

### Para tener en cuenta

- Cada push a cualquier rama genera un **preview** con URL propia; el deploy de la rama por defecto queda como producción.
- Después de cambiar variables de entorno hace falta un **redeploy**. Para `SUPABASE_URL`, `SUPABASE_KEY` y `VAPID_PUBLIC_KEY` es indispensable: están dentro del bundle de la app.
- Ver la sección de autenticación para lo que hay que mantener sincronizado en Supabase cuando cambian las URLs de deploy.

## Checklist rápido para un agente nuevo

1. Leer [ARCHITECTURE.md](ARCHITECTURE.md) completo, y [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) si vas a tocar autenticación o permisos.
2. Leer [DATABASE.md](DATABASE.md) — especialmente la sección de deuda técnica sobre el schema no versionado.
3. Levantar la app en local siguiendo [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md) y entrar con uno de los usuarios de prueba del seed. Leer [TESTING.md](TESTING.md): `npm run check` antes de dar por terminado un cambio.
4. Antes de tocar el schema de Supabase: confirmar el estado real con `supabase db pull` o revisando el SQL Editor, no asumir que `supabase/migrations/` está completo.
5. Antes de agregar un endpoint nuevo: revisar [API.md](API.md) para mantener las convenciones de forma de respuesta y manejo de errores.
