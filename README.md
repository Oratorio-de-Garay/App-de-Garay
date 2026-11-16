# Registro de ingreso · Oratorio

App para registrar el ingreso/asistencia de los chicos del oratorio desde el celular (buscar, marcar presente, dar de alta, editar ficha, ver el historial), llevar el buffet (productos, eventos y ventas) y administrar usuarios y permisos por organización.

**Stack:** React + Vite + TypeScript en el frontend, Hono en la API y Supabase (Postgres + Auth) como base, todo en un solo repositorio y desplegado como un único proyecto en Vercel. Login con Google o con un código por mail; el acceso lo aprueban los administradores de cada organización.

## Documentación

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — cómo está armado, convenciones y pendientes.
- **[docs/DESARROLLO_LOCAL.md](docs/DESARROLLO_LOCAL.md)** — cómo correr todo en local (base, login y mails), paso a paso.
- **[docs/TESTING.md](docs/TESTING.md)** — qué se prueba en cada nivel y cómo escribir un test.
- **[docs/API.md](docs/API.md)** — referencia de endpoints.
- **[docs/DATABASE.md](docs/DATABASE.md)** — schema, relaciones, RLS.
- **[docs/ROLES_Y_PERMISOS.md](docs/ROLES_Y_PERMISOS.md)** — roles, permisos por organización, auditoría.
- **[docs/SETUP.md](docs/SETUP.md)** — variables de entorno, deploy, configuración de auth y mails en producción.
- **[docs/adr/](docs/adr/)** y **[docs/MIGRACION.md](docs/MIGRACION.md)** — por qué se eligió este stack y cómo se migró.
- **[CHANGELOG.md](CHANGELOG.md)** — registro de cambios.
- [docs/legacy/](docs/legacy/) — documentación de la primera versión en Google Apps Script + Sheets (histórica).

## Quick start

Con Node 22.12+ y Docker Desktop corriendo, desde la raíz del repo:

```bash
npx supabase start                   # base, auth y Mailpit locales
cp .env.local.example .env.local     # y completar las claves de `npx supabase status`
npm install
npm run dev                          # siempre contra la base local
```

Abrir `http://localhost:3000`. Los mails (incluido el código para entrar) llegan a Mailpit (`http://127.0.0.1:54324`). Paso a paso, usuarios de prueba y problemas comunes en [docs/DESARROLLO_LOCAL.md](docs/DESARROLLO_LOCAL.md).

Antes de subir un cambio:

```bash
npm run check    # lint, formato, tipos y tests unitarios
npm run e2e      # recorridos completos en un navegador
```

## Licencia

MIT
