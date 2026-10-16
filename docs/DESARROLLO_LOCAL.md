# Correr el proyecto en local

Guía paso a paso para levantar la app completa en tu computadora **sin tocar producción**: base de datos, login y mails, todo local.

Al terminar vas a tener:

| Qué | Dónde |
|---|---|
| La app (frontend + API) | <http://localhost:3000> |
| Mailpit: los mails que manda la app | <http://127.0.0.1:54324> |
| Postgres: ver y editar los datos (ver [Ver los datos](#ver-los-datos)) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Para variables de entorno de producción, deploy y configuración de Google, ver [SETUP.md](SETUP.md).

---

## 1. Requisitos

Hacen falta tres programas. Se instalan una sola vez:

| Programa | Para qué | Versión |
|---|---|---|
| **Git** | Bajar el código | cualquiera reciente |
| **Node.js** (trae `npm` y `npx`) | Correr el backend y el CLI de Supabase | **20.6 o más nueva**; recomendada, la LTS |
| **Docker Desktop** | Correr Supabase local (Postgres, Auth, Mailpit) en contenedores | reciente |

**No hace falta instalar:**

- **Supabase CLI:** se usa con `npx supabase ...`, que lo descarga solo.
- **Postgres:** corre adentro de Docker.
- **Un servidor de mails:** Mailpit viene con Supabase local.

**La PC:**

- Conviene tener **8 GB de RAM o más**: Docker Desktop y sus contenedores corren en una máquina virtual.
- Hacen falta **unos 3 GB libres** de disco: Docker Desktop, más unos 2,2 GB para las imágenes de Supabase (ver [Servicios](#servicios-de-supabase-que-se-levantan)).
- Hace falta **internet**:
  - la primera vez, para bajar todo;
  - mientras usás la app, porque el frontend carga `supabase-js` desde un CDN.

Seguí la sección de tu sistema operativo y después [comprobá que esté todo](#14-comprobar-que-está-todo).

### 1.1 Windows

Necesitás **Windows 10 (22H2 o más nuevo) o Windows 11, de 64 bits**, y un usuario con permisos de **administrador** para instalar.

Los comandos `winget` de abajo se corren en **PowerShell**. Para abrirlo: tecla Windows → escribir "PowerShell" → Enter. `winget` ya viene con Windows 10 y 11. Si alguno falla, cada paso tiene también el instalador para bajar desde la web.

**1. Git**

```powershell
winget install --id Git.Git -e
```

O bajá el instalador de <https://git-scm.com/download/win> y aceptá las opciones por defecto. También instala **Git Bash**, una terminal donde funcionan los comandos `bash` de esta guía.

**2. Node.js**

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

O bajá el instalador **LTS** (`.msi`) de <https://nodejs.org> y aceptá las opciones por defecto. Si te ofrece la casilla "Tools for Native Modules" / Chocolatey, no hace falta tildarla.

**3. Habilitar la virtualización y WSL2** (Docker los necesita)

1. Fijate que la virtualización esté activada: Administrador de tareas (Ctrl+Shift+Esc) → **Rendimiento** → **CPU** → abajo a la derecha tiene que decir **Virtualización: Habilitado**.
   - Si dice *Deshabilitado*, hay que activarla en el BIOS/UEFI de la PC. Reiniciá, entrá al BIOS (suele ser F2, F10, Supr o Esc al prender) y activá la opción *Intel Virtualization Technology (VT-x)* o *SVM Mode* (AMD). El nombre exacto depende del fabricante.
2. Abrí PowerShell **como administrador**: clic derecho en PowerShell → *Ejecutar como administrador*.
3. Instalá WSL2:

   ```powershell
   wsl --install --no-distribution
   ```

4. **Reiniciá la PC.**

**4. Docker Desktop**

```powershell
winget install --id Docker.DockerDesktop -e
```

O bajá **Docker Desktop for Windows** de <https://docs.docker.com/desktop/setup/install/windows-install/>: elegí *x86_64*, o *ARM64* si tu PC es ARM (ej: Snapdragon).

1. En el instalador, dejá tildado **"Use WSL 2 instead of Hyper-V"**.
2. Al terminar, **cerrá sesión en Windows o reiniciá**: lo pide para sumar tu usuario al grupo `docker-users`.
3. Abrí **Docker Desktop** desde el menú Inicio.
   - Aceptá los términos.
   - Podés saltear el inicio de sesión ("Skip" / "Continue without signing in"): no hace falta una cuenta de Docker.
4. Esperá a que abajo a la izquierda diga **Engine running**, en verde.
5. Recomendado: Settings → General → tildar **"Start Docker Desktop when you sign in to your computer"**. Así no te olvidás de abrirlo.

Si Docker Desktop dice "Resource saver mode", está bien: se despierta solo cuando lo usás.

**5. Cerrá y volvé a abrir la terminal.** Las terminales que ya estaban abiertas no ven los programas recién instalados.

**6. Permitir `npm` en PowerShell.** Si al correr `npm` o `npx` aparece *"la ejecución de scripts está deshabilitada en este sistema"*, corré una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

y abrí una terminal nueva. Otras opciones: usar `npm.cmd` / `npx.cmd`, o trabajar en Git Bash.

### 1.2 macOS

Necesitás **macOS 13 (Ventura) o más nuevo** para la versión actual de Docker Desktop. Los comandos van en la app **Terminal**: Cmd+Espacio → escribir "Terminal" → Enter.

**1. Git**

```bash
xcode-select --install
```

Se abre una ventana: elegí **Instalar**. Instala Git junto con otras herramientas de desarrollo de Apple. Si dice que ya están instaladas, no tenés que hacer nada más.

**2. Node.js**

Bajá el instalador **LTS** para macOS (`.pkg`) de <https://nodejs.org> y seguí los pasos.

Si usás [Homebrew](https://brew.sh), alternativa: `brew install node`.

**3. Docker Desktop**

1. Fijate qué procesador tiene tu Mac:  → **Acerca de esta Mac**.
   - **Chip Apple** (M1, M2, M3, …) → versión *Apple Silicon*.
   - **Procesador Intel** → versión *Intel chip*.
2. Bajá esa versión de **Docker Desktop for Mac** desde <https://docs.docker.com/desktop/setup/install/mac-install/>.
3. Abrí el `.dmg` y arrastrá **Docker** a **Aplicaciones**.
4. Abrí Docker desde Aplicaciones.
   - Aceptá los términos.
   - Usá la configuración recomendada ("Use recommended settings"). Te va a pedir la contraseña de tu usuario de la Mac.
   - El inicio de sesión en Docker se puede saltear.
5. Esperá a que diga **Engine running**. El ícono de la ballena en la barra de arriba deja de moverse.
6. Recomendado: Settings → General → tildar **"Start Docker Desktop when you sign in to your computer"**.

**4. Cerrá y volvé a abrir la Terminal.**

### 1.3 Linux

En Linux no hace falta Docker Desktop: alcanza con **Docker Engine**.

1. **Git:** `sudo apt install git` (Debian/Ubuntu), o el equivalente de tu distribución.
2. **Node.js:** la versión de `apt` suele ser vieja. Instalalo con [nvm](https://github.com/nvm-sh/nvm):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   # cerrar y volver a abrir la terminal
   nvm install --lts
   ```

3. **Docker Engine:** seguí la guía de tu distribución en <https://docs.docker.com/engine/install/>. Después sumá tu usuario al grupo `docker`, para no necesitar `sudo`:

   ```bash
   sudo usermod -aG docker $USER
   ```

   y **cerrá sesión y volvé a entrar**.

### 1.4 Comprobar que está todo

En una terminal nueva:

```bash
git --version             # ej: git version 2.4x...
node --version            # tiene que ser v20.6 o más (ej: v22.x, v24.x)
npm --version             # cualquier número
docker --version          # ej: Docker version 2x...
docker run --rm hello-world
```

- El último comando tiene que imprimir **"Hello from Docker!"**: confirma que Docker está andando, no sólo instalado.
- Si `node --version` muestra algo menor a `v20.6`, actualizá Node: el script `npm run dev` usa `node --env-file`, que antes no existía, y falla con `bad option: --env-file`.
- Si algún comando dice *"no se reconoce"* o *"command not found"*: cerrá y abrí la terminal. Si sigue, reiniciá la PC.
- Si `docker run` dice que no se puede conectar: Docker Desktop no está abierto, o todavía no dice *Engine running*.

**Sobre el CLI de Supabase:**

- La primera vez que corras `npx supabase ...`, npm pregunta `Ok to proceed? (y)`: respondé `y`.
- El CI usa la versión `2.118.0`. Si algo se comporta distinto, probá con `npx supabase@2.118.0 ...`.

**Editor (opcional):** cualquiera sirve; por ejemplo, [Visual Studio Code](https://code.visualstudio.com).

---

## 2. Bajar el proyecto e instalar dependencias

El repositorio es público: para bajarlo no hace falta cuenta de GitHub. Para subir cambios sí: pedí acceso a la organización *Oratorio-de-Garay*.

Elegí una carpeta donde guardarlo, abrí una terminal ahí y corré:

```bash
git clone https://github.com/Oratorio-de-Garay/App-de-Garay.git
cd App-de-Garay
cd backend
npm install
cd ..
```

> **Ojo con las carpetas.** En esta guía:
> - los comandos `npx supabase ...` se corren desde la **raíz del repo** (donde está la carpeta `supabase/`);
> - los comandos `npm ...` se corren desde **`backend/`**.
>
> Corrido desde otra carpeta, `supabase` no encuentra el proyecto y `npm` no encuentra el `package.json`.

---

## 3. Levantar Supabase local

Con Docker Desktop abierto, desde la raíz del repo:

```bash
npx supabase start
```

- **La primera vez tarda unos minutos:** baja 5 imágenes de Docker, unos 450 MB de descarga y 2,1 GB en disco.
- Levanta sólo lo que usa la app: Postgres, Auth, la API y Mailpit (ver [Servicios](#servicios-de-supabase-que-se-levantan)).
- Aplica todas las migraciones de `supabase/migrations/` y carga `supabase/seed.sql` con datos de prueba (ver [Usuarios de prueba](#6-usuarios-de-prueba)).

Al terminar muestra una tabla con URLs y claves de **tu Supabase local**. Si la cerraste, la volvés a ver con `npx supabase status`. Las claves se usan en el paso siguiente.

### Servicios de Supabase que se levantan

Supabase local trae más servicios de los que la app usa. Los que no hacen falta están apagados en [`supabase/config.toml`](../supabase/config.toml), así Docker no baja sus imágenes:

| Servicio | Tamaño en disco | Estado | Por qué |
|---|---|---|---|
| Postgres | 1,7 GB | ✅ prendido | La base |
| Auth (GoTrue) | 90 MB | ✅ prendido | Login con código por mail |
| PostgREST | 30 MB | ✅ prendido | Todas las consultas del backend (`.from()`, `.rpc()`) |
| Kong | 200 MB | ✅ prendido | La puerta de entrada `http://127.0.0.1:54321` que usan backend y frontend |
| Mailpit | 50 MB | ✅ prendido | Recibe los mails |
| Studio + postgres-meta | 2,2 GB | ⛔ apagado | Panel web para ver datos: no lo necesita la app (ver [Ver los datos](#ver-los-datos)) |
| Storage + imgproxy | 1,4 GB | ⛔ apagado | La app no guarda archivos |
| Edge Runtime | 1,1 GB | ⛔ apagado | No hay Edge Functions |
| Logflare + Vector | 1,1 GB | ⛔ apagado | Sólo guardan logs para Studio |
| Realtime | 560 MB | ⛔ apagado | La app no usa suscripciones en vivo |
| Supavisor (pooler) | — | ⛔ apagado | No hace falta en local |

Además, `npx supabase test db` baja la primera vez una imagen chica (`pg_prove`, unos 75 MB) para correr los tests.

`npx supabase status` lista los apagados como *Stopped services*: es lo esperado, no un error.

> Si en el futuro la app empieza a usar uno de los servicios apagados (por ejemplo, subir fotos con Storage), hay que prenderlo en `supabase/config.toml` (`enabled = true` en su sección) y actualizar esta tabla.

### Ver los datos

Sin Studio, hay dos formas de ver y editar la base local:

- **Desde la terminal:**

  ```bash
  docker exec -it supabase_db_app-de-garay psql -U postgres
  ```

  Ejemplo: `select * from public.pibes;`. Se sale con `\q`.

- **Con un cliente gráfico:** cualquier cliente de Postgres sirve, como [DBeaver](https://dbeaver.io), [TablePlus](https://tableplus.com) o la extensión *PostgreSQL* de VS Code. Datos de conexión:

  | Campo | Valor |
  |---|---|
  | Host | `127.0.0.1` |
  | Puerto | `54322` |
  | Usuario | `postgres` |
  | Contraseña | `postgres` |
  | Base | `postgres` |

Si preferís **Studio**, prendelo sólo en tu PC:

1. En `supabase/config.toml`, sección `[studio]`, poné `enabled = true`. **No commitees ese cambio.**
2. Reiniciá Supabase: `npx supabase stop` y después `npx supabase start`. La primera vez baja unos 2,2 GB.
3. Abrí <http://127.0.0.1:54323>.

### Liberar espacio si ya habías bajado todo

Si levantaste Supabase local antes de que estos servicios se apagaran, sus imágenes siguen en tu disco (unos 6 GB). Apagarlos en la configuración no las borra.

Para borrarlas, con Supabase levantado, corré **`docker image prune -a`**: borra las imágenes que no usa ningún contenedor.

> ⚠️ Ese comando afecta a **todos** tus proyectos de Docker, no sólo a este. Si usás Docker para otras cosas, mejor borralas una por una desde Docker Desktop → **Images**: buscá `supabase` y borrá las que no estén *In use*.

---

## 4. Configurar el backend para la base local

### De dónde salen las claves

`SUPABASE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` tienen que ser las claves **de la base local que acabás de levantar**. **No** son las del dashboard de supabase.com ni las de `backend/.env.production`: esas son de producción.

Las genera el propio Supabase local, y se ven con este comando, desde la raíz del repo y con Supabase levantado:

```bash
npx supabase status
```

En la salida, buscá la sección de claves (*Authentication Keys*, o similar según la versión del CLI) y copiá:

| Variable de `.env.local` | Valor en `supabase status` | Empieza con |
|---|---|---|
| `SUPABASE_URL` | **API URL** / **Project URL** (ya viene completa en el ejemplo) | `http://127.0.0.1:54321` |
| `SUPABASE_KEY` | **Publishable** (en versiones viejas del CLI: **anon key**) | `sb_publishable_` (o `eyJ` en versiones viejas) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** (en versiones viejas del CLI: **service_role key**) | `sb_secret_` (o `eyJ` en versiones viejas) |

Si preferís copiarlas en formato de variables:

```bash
npx supabase status -o env
```

Ahí aparecen como `PUBLISHABLE_KEY` → va en `SUPABASE_KEY`, y `SECRET_KEY` → va en `SUPABASE_SERVICE_ROLE_KEY`. En versiones viejas del CLI aparecen como `ANON_KEY` y `SERVICE_ROLE_KEY`.

Sobre estas claves:

- Son **las mismas en todas las PCs** y no cambian entre `supabase stop` / `start` ni con `db reset`. Alcanza con copiarlas una vez.
- Sólo sirven contra el Supabase de tu PC: no dan acceso a producción y no son secretas.
- Si `supabase status` da error, Supabase local no está levantado: volvé al [paso 3](#3-levantar-supabase-local).

### Crear `backend/.env.local`

Copiá el archivo de ejemplo:

```bash
# Git Bash / macOS / Linux
cp backend/.env.local.example backend/.env.local
```

```powershell
# PowerShell
Copy-Item backend/.env.local.example backend/.env.local
```

Abrí `backend/.env.local` y completá las dos claves con los valores locales de la tabla de arriba:

- `SUPABASE_KEY=` con la **Publishable** de `npx supabase status`.
- `SUPABASE_SERVICE_ROLE_KEY=` con la **Secret** de `npx supabase status`.

El resto ya viene con los valores correctos para local. Debería quedar así:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
PORT=3000
SMTP_HOST=127.0.0.1
SMTP_PORT=54325
MAIL_FROM=Oratorio de Garay <no-responder@local.test>
APP_URL=http://localhost:3000
```

Cosas a tener en cuenta:

- `backend/.env.local` está en `.gitignore`: **nunca** se commitea.
- **Nunca** pongas ahí claves de producción.
- `npm run dev` lee **sólo** `backend/.env.local`. Si tenés las claves de producción en `backend/.env.production`, ese archivo lo usa únicamente `npm run dev:prod` (ver [paso 5](#5-levantar-la-app)). Un `backend/.env` no lo lee ningún script.

---

## 5. Levantar la app

Desde `backend/`:

```bash
npm run dev
```

Tiene que decir:

```
API server running on http://localhost:3000
Base de datos: LOCAL (http://127.0.0.1:54321)
```

Se reinicia solo cuando cambiás un archivo del backend. Los cambios del frontend (`frontend/`) se ven recargando la página.

Abrí **<http://localhost:3000>**.

- Usá siempre `localhost:3000`, no `127.0.0.1:3000`: para el navegador son sitios distintos y la sesión de uno no vale en el otro.
- No abras `frontend/index.html` con doble clic ni con otro servidor (Live Server, `http-server`, etc.): el backend es el que sirve el frontend y le pasa la configuración por `/config.js`.

### Correr contra producción (sólo a propósito)

`npm run dev` siempre usa la base local. Para apuntar la app de tu PC a la base de **producción** existe un comando aparte:

```bash
npm run dev:prod   # lee backend/.env.production
```

- `backend/.env.production` lleva las mismas variables que `.env.local`, con los valores de producción (ver [SETUP.md](SETUP.md#variables-de-entorno)). Está en `.gitignore`.
- Con este comando, **todo lo que hagas en la app modifica datos reales**. Para que no pase desapercibido:
  - la terminal muestra `⚠️ Base de datos: PRODUCCIÓN (...)`;
  - la app muestra una franja roja arriba de todo.
- El backend no tiene valores por defecto: si falta alguna variable, no arranca. Nunca va a producción "sin querer".

Para comprobar que el backend responde: <http://localhost:3000/api/health> tiene que devolver `{"status":"ok"}`.

---

## 6. Usuarios de prueba

En local se entra con el **código por mail**:

1. En la pantalla de login elegí **"o con tu mail"** y escribí uno de los mails de abajo.
2. Abrí **Mailpit** (<http://127.0.0.1:54324>): ahí llega el mail con el código de 6 dígitos.
3. Escribí el código en la app.

Ningún mail sale a internet: todos quedan en Mailpit, así que podés usar direcciones inventadas.

| Mail | Qué puede hacer |
|---|---|
| `oratoriogarayy@gmail.com` | **Superadmin**: todo, incluido `admin.html` |
| `admin@local.test` | Admin de *Oratorio de Garay* |
| `miembro@local.test` | Miembro de *Oratorio de Garay* y *Escuadra 3* |
| `nuevo@local.test` | Sin acceso; tiene una solicitud pendiente para *Oratorio de Garay* |
| cualquier otro | Sin acceso; ve la pantalla de registro para pedirlo |

El seed también carga niveles, grados, edades y un pibe de ejemplo por organización.

**El botón de Google no funciona en local.** Es lo esperado: el login con Google necesita credenciales en `[auth.external.google]` de `supabase/config.toml`, y no están cargadas.

---

## 7. Mails en local

Hay dos tipos de mails, y en local los dos van a Mailpit:

- **Códigos de login:** los manda Supabase Auth. No requiere configuración.
- **Avisos de solicitudes** (a los aprobadores cuando hay una nueva, y al solicitante cuando se resuelve): los manda el backend (`backend/api/mail.js`) por SMTP a `127.0.0.1:54325`, gracias a `SMTP_HOST`/`SMTP_PORT` de `.env.local`.

Para probar el circuito completo:

1. Entrá con un mail nuevo (ej: `prueba@local.test`) y mandá una solicitud.
2. En Mailpit aparece el aviso a los aprobadores.
3. Entrá como `admin@local.test` o el superadmin, y aceptala o rechazala desde la pestaña Solicitudes.
4. En Mailpit aparece el aviso al solicitante.

Si un aviso no sale, el panel muestra el motivo (ej: falta `SMTP_HOST`), y la terminal del backend también lo loguea.

---

## 8. Comandos del día a día

Todos desde la raíz del repo, salvo los de `npm`:

| Para | Comando |
|---|---|
| Levantar Supabase local | `npx supabase start` |
| Ver URLs y claves | `npx supabase status` |
| Levantar la app (desde `backend/`) | `npm run dev` |
| Volver la base a cero (migraciones + seed) | `npx supabase db reset --local` |
| Correr los tests de la base (pgTAP) | `npx supabase test db` |
| Apagar Supabase (los datos se conservan) | `npx supabase stop` |
| Apagar y borrar los datos locales | `npx supabase stop --no-backup` |

> ⚠️ **`db reset` siempre con `--local`.** `npx supabase db reset --linked` **borra la base de producción**. Nunca corras comandos con `--linked` salvo que estés siguiendo a propósito [Aplicar migraciones a producción](SETUP.md#aplicar-migraciones-a-producción).

Después de un `db reset`, las sesiones abiertas en el navegador dejan de valer: cerrá sesión y volvé a entrar.

### Si cambiás la base

1. Creá la migración: `npx supabase migration new <nombre>`, y escribí el SQL en el archivo que genera en `supabase/migrations/`.
2. Aplicala desde cero: `npx supabase db reset --local`.
3. Corré los tests: `npx supabase test db`. El CI corre lo mismo en cada PR que toca `supabase/`.
4. Actualizá [DATABASE.md](DATABASE.md) y el [CHANGELOG](../CHANGELOG.md).

---

## 9. Problemas comunes

**Docker Desktop dice "Virtualization support not detected"** (Windows)
La virtualización está apagada en el BIOS: ver el [paso 3 de Windows](#11-windows).

**Docker Desktop dice "WSL needs updating" o "WSL 2 installation is incomplete"** (Windows)
En PowerShell como administrador corré `wsl --update`, reiniciá la PC y volvé a abrir Docker Desktop.

**`winget` no se reconoce** (Windows)
Instalá o actualizá **App Installer** desde Microsoft Store, o usá los instaladores web de cada paso.

**`failed to connect to the docker API` / `Cannot connect to the Docker daemon` / `dockerDesktopLinuxEngine: The system cannot find the file specified`**
Docker Desktop no está corriendo. Abrilo, esperá a que diga *Engine running* y volvé a probar.

**Docker Desktop no arranca, con un error tipo `rename ...sock ...sock.stale: The file cannot be accessed by the system`** (Windows)
Quedaron sockets viejos de un cierre brusco. Con Docker Desktop cerrado, en PowerShell:

```powershell
Rename-Item "$env:LOCALAPPDATA\Docker\run" "run.stale-$(Get-Date -Format yyyyMMddHHmm)"
Rename-Item "$env:LOCALAPPDATA\docker-secrets-engine" "docker-secrets-engine.stale-$(Get-Date -Format yyyyMMddHHmm)"
```

(Si alguna de las dos carpetas no existe, ignorá ese error.) Después abrí Docker Desktop de nuevo: recrea las carpetas solo. Si sigue pasando, actualizá Docker Desktop.

**`supabase start` falla con `bind: An attempt was made to access a socket in a way forbidden by its access permissions`** (Windows)
Windows reservó el rango de puertos que usa Supabase (54320–54329). Para comprobarlo: `netsh interface ipv4 show excludedportrange protocol=tcp`. Se libera en **PowerShell como administrador**:

```powershell
net stop winnat
net start winnat
```

y volvé a correr `npx supabase start`.

**`port is already allocated` / `address already in use`**
Otro proyecto de Supabase (u otro programa) ya está usando esos puertos. Apagalo (`npx supabase stop --project-id <otro>` o desde Docker Desktop) y volvé a probar. Si es el puerto 3000, cerrá el otro servidor o cambiá `PORT` y `APP_URL` en `.env.local`.

**`supabase start` dice que ya está corriendo**
Está bien: ya estaba levantado. Usá `npx supabase status` para ver las claves.

**`npm run dev` falla con `.env.local: not found`**
Falta `backend/.env.local`: crealo (paso 4). Ojo que tiene que estar dentro de `backend/`, no en la raíz del repo.

**El backend no arranca: `Faltan variables de entorno: ...`**
A `backend/.env.local` le falta alguna de las variables que nombra el error: completala (paso 4).

**El login o la API fallan con `Invalid API key`, `invalid JWT` o `401` apenas arrancás**
Alguna clave de `backend/.env.local` no es la de tu Supabase local; por ejemplo, copiaste una de producción. Volvé a copiarlas de `npx supabase status` (paso 4) y reiniciá `npm run dev`.

**La terminal dice `Base de datos: PRODUCCIÓN` o la app muestra la franja roja**
Estás contra la base real. Cortá el server (Ctrl+C). Si fue con `npm run dev`, el `SUPABASE_URL` de `backend/.env.local` no es `http://127.0.0.1:54321`: corregilo.

**`bad option: --env-file`**
Tu Node es anterior a 20.6. Actualizalo.

**`Cannot find module 'express'` (o cualquier otro paquete)**
Falta `npm install` dentro de `backend/`.

**Pide el código pero no llega nada a Mailpit**
- Fijate que estés en <http://127.0.0.1:54324> y que Supabase siga levantado (`npx supabase status`).
- Si la pantalla del código **no** menciona Mailpit, la app está apuntando a producción: ver el problema anterior a este.

**El código llega pero la app dice que no tenés acceso**
Es lo que ve cualquier mail que no está dado de alta. Usá uno de los [usuarios de prueba](#6-usuarios-de-prueba), o aceptá la solicitud desde otra cuenta.

**Errores raros después de `db reset` (`invalid JWT`, `user not found`, quedarse cargando)**
La sesión del navegador era de la base anterior. Cerrá sesión; si no se puede, borrá los datos del sitio (DevTools → Application → Storage → *Clear site data*) y recargá.

**La página carga pero no hace nada, con `supabase is not defined` en la consola**
El navegador no pudo bajar `supabase-js` del CDN (`cdn.jsdelivr.net`). Revisá la conexión a internet o un bloqueador.
