# API Documentation

Complete reference for the Oratorio App REST API endpoints.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-backend.vercel.app`

The frontend is served by the same backend (`express.static`), so in production the frontend calls the API on the same origin (`window.API_URL = ""`).

## Authentication

Currently, the API has no authentication. Access is controlled entirely by Supabase Row Level Security policies (see [DATABASE_SETUP.md](DATABASE_SETUP.md)). For production use with sensitive data, implement Supabase Auth.

---

## Endpoints

### 1. Get Lookups (grados & edades)

**Endpoint**: `GET /api/lookups`

Returns the available grade levels and age categories, used to populate the "new pibe" form's dropdowns.

**Response** (200):
```json
{
  "edades": [
    { "id": 1, "nombre": "Chiquitos" },
    { "id": 2, "nombre": "Medianos" }
  ],
  "grados": [
    { "id": 1, "label": "Primario 1°" },
    { "id": 2, "label": "Primario 2°" }
  ]
}
```

**Example Request**:
```bash
curl http://localhost:3000/api/lookups
```

---

### 2. Search Pibes

**Endpoint**: `GET /api/students/search`

Search for pibes by nombre or apellido (matches either field).

**Query Parameters**:
- `q` (string, required): Search term

**Response** (200):
```json
[
  {
    "id": "a1b2c3d4-...",
    "nombre": "Juan",
    "apellido": "Pérez",
    "nombreCompleto": "Juan Pérez",
    "grado_id": 3,
    "grado": "Primario 3°",
    "edad_id": 2,
    "edad": "Medianos",
    "ficha": true,
    "obs": "Energético",
    "telefono": 1122334455,
    "visitas": 5
  }
]
```

**Example Request**:
```bash
curl "http://localhost:3000/api/students/search?q=P%C3%A9rez"
```

**Error Response** (500):
```json
{ "error": "Database connection failed" }
```

---

### 3. Mark Present

**Endpoint**: `POST /api/attendance/mark`

Creates a new row in `asistencias` (one row per visit — there is no "unmark").

**Request Body**:
```json
{
  "student_id": "a1b2c3d4-...",
  "fecha": "2024-01-15"
}
```

**Parameters**:
- `student_id` (uuid, required): The pibe's `id`
- `fecha` (string, required): Date (YYYY-MM-DD), stored as timestamptz

**Response** (200):
```json
{ "ok": true }
```

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/attendance/mark \
  -H "Content-Type: application/json" \
  -d '{"student_id":"a1b2c3d4-...","fecha":"2024-01-15"}'
```

**Error Response** (400):
```json
{ "error": "Missing student_id or fecha" }
```

---

### 4. Create New Pibe

**Endpoint**: `POST /api/students`

Adds a new pibe and optionally marks them present in the same call.

**Request Body**:
```json
{
  "nombre": "Carlos",
  "apellido": "López",
  "grado_id": 4,
  "edad_id": 3,
  "entrego_ficha": true,
  "telefono_emergencia": 1122334455,
  "observaciones": "Entusiasta",
  "fecha": "2024-01-15"
}
```

**Parameters**:
- `nombre` (string, required)
- `apellido` (string, required)
- `grado_id` (integer, required): id from `GET /api/lookups` → `grados`
- `edad_id` (integer, required): id from `GET /api/lookups` → `edades`
- `entrego_ficha` (boolean, optional, default false)
- `telefono_emergencia` (integer, optional)
- `observaciones` (string, optional)
- `fecha` (string, optional): if present, also marks attendance for that date

**Response** (200):
```json
{ "ok": true, "id": "a1b2c3d4-..." }
```

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/students \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Carlos","apellido":"López","grado_id":4,"edad_id":3,"entrego_ficha":true,"fecha":"2024-01-15"}'
```

**Error Response** (400):
```json
{ "error": "Missing nombre, apellido, grado_id or edad_id" }
```

---

### 5. Update Pibe

**Endpoint**: `PATCH /api/students/:id`

Updates ficha status and/or observations. `id` is the pibe's uuid.

**Request Body**:
```json
{
  "entrego_ficha": true,
  "observaciones": "Ficha recibida"
}
```

**Response** (200):
```json
{ "ok": true }
```

**Example Request**:
```bash
curl -X PATCH http://localhost:3000/api/students/a1b2c3d4-... \
  -H "Content-Type: application/json" \
  -d '{"entrego_ficha":true,"observaciones":"Ficha recibida"}'
```

---

### 6. Health Check

**Endpoint**: `GET /api/health`

**Response** (200):
```json
{ "status": "ok" }
```

---

## Error Handling

All errors follow this format:
```json
{ "error": "Description of what went wrong" }
```

HTTP status codes: `200` success, `400` bad request, `500` server error.

## CORS

CORS is enabled for all origins. Restrict this in `backend/api/index.js` for production if the frontend is hosted on a known domain.

## Future Enhancements

- Add authentication (Supabase Auth)
- Add rate limiting
- Support deleting/un-marking an asistencia
- Add data export endpoints (CSV/PDF)
