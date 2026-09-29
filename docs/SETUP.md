# Setup

## Variables de entorno

`backend/.env` (nunca se commitea — ver `.gitignore`; usar `.env.example` de referencia):

| Variable | Dónde conseguirla | Uso |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → **Data API** | Cliente anon y cliente admin |
| `SUPABASE_KEY` | Supabase → Project Settings → Data API → **anon/publishable key** | Cliente anon (sujeto a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → Data API → **service_role key** | Cliente admin (`backend/api/auth.js`), bypassea RLS. **Secreto, sólo backend.** |
| `PORT` | — | Puerto local del server Express (default 3000) |
| `SMTP_HOST` / `SMTP_PORT` | Producción: `smtp.gmail.com` / `465`. Local: `127.0.0.1` / `54325` (Mailpit). | Avisos por mail de las solicitudes (`backend/api/mail.js`). Sin `SMTP_HOST` no se manda ningún aviso (la app funciona igual). |
| `SMTP_USER` / `SMTP_PASS` | Producción: `oratoriogarayy@gmail.com` y su **contraseña de aplicación** (ver [Mails](#mails)). Local: vacías. | Idem. `SMTP_PASS` es **secreto**. |
| `MAIL_FROM` | — | Remitente, ej: `Oratorio de Garay <oratoriogarayy@gmail.com>`. Con Gmail tiene que ser la misma cuenta que `SMTP_USER`. |
| `APP_URL` | — | URL de la app para los links de los mails (`https://app-de-garay.vercel.app`). Sin ella se usa la del request, que en un preview de Vercel es la del preview. |
| `GOOGLE_AUTH_CLIENT_ID` / `GOOGLE_AUTH_CLIENT_SECRET` | Google Cloud Console → Credentials | **Informativos únicamente** — el backend no los lee (`grep process.env` lo confirma). Se cargan directo en Supabase Auth → Providers → Google, no en el código. |

El frontend (`frontend/index.html`) tiene hardcodeadas `SUPABASE_URL` y `SUPABASE_ANON_KEY` (la "publishable/anon key" es pública por diseño — ver [ARCHITECTURE.md](ARCHITECTURE.md)). Si cambian, actualizar ahí también.

## Desarrollo local

```bash
cd backend
npm install
npm run dev        # node --watch api/index.js, sirve todo en http://localhost:3000
```

No hay servidor de frontend separado: `backend/api/index.js` sirve `frontend/` como estático. Abrir `http://localhost:3000` directamente — no `frontend/index.html` a mano ni un `http-server` aparte, o `apiFetch`/CORS se comportan distinto.

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

> ⚠️ **Usá siempre `--local` con `db reset`.** `supabase db reset --linked` **borra y recrea la base de producción**.

La base local escucha en `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### App completa en local (sin tocar producción)

1. `npx supabase start`: levanta base, auth, API y Mailpit. Aplica las migraciones y `seed.sql` la primera vez; después usá `db reset --local` para volver a sembrar.
2. Copiá `backend/.env.local.example` a `backend/.env.local` y completalo con la *Publishable key* y la *Secret key* de `npx supabase status`. `.env.local` está en `.gitignore`.
3. `cd backend && npm run dev:local`, y abrí `http://localhost:3000`.
4. **Login:** con "o con tu mail". Escribís cualquier email y el código de 6 dígitos llega a **Mailpit** (`http://127.0.0.1:54324`). Los avisos de solicitudes también llegan ahí.
   - Usuarios del seed: `oratoriogarayy@gmail.com` (superadmin), `admin@local.test` (admin de Oratorio) y `miembro@local.test` (miembro de las dos organizaciones).
   - Cualquier otro email ve la pantalla de registro, para probar las solicitudes. El seed deja una pendiente de `nuevo@local.test` para Oratorio.

**Cómo decide la app a qué base apuntar:** el frontend no tiene la configuración hardcodeada; la pide a `GET /config.js`, que el backend arma con `SUPABASE_URL`/`SUPABASE_KEY`. Si no están, usa los valores de producción. Con `SUPABASE_URL` en `localhost`/`127.0.0.1`, la pantalla del código avisa que el mail llega a Mailpit. El botón de Google en local no funciona salvo que cargues credenciales en `[auth.external.google]` de `supabase/config.toml`.

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
   - Entrás a `admin.html`.
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

4. El frontend (`frontend/auth.js`) arma el `redirectTo` como `window.location.origin + "/"`: siempre la raíz del deploy desde el que se inició sesión. No hay nada que tocar ahí al agregar un preview nuevo, sólo mantener actualizada la allow list de Supabase.
   - **Por qué la raíz y no la página actual:** en la allow list, `*` no abarca puntos ni barras, así que `/admin.html?...` no matchea `/*` y Supabase caería en el Site URL.
   - **Volver al link original:** al empezar el login (Google o código), `auth.js` guarda en `localStorage` la ruta a la que quería ir el usuario (`oratorio.retorno`, vigente 30 minutos). Cuando la sesión queda confirmada, lo lleva ahí. Sólo acepta rutas del mismo sitio.

## Mails

Se mandan mails en dos lugares, y los dos salen por **Gmail** desde `oratoriogarayy@gmail.com`:

- **Supabase Auth:** el código de 6 dígitos para entrar con el mail.
- **Backend** (`backend/api/mail.js`): los avisos de solicitudes (a los aprobadores cuando hay una nueva, y al solicitante cuando se resuelve).

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

## Deploy (Vercel)

- Un solo proyecto Vercel apuntando a la raíz del repo, configurado por [`backend/vercel.json`](../backend/vercel.json).
- Variables de entorno (las de la tabla de arriba) se cargan en Vercel → Project → Settings → Environment Variables.
- Cada push a cualquier rama genera un **preview deployment** con URL propia; el deploy de la rama por defecto se alias a producción.
- Después de cualquier cambio en las variables de entorno hace falta un **redeploy** para que tome efecto (Vercel no las recarga en caliente).
- Ver la sección anterior para lo que hay que mantener sincronizado en Supabase cuando cambian las URLs de deploy.

## Checklist rápido para un agente nuevo

1. Leer [ARCHITECTURE.md](ARCHITECTURE.md) completo, y [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) si vas a tocar autenticación o permisos.
2. Leer [DATABASE.md](DATABASE.md) — especialmente la sección de deuda técnica sobre el schema no versionado.
3. `cd backend && npm install && npm run dev`, abrir `http://localhost:3000` y loguearse con un email registrado en `usuarios` (se dan de alta desde `admin.html`).
4. Antes de tocar el schema de Supabase: confirmar el estado real con `supabase db pull` o revisando el SQL Editor, no asumir que `supabase/migrations/` está completo.
5. Antes de agregar un endpoint nuevo: revisar [API.md](API.md) para mantener las convenciones de forma de respuesta y manejo de errores.
