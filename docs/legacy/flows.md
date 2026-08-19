> ⚠️ **Histórico / desactualizado.** Describe la versión original en Google Apps Script + Google Sheets, previa a la migración a Supabase + Express + Vercel. Se conserva sólo como contexto de negocio. Para el estado actual ver [../ARCHITECTURE.md](../ARCHITECTURE.md), [../DATABASE.md](../DATABASE.md) y [../API.md](../API.md).

# Flujo completo de funcionalidades — Registro de ingreso

## Arquitectura general

La aplicación está dividida en dos partes:

| Componente | Responsabilidad |
|---|---|
| `index.html` | Interfaz visual, renderizado, UX y llamadas HTTP |
| `codigo.gs` | Backend API en Google Apps Script y persistencia en Google Sheets |

La comunicación entre ambas partes se realiza mediante requests HTTP usando `fetch()`.

---

# Flujo general de la aplicación

## 1. Apertura de la página

Cuando el usuario abre `index.html`:

1. Se carga el HTML.
2. Se aplican los estilos CSS embebidos.
3. Se ejecuta `init()`.

---

## 2. Inicialización (`init()`)

La función:

```js
init()
```

realiza:

2.1 Generación de fecha actual
Obtiene la fecha del dispositivo.
Calcula:
día
número
mes abreviado
Inserta el texto en:
<div id="fecha-hoy"></div>

Ejemplo:

viernes 15 may
2.2 Listener de Enter

Agrega:

keydown

al input de búsqueda.

Si el usuario presiona:

Enter

se ejecuta:

buscar()
FEATURE: Buscar chico/a
Objetivo

Encontrar rápidamente un chico usando apellido o parte del nombre.

Flujo completo
Frontend
1. Usuario escribe apellido

    Campo:

    ```<input id="input-apellido">```

    Ejemplo:

    Perez

2. Usuario toca “Buscar”

    Se ejecuta:

    ```buscar()```

3. Validación inicial

    La función:

    Obtiene el texto.
    Ejecuta ```trim()```.
    Si queda vacío:
    corta ejecución
    no hace request

4. Preparación visual

    Antes del request:

    ```setBtnCargando(true)```

    Esto:

    deshabilita botón
    muestra spinner
    evita doble click

    También:

    ```limpiarContenido()```

    elimina resultados anteriores.

5. Request HTTP

    Se ejecuta:

    ```fetch(`${urlScript}?action=buscar&apellido=...`)```

    Método:

    GET

    Ejemplo:

    ?action=buscar&apellido=perez
    Backend

6. Entrada al Apps Script

    Google Apps Script ejecuta:

    ```doGet(e)```

7. Router principal

    ```doGet()``` llama:

    ```manejar(e.parameter, null)```

8. Resolución de acción

    ```manejar()``` evalúa:

    ```action === "buscar"```

    y ejecuta:

    ```buscar(params.apellido)```

9. Lectura de hoja Pibes

    La función:

    ```buscar(termino)```

    abre:

    Hoja: Pibes

    y obtiene todos los registros:

    ```sheet.getDataRange().getValues()```

10. Recorrido de filas

    Se recorren filas desde:

    FILA_DATOS = 3

11. Comparación de nombres

    Cada registro evalúa:

    ```nombre.toLowerCase().includes(t)```

    Características:

    case insensitive
    búsqueda parcial
    sirve para:
    apellido
    nombre
    fragmentos

12. Construcción del resultado

Por cada coincidencia se arma:

{
  fila,
  id,
  nombre,
  grado,
  ficha,
  edad,
  obs,
  visitas
}
FEATURE: Contar visitas
Objetivo

Mostrar cuántas asistencias tiene el chico.

<hr/>
<h3>Flujo</h3>

1. Abrir hoja Presentes

    La función:

    contarVisitas(nombre)

    abre:

    Hoja: Presentes

2. Buscar fila del chico

    Comparación:

    String(data[i][0]).toLowerCase().trim() === n

3. Contar asistencias

    Se cuentan columnas con:

    x

    excepto la primera columna.

4. Resultado

    Ejemplo:

    7 visitas
    Retorno al frontend

13. Apps Script responde JSON

    Ejemplo:

    [
    {
        "nombre": "Juan Perez",
        "grado": "4°",
        "ficha": "Sí",
        "edad": "Grandes",
        "obs": "",
        "visitas": 7
    }
    ]

14. Frontend interpreta resultados
    Caso A — Sin resultados

    Ejecuta:

    mostrarNuevoChico()
    Caso B — Un resultado

    Ejecuta:

    mostrarResultado()
    Caso C — Múltiples resultados

    Ejecuta:

    mostrarMultiples()
    FEATURE: Mostrar un resultado
    Objetivo

    Renderizar tarjeta completa del chico.

Flujo
1. Guardar contexto actual

Variables globales:

filaActual
nombreActual
2. Generar avatar

Se calculan iniciales.

Ejemplo:

Juan Perez → JP
3. Detectar estado de ficha

Se interpreta como válido:

Sí
Si
sí
si
4. Renderizar tarjeta

La tarjeta incluye:

avatar
nombre
grado
categoría
estado ficha
visitas
observaciones
5. Render dinámico

Se inserta HTML usando:

agregarHTML(html)
FEATURE: Mostrar múltiples coincidencias
Objetivo

Permitir elegir el registro correcto.

Flujo
1. Crear lista visual

Cada item muestra:

avatar
nombre
grado
categoría
2. Click sobre un resultado

Cada item ejecuta:

seleccionarChico(...)
3. Re-render

La función:

limpia contenido
muestra tarjeta final
FEATURE: Alta de nuevo chico
Objetivo

Crear un nuevo registro inexistente.

Frontend
1. Sin coincidencias

Se ejecuta:

mostrarNuevoChico()
2. Render del formulario

Campos:

Campo	Tipo
Nombre	text
Grado	text
Ficha	select
Categoría	select
Observaciones	text
3. Usuario completa datos
4. Click en “Agregar y marcar presente”

Ejecuta:

agregarNuevo()
5. Validación

Solo valida:

Nombre obligatorio
6. Request HTTP

Se ejecuta:

POST {
  action: "agregarNuevo"
}
Backend
7. Router

manejar() detecta:

action === "agregarNuevo"
8. Lectura de hoja Pibes

Obtiene todos los registros.

9. Cálculo de nuevo ID

Recorre todos los IDs.

Calcula:

maxId + 1
10. Inserción de fila

Se ejecuta:

sheet.appendRow([...])
11. Marcado automático de presente

Luego ejecuta:

marcarPresente(body.nombre)
FEATURE: Marcar presente
Objetivo

Registrar asistencia del día actual.

Frontend
1. Usuario toca “Marcar presente”

Ejecuta:

marcarPresente()
2. Protección anti doble click
if (marcadoPresente) return;
3. Loading visual
spinner
botón disabled
4. Request POST
POST {
  action: "marcarPresente",
  nombre
}
Backend
5. Obtener fecha actual

Zona horaria:

America/Argentina/Buenos_Aires

Formato:

dd/MM/yyyy
6. Buscar columna de fecha

Recorre encabezados de la hoja.

7. Si la fecha no existe

Crea automáticamente nueva columna.

8. Buscar fila del chico

Compara nombre completo.

9. Si no existe fila

Crea automáticamente nueva fila.

10. Registrar asistencia

Escribe:

x

en:

fila del chico + columna de la fecha
Frontend posterior
11. Confirmación visual
cambia botón
muestra mensaje éxito
bloquea doble marcado
FEATURE: Editar ficha y observaciones
Objetivo

Actualizar datos rápidos desde la tarjeta.

Frontend
1. Usuario toca botón lápiz

Ejecuta:

abrirModal()
2. Apertura del modal

Agrega clase:

.open
3. Usuario modifica datos

Campos:

ficha
observaciones
4. Click en guardar

Ejecuta:

guardarEdicion()
5. Request POST
POST {
  action: "editarFicha",
  fila,
  ficha,
  obs
}
Backend
6. Router

Detecta:

action === "editarFicha"
7. Escritura en Google Sheets

Actualiza:

Campo	Columna
ficha	D
observaciones	F
8. Respuesta
{ "ok": true }
Frontend posterior
9. Cierre modal
cerrarModal()
10. Mensaje éxito
Datos actualizados correctamente
11. Refresco automático
setTimeout(() => buscar(), 500)

Reejecuta la búsqueda para reflejar cambios.

FEATURE: Manejo de errores
Objetivo

Evitar fallas silenciosas.

Frontend

Todos los fetch() usan:

try/catch
Casos cubiertos
Error	Resultado
Sin internet	alerta
URL inválida	alerta
Apps Script caído	alerta
excepción backend	alerta
FEATURE: Creación dinámica de fechas
Objetivo

No depender de columnas predefinidas.

Funcionamiento

La hoja:

Presentes

crece automáticamente.

Ejemplo
Nombre	15/05/2026	22/05/2026
Juan	x	x
Si llega una nueva fecha

Se crea automáticamente nueva columna.

FEATURE: Persistencia de datos
Fuente única de verdad

Toda la información se guarda en Google Sheets.

Hojas utilizadas
Hoja	Uso
Pibes	Datos principales
Presentes	Historial de asistencias
FEATURE: Diseño mobile-first
Objetivo

Uso rápido desde celular.

Características
botones grandes
cards táctiles
header sticky
modal bottom-sheet
inputs optimizados
tap highlight desactivado
viewport mobile
Endpoints disponibles
Método	Acción	Descripción
GET	buscar	Buscar chicos
POST	marcarPresente	Registrar asistencia
POST	agregarNuevo	Crear nuevo chico
POST	editarFicha	Editar datos
Estructura esperada de Google Sheets
Hoja: Pibes
Columna	Campo
A	ID
B	Nombre
C	Grado
D	Tiene ficha
E	Categoría
F	Observaciones
Hoja: Presentes
Columna	Campo
A	Nombre
B+	Fechas
Limitaciones actuales
No existe autenticación

Cualquiera con la URL puede usar la app.

Validaciones mínimas

Actualmente no valida:

duplicados
nombres similares
formato de grado
consistencia de datos
No existe control de concurrencia

Dos usuarios podrían:

editar simultáneamente
marcar presentes simultáneos
Complejidad de búsqueda

La búsqueda actual es:

O(n)

porque recorre todas las filas.

No existe paginación

Todo se procesa en memoria.

Capacidades actuales reales

La app actualmente puede:

buscar chicos
buscar por coincidencia parcial
mostrar múltiples coincidencias
visualizar ficha completa
contar visitas históricas
marcar presentes
crear nuevas fechas automáticamente
agregar nuevos chicos
editar ficha y observaciones
crear filas nuevas automáticamente
funcionar completamente desde celular
persistir todo en Google Sheets
operar como mini sistema CRUD