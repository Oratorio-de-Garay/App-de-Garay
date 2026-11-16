# AGENTS.md

> **Nota para Agentes de IA (Codex, Claude, Cursor, etc.):** Este archivo es contexto persistente del proyecto y debe leerse siempre antes de iniciar cualquier tarea o planificar cambios.

## Qué es este proyecto
Aplicación web para el registro de ingreso/asistencia y gestión de buffet de un oratorio parroquial (grupo juvenil). Permite registrar asistencia de chicos, administrar fichas, llevar control de eventos y ventas de buffet, y administrar usuarios, roles y solicitudes de acceso por organización.

## Stack
- **Monorepo** con npm workspaces, todo en **TypeScript estricto**.
- API: **Hono** + **Zod** sobre Node.js (`apps/api`), con `@supabase/supabase-js`, `nodemailer` y `web-push`.
- App: **React 19 + Vite** (`apps/web`), con TanStack Router y TanStack Query, **Tailwind CSS v4** y componentes al estilo shadcn/ui (Radix).
- Código compartido entre API y app: `packages/shared` (esquemas Zod, tipos, cálculo de ventas, fechas, tipos generados de la base).
- Base de datos: PostgreSQL gestionado por Supabase (Auth + DB + RLS). La lógica de permisos vive en funciones SQL.
- Tests: Vitest (unitarios e integración), Testing Library, Playwright (e2e), pgTAP (base).
- Deploy: Vercel (monolito: la app desde el CDN y toda la API en una sola función, mismo origen).

El porqué de cada elección está en `docs/adr/0001-migracion-framework.md`.

## Estructura de carpetas
- `apps/api/`: la API. `src/app.ts` monta los módulos; `src/modules/<dominio>/routes.ts` (buffet, pibes, asistencia, admin, registro, push); `src/middleware/auth.ts`; `src/lib/` (errores, supabase, validar, mail, push); `test/` (integración).
- `apps/web/`: la app. `src/features/<dominio>/` (auth, asistencia, buffet, admin, push); `src/components/` (Listado, DialogoDeFormulario, useConfirmar, Stepper, Shell) y `src/components/ui/` (piezas base); `src/lib/`; `src/styles/app.css` (tokens de diseño).
- `packages/shared/`: esquemas, tipos y utilidades que usan los dos.
- `e2e/`: tests de punta a punta. `e2e/pages/app.ts` es el único archivo que conoce los selectores.
- `scripts/vercel-build.mjs`: build de producción.
- `supabase/`: migraciones versionadas en `migrations/`, tests pgTAP en `tests/`, seed data en `seed.sql`, y config en `config.toml`.
- `docs/`: `ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `ROLES_Y_PERMISOS.md`, `SETUP.md`, `DESARROLLO_LOCAL.md`, `TESTING.md`, `MIGRACION.md`, `adr/`.

## Convenciones del proyecto
- **Idioma:** nombres y comentarios en español. Los comentarios explican el porqué.
- **API:** endpoints REST bajo `/api/*`, autenticados con Bearer token de Supabase y header `X-Organization-Id`. Las rutas se definen encadenadas en el módulo de su dominio. Los datos de entrada se validan con `validar("json", esquema)` y un esquema de `packages/shared`.
- **Errores:** las rutas no arman respuestas de error ni usan `try/catch`: lanzan `ErrorHttp` (o dejan pasar el error de la base) y `manejarError` responde `{ error: "..." }`. Un 500 nunca expone el mensaje interno.
- **Scoping:** la API usa la service role key, así que **toda consulta a una tabla con `organizacion_id` filtra por `c.var.organizacionId`**. RLS queda como defensa en profundidad. Las funciones de administración reciben al actor explícito y corren en transacciones atómicas.
- **App:** todo listado usa `Listado`; todo alta o edición, `DialogoDeFormulario`; toda confirmación, `useConfirmar`; los avisos, `toast` de `sonner`. Nada de `alert()`, `confirm()` ni HTML armado a mano. Los datos se piden con el cliente tipado (`pedir(api.…)`) dentro de hooks de TanStack Query en el `consultas.ts` del dominio.
- **Estilos:** clases de Tailwind sobre los tokens de `apps/web/src/styles/app.css`. Ningún color suelto en un componente.
- **Datos en el dispositivo:** no se guardan datos de la base en `localStorage` (son datos de menores). Sólo la sesión y comodidades.
- **Docs:** mantener actualizados `API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `ROLES_Y_PERMISOS.md`.
- **Changelog:** registrar todo cambio relevante en `CHANGELOG.md` en la sección *Sin publicar*.
- **Migraciones:** todo cambio de schema va exclusivamente en una migración nueva en `supabase/migrations/`, seguida de `npm run db:types`. Nunca aplicar DDL directo en producción.

## Cómo correr localmente
Todo desde la raíz del repo. Requiere Node 22.12+ y Docker (guía completa en `docs/DESARROLLO_LOCAL.md`).

1. `npx supabase start`
2. Copiar `.env.local.example` a `.env.local` (en la raíz) y completarlo con las claves de `npx supabase status`.
3. `npm install`
4. `npm run dev` y abrir `http://localhost:3000` (la app con Vite en el 3000; la API en el 3001).

| Para | Comando |
|---|---|
| Verificar un cambio (lint, formato, tipos, unitarios) | `npm run check` |
| Tests de la API contra la base local | `npm run test:integration` |
| Tests de punta a punta | `npm run e2e` |
| Capturas de todas las pantallas (revisar diseño) | `npm run capturas` |
| Tests de la base (pgTAP) | `npx supabase test db` |
| Compilar y servir como en producción | `npm run start` |
| Probar el build de Vercel en la PC | `npm run vercel-build:probar` |
| Regenerar los tipos de la base | `npm run db:types` |
| Contra la base de producción (a propósito) | `npm run dev:prod` |

## Estado actual
- Noviembre de 2026: migración a React + Vite + Hono en la rama `feat/migracion-framework` (bitácora en `docs/MIGRACION.md`).
- Pendiente de esa migración: cambiar el *Root Directory* del proyecto en Vercel y validar el primer deploy (lista en `docs/SETUP.md#deploy-vercel`). Sin verificar todavía en un entorno real: login con Google, notificaciones push e instalación como app.
- El resto de los pendientes está en `docs/ARCHITECTURE.md`.

## Reglas para agentes
- Antes de tocar cualquier cosa, correr `Get-Location` y `git status`. Confirmar que estás en la raíz del repo (donde está el `.git`), NO en la carpeta padre `IT/`.
- Antes de modificar un archivo, mostrar el diff propuesto. Aplicar solo después de aprobación explícita del usuario.
- No usar scripts de reemplazo masivo (`String.replace`, `sed`) sin revisar cada match. Preferir ediciones puntuales.
- **Antes de dar por terminado un cambio: `npm run check`**, y `npm run e2e` si tocó algo que se ve en pantalla o un endpoint. Un cambio de comportamiento lleva su test (ver `docs/TESTING.md`).
- Leer `docs/API.md` antes de agregar endpoints. Un endpoint nuevo lleva su esquema en `packages/shared`, su test de integración y su entrada en `docs/API.md`.
- No tocar schema sin migración en `supabase/migrations/`.
- No tocar RLS sin actualizar `docs/ROLES_Y_PERMISOS.md`.
- Actualizar `CHANGELOG.md` y `docs/API.md` en cada cambio relevante.
- No commitear `.env.local`, `.env.production` ni claves.
- **Nunca compilar ni levantar la app contra producción sin que el usuario lo pida.** `npm run dev`, `npm run start`, `npm run build` y los tests usan siempre `.env.local`; a la base real sólo se llega con `npm run dev:prod`. No cambiar `SUPABASE_URL` de `.env.local` ni saltear la comprobación de `apps/web/vite.config.ts`.
- Los tests de integración y e2e crean y borran datos: sólo corren contra la base local (`e2e/support/entorno.ts` lo exige). No quitar esa comprobación.
- **Nunca correr `supabase db reset` sin avisar y pedir confirmación**, ni siquiera con `--local`: borra los datos locales que el usuario cargó a mano. Para aplicar migraciones nuevas en local usar `npx supabase migration up`; los tests (`npx supabase test db`) corren en transacciones y no borran nada. Jamás `--linked` (ver `docs/DESARROLLO_LOCAL.md`).
- Vercel: antes de tocar `vercel.json`, `scripts/vercel-build.mjs` o el despliegue leer "Deploy (Vercel)" en `docs/SETUP.md` (región `gru1`, Build Output API, una sola función, qué variables entran al bundle, cómo verificar un preview protegido por login).
- Mostrar el diff antes de aplicar cambios grandes.
- `AGENTS.md` y `CLAUDE.md` deben tener siempre el mismo contenido. Todo cambio en uno se replica en el otro en el mismo commit.
