# ADR 0001 — Migración a React + Vite + Hono (monolito modular con TypeScript)

- **Estado:** aceptada (2026-11-15)
- **Rama:** `feat/migracion-framework`
- **Bitácora del proceso:** [`docs/MIGRACION.md`](../MIGRACION.md)

## Contexto

La app nació como un monolito mínimo: Express en un archivo, frontend en HTML/JS
sin build, pensada para que la mantuvieran voluntarios. Hoy crece rápido y la
desarrollan sobre todo agentes de IA. El análisis del código (noviembre 2026)
encontró:

| Área | Estado |
|---|---|
| Backend | `backend/api/index.js` de 1.944 líneas con ~55 endpoints; validación manual; tres estilos distintos de manejo de errores; CRUD de buffet, mapeo de pibe y rango de día UTC copiados varias veces |
| Frontend | ~9.400 líneas en tres páginas HTML que recargan todo al navegar; header, modales, helpers de API y `escapeHtml` (5 copias) duplicados; render por `innerHTML` con un XSS real (nombre del pibe sin escapar en `mostrarMensaje`) |
| Rendimiento | Cada navegación vuelve a bajar supabase-js y a llamar `/api/auth/me`; `/config.js` pasa por la función en cada carga; buffet vuelve a pedir 6 endpoints después de cada guardado; JS sin minificar |
| Calidad | Sin TypeScript, linter ni tests de backend o frontend; sólo pgTAP para las funciones SQL; lockfile sin versionar |

Prioridades pedidas: **mejor rendimiento**, **reutilización de código** y
**velocidad de desarrollo**, siempre en **planes gratuitos**.

## Decisión

| Tema | Decisión |
|---|---|
| Arquitectura | **Monolito modular**: un repo (npm workspaces), un deploy, mismo origen |
| Frontend | React 19 + Vite + TypeScript, TanStack Router y TanStack Query |
| Interfaz | Tailwind CSS v4 + shadcn/ui, con la paleta verde actual como tokens |
| Backend | Hono + Zod en TypeScript, runtime Node, una sola función en Vercel |
| Base de datos | Supabase (Postgres, funciones SQL, RLS) sin cambios de schema |
| Autenticación | Supabase Auth como hoy: Google OAuth y código por mail, Bearer + `X-Organization-Id` |
| Despliegue | Vercel Hobby, región `gru1`, mismo proyecto reconfigurado |
| Tests | Vitest (unitarios e integración), Testing Library, Playwright (e2e), pgTAP |

## Por qué

### ¿Se mantiene el monolito? Sí

Es un solo dominio, un equipo chico y un tráfico bajo. Separar frontend y
backend en dos servicios sumaría CORS, dos despliegues, versionado de la API y
dos sets de variables, sin resolver ningún problema que tengamos. Lo que
faltaba no era separar sino **ordenar**: módulos por dominio, tipos
compartidos y límites claros dentro del mismo repo.

### Frontend: SPA en React, no SSR

- **React** es el ecosistema que mejor conocen los agentes y el que más
  componentes reutilizables tiene (shadcn/ui, TanStack).
- **Vite** da build minificado y dividido por pantalla, y recarga instantánea
  en desarrollo.
- **TanStack Query** reemplaza el "recargar todo después de guardar" por
  caché con invalidación puntual; **TanStack Router** da rutas tipadas y
  navegación sin recargar la página.
- **Sin SSR (Next.js descartado):** toda la app está detrás de login y cada
  respuesta depende del usuario y la organización, así que nada se puede
  cachear en el CDN. SSR obligaría a pasar la sesión de `localStorage` a
  cookies (tocando el flujo de Google y del código por mail), sumaría
  arranques en frío en cada pantalla y exigiría reescribir los endpoints al
  formato de Next. La ganancia —un viaje menos en la primera carga con la
  función caliente— se compensa guardando en el dispositivo los últimos datos
  vistos. No es una cuestión de límites del plan gratuito: el uso estimado
  está varios órdenes de magnitud por debajo.

### Interfaz: Tailwind + shadcn/ui

Se rediseña buscando una interfaz más armoniosa y moderna. shadcn/ui aporta
componentes accesibles ya resueltos (diálogos, tablas, formularios, menús) que
viven en el repo y se pueden adaptar; Tailwind elimina los ~134 colores
sueltos y los cuatro CSS escritos a mano a favor de tokens de diseño únicos.
Para un agente, armar una pantalla pasa a ser componer piezas existentes.

### Backend: Hono + Zod

- **Mismo contrato HTTP:** las rutas y la forma de las respuestas no cambian.
- **Zod** reemplaza la validación manual y los mismos esquemas se comparten
  con los formularios del frontend.
- **Cliente tipado** (`hono/client`): el frontend conoce rutas, parámetros y
  respuestas sin generar código.
- **Liviano** en arranque en frío y **testeable** sin levantar un servidor
  (`app.request()`).
- Se descartó dejar Express: funcionaba, pero no da tipos de punta a punta, y
  el archivo único había que reescribirlo por módulos de todas formas.

### Base, autenticación y despliegue: se mantienen

- **Supabase:** la lógica crítica (permisos, auditoría, ventas, solicitudes)
  ya vive en funciones SQL probadas con pgTAP. Cambiar de base sería tirar lo
  más sólido del proyecto.
- **Supabase Auth:** funciona, es gratis y es lo más delicado de mover.
- **Vercel:** sirve la SPA desde su CDN y la API como una función en `gru1`,
  al lado de la base (`sa-east-1`). Se reemplaza la configuración `builds`
  legacy por la moderna, lo que obliga a cambiar el *Root Directory* del
  proyecto (ver `docs/SETUP.md`).

### TypeScript

`docs/ARCHITECTURE.md` decía que no usar TypeScript era intencional para
voluntarios sin experiencia. Con agentes escribiendo la mayor parte del
código la cuenta cambia: los tipos son la forma más barata de que un agente
detecte solo que rompió algo.

## Consecuencias

**A favor**
- Navegación sin recargas, datos en caché, JS minificado y dividido.
- Un solo lugar para cada cosa: validación, errores, tabla, diálogo, cliente
  de API.
- Tests en tres niveles y CI que los corre en cada PR.
- El XSS por `innerHTML` desaparece: React escapa por defecto.

**En contra**
- Aparece un paso de build y más dependencias que mantener al día.
- La interfaz cambia para quienes ya la usan.
- Hay un corte manual en Vercel al publicar (cambio de *Root Directory*).
- Quien quiera contribuir necesita saber React y TypeScript.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Next.js (App Router, SSR) | Ver "sin SSR": costo alto en auth y reescritura para una ganancia chica |
| React + Vite manteniendo Express | Menos trabajo, pero sin tipos de punta a punta |
| SvelteKit / Nuxt | Buenos frameworks, con menos componentes listos y menos soltura de los agentes |
| Seguir en vanilla ordenando el código | No resuelve recargas, duplicación ni falta de tipos |
| Separar en dos servicios | Complejidad operativa sin beneficio a esta escala |
