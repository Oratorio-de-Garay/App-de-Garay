> ⚠️ **Histórico / desactualizado.** Describe la versión original en Google Apps Script + Google Sheets, previa a la migración a Supabase + Express + Vercel. Se conserva sólo como contexto de negocio. Para el estado actual ver [../ARCHITECTURE.md](../ARCHITECTURE.md), [../DATABASE.md](../DATABASE.md) y [../API.md](../API.md).

# requirements.md

# Registro de ingreso · Requerimientos funcionales

## Objetivo general

La aplicación permite registrar el ingreso de chicos/as al oratorio desde dispositivos móviles de manera rápida y simple.

El sistema está compuesto por:

- Un frontend web (`index.html`)
- Un backend en Google Apps Script
- Un Google Spreadsheet como base de datos

La app permite:

- Buscar chicos existentes.
- Ver información resumida.
- Marcar presentes.
- Agregar nuevos chicos.
- Editar datos existentes.
- Llevar historial de asistencia.

---

# Arquitectura actual

## Frontend

Archivo único:

```txt
index.html