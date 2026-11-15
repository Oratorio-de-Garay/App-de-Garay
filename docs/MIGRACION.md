# Bitácora de la migración a React + Vite + Hono

El porqué de cada decisión está en [`adr/0001-migracion-framework.md`](adr/0001-migracion-framework.md).
Acá queda **qué se hizo en cada fase, cómo se verificó y qué quedó pendiente**.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Rama, ADR y tests e2e de caracterización sobre la app actual | Hecha |
| 1 | Monorepo, TypeScript, lint, tests unitarios y CI | Pendiente |
| 2 | Backend a Hono con el mismo contrato HTTP | Pendiente |
| 3 | Frontend a React + Tailwind + shadcn/ui | Pendiente |
| 4 | Despliegue, limpieza del código viejo y documentación | Pendiente |

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
