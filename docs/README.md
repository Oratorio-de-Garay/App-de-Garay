# Registro de ingreso

Aplicación web simple para registrar el ingreso de chicos/as en el oratorio. La interfaz está pensada para uso rápido desde celular o tablet y se conecta a un backend de Google Apps Script para buscar registros, marcar presentes, agregar nuevos chicos y editar datos.

## Qué hace

- Busca un chico por apellido.
- Muestra una ficha con nombre, grado, edad/categoría, estado de ficha y cantidad de visitas.
- Permite marcar presente con un solo toque.
- Si hay varias coincidencias, deja elegir el registro correcto.
- Si no encuentra resultados, permite cargar un chico nuevo y marcarlo presente al mismo tiempo.
- Incluye un modal para editar el estado de la ficha y observaciones.

## Cómo funciona

El archivo principal es [`index.html`](./index.html). Todo el comportamiento de la app está contenido allí:

- HTML para la interfaz.
- CSS embebido para el estilo.
- JavaScript para la lógica de búsqueda y actualización.

La app usa una URL de Google Apps Script definida en la variable:

```js
const urlScript = "https://script.google.com/macros/s/AKfycbwiUjEWYIJGy3AR00wULyzsYCxKYarvpkkGC6bq3Abf_5zGgAtKIpzJl2JTP3_N3Lfr/exec";
```

Ese backend responde a estas acciones:

- `buscar`
- `marcarPresente`
- `agregarNuevo`
- `editarFicha`

## Interfaz

La pantalla principal incluye:

- Encabezado con el título "Registro de ingreso" y la fecha actual.
- Buscador por apellido.
- Tarjetas de resultados.
- Formulario para alta rápida de nuevos chicos.
- Modal deslizable para edición.

## Requisitos

- Navegador moderno con soporte para `fetch`.
- Conexión a internet.
- Backend de Google Apps Script publicado y accesible desde la web.

## Uso

1. Abrí `index.html` en un navegador.
2. Escribí el apellido del chico en el buscador.
3. Elegí una opción si aparecen varios resultados.
4. Marcá el presente, editá datos o cargá un nuevo chico si no existe.

## Configuración del backend

Si querés usar la app con otro backend, cambiá la URL en `index.html` por la de tu propio despliegue de Apps Script.

## Notas

- La app está optimizada para pantallas chicas.
- La fecha que aparece en el encabezado se calcula automáticamente al cargar la página.
- Los datos se actualizan contra el backend, no se guardan en el navegador.

