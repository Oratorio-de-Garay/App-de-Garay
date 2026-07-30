# API Documentation

Complete reference for the Oratorio App REST API endpoints.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-backend.vercel.app`

## Authentication

Currently, the API has no authentication. For production use, implement JWT or Supabase Auth.

---

## Endpoints

### 1. Search Students

**Endpoint**: `GET /api/students/search`

Search for students by name or surname.

**Query Parameters**:
- `q` (string, required): Search term (name or surname)

**Response** (200):
```json
[
  {
    "id": 1,
    "nombre": "Juan Pérez",
    "grado": "3°",
    "ficha": true,
    "edad": "Medianos",
    "obs": "Energético",
    "visitas": 5
  },
  {
    "id": 2,
    "nombre": "María García",
    "grado": "2°",
    "ficha": false,
    "edad": "Chiquitos",
    "obs": null,
    "visitas": 3
  }
]
```

**Example Request**:
```bash
curl "http://localhost:3000/api/students/search?q=Pérez"
```

**Error Response** (500):
```json
{
  "error": "Database connection failed"
}
```

---

### 2. Mark Student Present

**Endpoint**: `POST /api/attendance/mark`

Record a student's attendance for a specific date.

**Request Body**:
```json
{
  "student_id": 1,
  "fecha": "2024-01-15"
}
```

**Parameters**:
- `student_id` (integer, required): The student's ID
- `fecha` (string, required): Date in format YYYY-MM-DD

**Response** (200):
```json
{
  "ok": true
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/attendance/mark \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 1,
    "fecha": "2024-01-15"
  }'
```

**Error Response** (400):
```json
{
  "error": "Missing student_id or fecha"
}
```

---

### 3. Create New Student

**Endpoint**: `POST /api/students`

Add a new student to the system and optionally mark them present.

**Request Body**:
```json
{
  "nombre": "Carlos López",
  "grado": "4°",
  "tiene_ficha": "Sí",
  "edad": "Grandes",
  "observaciones": "Entusiasta",
  "fecha": "2024-01-15"
}
```

**Parameters**:
- `nombre` (string, required): Student's full name
- `grado` (string, optional): Grade/level
- `tiene_ficha` (string, optional): "Sí" or "No"
- `edad` (string, optional): Age category
- `observaciones` (string, optional): Notes
- `fecha` (string, optional): Date to mark present (YYYY-MM-DD format)

**Response** (200):
```json
{
  "ok": true,
  "id": 42
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/students \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Carlos López",
    "grado": "4°",
    "tiene_ficha": "Sí",
    "edad": "Grandes",
    "observaciones": "Entusiasta",
    "fecha": "2024-01-15"
  }'
```

**Error Response** (400):
```json
{
  "error": "Missing nombre"
}
```

---

### 4. Update Student

**Endpoint**: `PATCH /api/students/:id`

Update a student's ficha status and observations.

**URL Parameters**:
- `id` (integer, required): Student ID

**Request Body**:
```json
{
  "tiene_ficha": "Sí",
  "observaciones": "Updated observation"
}
```

**Parameters**:
- `tiene_ficha` (string, optional): "Sí" or "No"
- `observaciones` (string, optional): Updated notes

**Response** (200):
```json
{
  "ok": true
}
```

**Example Request**:
```bash
curl -X PATCH http://localhost:3000/api/students/1 \
  -H "Content-Type: application/json" \
  -d '{
    "tiene_ficha": "Sí",
    "observaciones": "Ficha recibida"
  }'
```

**Error Response** (500):
```json
{
  "error": "Database error"
}
```

---

### 5. Health Check

**Endpoint**: `GET /api/health`

Simple endpoint to verify API is running.

**Response** (200):
```json
{
  "status": "ok"
}
```

**Example Request**:
```bash
curl http://localhost:3000/api/health
```

---

## Error Handling

All errors follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP Status Codes:
- `200`: Success
- `400`: Bad request (missing required parameters)
- `500`: Server error

---

## Rate Limiting

Currently not implemented. Add rate limiting for production deployments.

---

## CORS

The API accepts requests from any origin. For production, configure CORS to allow only your frontend domain.

---

## Testing the API

### Using curl

```bash
# Search
curl "http://localhost:3000/api/students/search?q=juan"

# Mark present
curl -X POST http://localhost:3000/api/attendance/mark \
  -H "Content-Type: application/json" \
  -d '{"student_id":1,"fecha":"2024-01-15"}'

# Create student
curl -X POST http://localhost:3000/api/students \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","edad":"Medianos"}'

# Update student
curl -X PATCH http://localhost:3000/api/students/1 \
  -H "Content-Type: application/json" \
  -d '{"tiene_ficha":"Sí"}'

# Health check
curl http://localhost:3000/api/health
```

### Using JavaScript/Fetch

```javascript
// Search
fetch('http://localhost:3000/api/students/search?q=juan')
  .then(r => r.json())
  .then(data => console.log(data));

// Mark present
fetch('http://localhost:3000/api/attendance/mark', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    student_id: 1,
    fecha: '2024-01-15'
  })
})
  .then(r => r.json())
  .then(data => console.log(data));
```

---

## Future Enhancements

- Add JWT authentication
- Implement rate limiting
- Add request logging/monitoring
- Support batch operations
- Add data export endpoints (CSV/PDF)
- Add analytics endpoints (attendance reports)
