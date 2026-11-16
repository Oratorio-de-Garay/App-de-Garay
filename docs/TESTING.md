# Tests y verificaciones

| Nivel | Herramienta | Dónde viven | Necesita la base local | Comando |
|---|---|---|---|---|
| Base de datos | pgTAP | `supabase/tests/*.test.sql` | Sí | `npx supabase test db` |
| Unitarios | Vitest | `*.test.ts` junto al código | No | `npm test` |
| Integración (API) | Vitest | `apps/api/test/*.integration.test.ts` | Sí | `npm run test:integration` |
| Punta a punta | Playwright | `e2e/*.spec.ts` | Sí | `npm run e2e` |

Antes de pedir revisión de un cambio: `npm run check` (lint, formato, tipos y
unitarios) y, si tocaste algo que se ve en pantalla o un endpoint, `npm run e2e`.

## Qué va en cada nivel

- **pgTAP:** reglas que viven en SQL (permisos, scope por organización,
  auditoría, stock). Si la regla está en una función de la base, se prueba ahí.
- **Unitarios:** funciones puras y componentes sueltos. Rápidos, sin red. Los
  del frontend (`apps/web/src/**/*.test.ts[x]`) corren en jsdom con Testing
  Library; la lógica que se pueda sacar de un componente a una función pura
  (como `features/buffet/carrito.ts`) se prueba ahí, que es más simple.
- **Integración:** un endpoint contra la base real: autenticación, validación,
  códigos de estado y forma de la respuesta.
- **Punta a punta:** los recorridos que hace una persona. Pocos y valiosos:
  cada uno cuesta segundos y se rompe si cambia la interfaz.

## Integración (API)

Los tests le hablan a la app **en memoria** (`app.request()`, sin puerto ni
servidor) con tokens reales de Supabase y contra la base local.

- `apps/api/test/ayudas.ts` tiene `pedir(metodo, ruta, { como, org, body })`:
  `como` es el mail del usuario que hace el pedido y `org` la organización
  activa.
- Lo que crean lleva la marca `ITEST` y se borra en el `afterAll` de cada
  archivo (`limpiar()`).
- Corren de a un archivo por vez porque comparten la base.
- Para un endpoint nuevo: probá el caso feliz, la validación (400), que otra
  organización no lo vea (404) y que el rol equivocado no entre (403).

## Punta a punta (Playwright)

Requisitos: `npx supabase start` y `backend/.env.local` completo (ver
[`DESARROLLO_LOCAL.md`](DESARROLLO_LOCAL.md)). La primera vez:
`npx playwright install chromium`.

- Playwright levanta su propio servidor en el puerto **3100** (`E2E_PORT`), así
  que no choca con el `npm run dev` que tengas abierto en el 3000.
- **Sólo corren contra la base local:** `e2e/support/entorno.ts` corta la
  ejecución si `SUPABASE_URL` no es `localhost` o `127.0.0.1`.
- Los usuarios son los de `supabase/seed.sql`: `admin@local.test`,
  `miembro@local.test` y `nuevo@local.test`.
- Todo lo que crean los tests lleva la marca `E2E` y se borra al terminar
  (`e2e/support/limpieza.ts`). El resto de tus datos locales no se toca.
- Corren en serie (un worker) porque comparten la base.

### Cómo escribir uno nuevo

1. Los selectores van en `e2e/pages/app.ts`, no en el spec. El spec describe
   lo que hace la persona; el objeto de página sabe cómo está armado el HTML.
2. Buscá los elementos por rol y texto visible (`getByRole`, `getByLabel`),
   no por clases ni ids.
3. Empezá con `iniciarSesion(page, USUARIOS.admin)`: deja una sesión real sin
   pasar por la pantalla de login. El login por pantalla ya está probado en
   `auth.spec.ts`; repetirlo en cada test es lento y Auth limita un código por
   segundo por mail.
4. Nombrá con la marca lo que crees: `MARCA` + `marcaUnica()`.
5. Un test etiquetado `@celular` en el título corre además en viewport móvil.

### Capturas para revisar el diseño

`npm run capturas` recorre todas las pantallas en escritorio (1280×800) y
celular (390×844) y deja una imagen de cada una en `test-results/capturas/`.
No verifica nada: sirve para mirar cómo quedó un cambio visual sin recorrer la
app a mano. Usalo después de tocar estilos o componentes compartidos.

### Si falla

`npx playwright show-trace test-results/<carpeta>/trace.zip` muestra paso a
paso lo que pasó, con capturas. En CI el reporte queda como artefacto del job.

## Integración continua

`.github/workflows/app.yml` corre en cada PR:

1. **calidad:** lint, formato, tipos y unitarios.
2. **integracion-y-e2e:** levanta Supabase dentro del runner, aplica
   migraciones y seed, y corre los tests de integración y Playwright.

`.github/workflows/base-de-datos.yml` (pgTAP) sigue corriendo cuando cambia
`supabase/**`.
