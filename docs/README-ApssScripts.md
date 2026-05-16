# Backend · Google Apps Script

Backend en Google Apps Script para la aplicación de registro de ingreso del oratorio.

Este script funciona como una API simple conectada a Google Sheets. Expone acciones vía `GET` y `POST` para:

- Buscar chicos/as.
- Marcar presentes.
- Agregar nuevos registros.
- Editar ficha y observaciones.

Está pensado para ser usado desde la app web móvil incluida en el proyecto.

---

# Estructura esperada de Google Sheets

El proyecto usa **dos hojas** dentro del mismo spreadsheet.

## Hoja: `Pibes`

Contiene la información principal de cada chico/a.

### Estructura

| Columna | Campo               |
|----------|---------------------|
| A        | Id                  |
| B        | Nombre y Apellido   |
| C        | Grado               |
| D        | TieneFicha          |
| E        | Edad / Categoría    |
| F        | Observaciones       |

### Importante

- La fila `1` puede quedar libre.
- Los encabezados deben estar en la fila `2`.
- Los datos empiezan en la fila `3`.

Ejemplo:

| A | B                  | C   | D  | E         | F                    |
|---|--------------------|-----|----|-----------|----------------------|
|   |                    |     |    |           |                      |
| Id | Nombre y Apellido | Grado | TieneFicha | Edad | Observaciones |
| 1 | Juan Pérez         | 4°  | Sí | Grandes   | Celíaco              |

---

## Hoja: `Presentes`

Registra la asistencia histórica.

### Estructura

| Columna | Campo                |
|----------|----------------------|
| A        | Nombre y Apellido    |
| B+       | Fechas               |

Cada fecha representa un día de oratorio.

Cuando un chico estuvo presente, se escribe:

```txt
x