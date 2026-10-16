# Registro de ingreso · Oratorio

App para registrar el ingreso/asistencia de los chicos del oratorio desde el celular: buscar, marcar presente, dar de alta, editar ficha y ver historial de asistencias.

Stack: **Express (Node.js)** + **Supabase (Postgres + Auth)**, desplegado como un único proyecto en **Vercel**. Frontend en HTML/CSS/JS vanilla, sin build step. Login con Google restringido a los emails que dan de alta los administradores desde el panel de administración (roles `admin` por organización y `superadmin`).

## Documentación

Para entender el proyecto en profundidad (arquitectura, base de datos, API, cómo correrlo y desplegarlo), empezar por:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — cómo está armado, patrones usados, deuda técnica a tener en cuenta.
- **[docs/DATABASE.md](docs/DATABASE.md)** — schema, relaciones, RLS.
- **[docs/ROLES_Y_PERMISOS.md](docs/ROLES_Y_PERMISOS.md)** — roles, permisos por organización, auditoría.
- **[docs/API.md](docs/API.md)** — referencia de endpoints.
- **[docs/DESARROLLO_LOCAL.md](docs/DESARROLLO_LOCAL.md)** — cómo correr todo en local (base, login y mails), paso a paso.
- **[docs/SETUP.md](docs/SETUP.md)** — variables de entorno, deploy, configuración de auth y mails en producción.
- **[CHANGELOG.md](CHANGELOG.md)** — registro de cambios.
- [docs/legacy/](docs/legacy/) — documentación de la versión anterior en Google Apps Script + Sheets (histórica).

## Quick start

Con Node 20.6+ y Docker Desktop corriendo:

```bash
npx supabase start                                  # base, auth y Mailpit locales
cp backend/.env.local.example backend/.env.local    # y completar las claves de `npx supabase status`
cd backend
npm install
npm run dev                                         # siempre contra la base local
```

Abrir `http://localhost:3000` (el mismo servidor sirve la API y el frontend). Los mails llegan a Mailpit (`http://127.0.0.1:54324`). Paso a paso, usuarios de prueba y problemas comunes en [docs/DESARROLLO_LOCAL.md](docs/DESARROLLO_LOCAL.md).

## Licencia

MIT
