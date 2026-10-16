# AGENTS.md

> **Nota para Agentes de IA (Codex, Claude, Cursor, etc.):** Este archivo es contexto persistente del proyecto y debe leerse siempre antes de iniciar cualquier tarea o planificar cambios.

## Qué es este proyecto
Aplicación web para el registro de ingreso/asistencia y gestión de buffet de un oratorio parroquial (grupo juvenil). Permite registrar asistencia de chicos, administrar fichas, llevar control de eventos y ventas de buffet, y administrar usuarios, roles y solicitudes de acceso por organización.

## Stack
- Backend: Node.js + Express (módulos ES, sin TS ni bundler), `@supabase/supabase-js`, `nodemailer`.
- Frontend: HTML/CSS/JS vanilla (SPA ligera servida como estático por Express, sin framework ni bundler).
- Base de datos: PostgreSQL gestionado por Supabase (Auth + DB + RLS).
- Deploy: Vercel (monolito: Express sirve la API y el frontend estático desde el mismo origen).

## Estructura de carpetas
- `backend/`: API Express, rutas (`api/index.js`, `admin.js`, `registro.js`, `auth.js`, `mail.js`, `rpc.js`), package.json y vercel.json.
- `frontend/`: Archivos estáticos (`index.html`, `buffet.html`, `admin.html`, scripts vanilla `index.js`, `auth.js`, etc. y CSS).
- `supabase/`: Migraciones versionadas en `migrations/`, tests pgTAP en `tests/`, seed data en `seed.sql`, y config en `config.toml`.
- `docs/`: Documentación detallada (`ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `ROLES_Y_PERMISOS.md`, `SETUP.md`).

## Convenciones del proyecto
- API: Endpoints REST bajo `/api/*`, autenticados con Bearer token de Supabase y header `X-Organization-Id`. Respuestas consistentes (forma común de pibe, errores en `{ error: "..." }`).
- Errores: Manejo con `try/catch`, logueo en servidor con `console.error` y respuesta JSON estándar.
- Docs: Mantener actualizados `API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `ROLES_Y_PERMISOS.md`.
- Changelog: Registrar todo cambio relevante en `CHANGELOG.md` en la sección *Sin publicar*.
- Migraciones: Todo cambio de schema va exclusivamente en una migración nueva en `supabase/migrations/`. Nunca aplicar DDL directo en producción.
- RLS y permisos: RLS habilitado en tablas como defensa en profundidad; el backend usa service role key y aplica scoping explícito por organización. Las funciones de administración corren con actor explícito en transacciones atómicas.

## Cómo correr localmente
- Producción local o desarrollo con Supabase remoto:
  `cd backend && npm install && npm run dev` (requiere `backend/.env` configurado con `SUPABASE_URL`, `SUPABASE_KEY` y `SUPABASE_SERVICE_ROLE_KEY`).
- Entorno local completo con Supabase Docker y Mailpit:
  1. `npx supabase start`
  2. Copiar `backend/.env.local.example` a `backend/.env.local` y completarlo con las keys de `npx supabase status`.
  3. `cd backend && npm run dev:local`
  4. Abrir `http://localhost:3000`.

## Estado actual
- Último commit: `1112d1b base > solicitudes: registro abierto con aprobación`
- Funcionalidad reciente: Desmarcar presente (`DELETE /api/attendance/unmark`) implementado por Codex, con confirmación en UI, toggle en ficha individual y lista rápida. Commit local `a41be2c`.
- Pendiente: Probar en vivo (falta `backend/.env` con credenciales de Supabase) y pushear.

## Reglas para agentes
- Antes de tocar cualquier cosa, correr `Get-Location` y `git status`. Confirmar que estás en la raíz del repo (donde está el `.git`), NO en la carpeta padre `IT/`.
- Antes de modificar un archivo, mostrar el diff propuesto. Aplicar solo después de aprobación explícita del usuario.
- No usar scripts de reemplazo masivo (`String.replace`, `sed`) sin revisar cada match. Preferir ediciones puntuales.
- Leer `docs/API.md` antes de agregar endpoints.
- No tocar schema sin migración en `supabase/migrations/`.
- No tocar RLS sin actualizar `docs/ROLES_Y_PERMISOS.md`.
- Actualizar `CHANGELOG.md` y `docs/API.md` en cada cambio relevante.
- No commitear `backend/.env` ni claves.
- Mostrar el diff antes de aplicar cambios grandes.
- `AGENTS.md` y `CLAUDE.md` deben tener siempre el mismo contenido. Todo cambio en uno se replica en el otro en el mismo commit.