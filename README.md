# Registro de ingreso · Oratorio

App para registrar el ingreso/asistencia de los chicos del oratorio desde el celular: buscar, marcar presente, dar de alta, editar ficha y ver historial de asistencias.

Stack: **Express (Node.js)** + **Supabase (Postgres + Auth)**, desplegado como un único proyecto en **Vercel**. Frontend en HTML/CSS/JS vanilla, sin build step. Login con Google restringido a una allowlist de emails.

## Documentación

Para entender el proyecto en profundidad (arquitectura, base de datos, API, cómo correrlo y desplegarlo), empezar por:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — cómo está armado, patrones usados, deuda técnica a tener en cuenta.
- **[docs/DATABASE.md](docs/DATABASE.md)** — schema, relaciones, RLS.
- **[docs/API.md](docs/API.md)** — referencia de endpoints.
- **[docs/SETUP.md](docs/SETUP.md)** — variables de entorno, desarrollo local, deploy, configuración de auth.
- [docs/legacy/](docs/legacy/) — documentación de la versión anterior en Google Apps Script + Sheets (histórica).

## Quick start

```bash
cd backend
npm install
npm run dev
```

Abrir `http://localhost:3000` (el mismo servidor sirve la API y el frontend). Requiere un `backend/.env` con las credenciales de Supabase — ver [docs/SETUP.md](docs/SETUP.md).

## Licencia

MIT
