# Setup

## Variables de entorno

`backend/.env` (nunca se commitea — ver `.gitignore`; usar `.env.example` de referencia):

| Variable | Dónde conseguirla | Uso |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → **Data API** | Cliente anon y cliente admin |
| `SUPABASE_KEY` | Supabase → Project Settings → Data API → **anon/publishable key** | Cliente anon (sujeto a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → Data API → **service_role key** | Cliente admin (`backend/api/auth.js`), bypassea RLS. **Secreto, sólo backend.** |
| `PORT` | — | Puerto local del server Express (default 3000) |
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

Ver [DATABASE.md](DATABASE.md) para el schema completo y las políticas RLS. Resumen del setup inicial en un proyecto Supabase nuevo:

1. Crear las tablas (`organizaciones`, `niveles_grados_pibes`, `grados_pibes`, `edades`, `pibes`, `asistencias`) — no hay migración que las cree, hacerlo a mano en el SQL Editor siguiendo el schema documentado en DATABASE.md.
2. Habilitar RLS y otorgar los `GRANT`/policies al rol `anon` como se detalla en DATABASE.md.
3. Correr las migraciones versionadas para `allowed_emails`:
   ```bash
   supabase db push   # o pegar el contenido de supabase/migrations/*.sql a mano
   ```
4. Cargar el seed mínimo de lookups (ver DATABASE.md) — sin esto no se puede crear ningún pibe.
5. Agregar al menos un email propio a `allowed_emails` para poder loguearte.

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

4. El frontend (`frontend/auth.js`) arma el `redirectTo` dinámicamente como `window.location.origin + window.location.pathname` — no hay nada que tocar ahí al agregar un preview nuevo, sólo mantener actualizada la allow list de Supabase.

## Deploy (Vercel)

- Un solo proyecto Vercel apuntando a la raíz del repo, configurado por [`backend/vercel.json`](../backend/vercel.json).
- Variables de entorno (las de la tabla de arriba) se cargan en Vercel → Project → Settings → Environment Variables.
- Cada push a cualquier rama genera un **preview deployment** con URL propia; el deploy de la rama por defecto se alias a producción.
- Después de cualquier cambio en las variables de entorno hace falta un **redeploy** para que tome efecto (Vercel no las recarga en caliente).
- Ver la sección anterior para lo que hay que mantener sincronizado en Supabase cuando cambian las URLs de deploy.

## Checklist rápido para un agente nuevo

1. Leer [ARCHITECTURE.md](ARCHITECTURE.md) completo.
2. Leer [DATABASE.md](DATABASE.md) — especialmente la sección de deuda técnica sobre el schema no versionado.
3. `cd backend && npm install && npm run dev`, abrir `http://localhost:3000`, loguearse con un email que esté en `allowed_emails`.
4. Antes de tocar el schema de Supabase: confirmar el estado real con `supabase db pull` o revisando el SQL Editor, no asumir que `supabase/migrations/` está completo.
5. Antes de agregar un endpoint nuevo: revisar [API.md](API.md) para mantener las convenciones de forma de respuesta y manejo de errores.
