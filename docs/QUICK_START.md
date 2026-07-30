# Quick Start Guide

Get the app running locally in 5 minutes.

## Prerequisites

- Node.js 16+ installed
- Supabase account (free)
- Code editor (VS Code recommended)

## 1. Set Up Supabase (3 minutes)

1. Go to https://supabase.com → Create new project
2. Copy your **Project URL** and **Anon Key** from Settings → API
3. Go to SQL Editor → paste this and run:

```sql
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  grado TEXT,
  tiene_ficha BOOLEAN DEFAULT FALSE,
  edad TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  marked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_students_nombre ON students(nombre);
CREATE INDEX idx_attendance_student_id ON attendance(student_id);
```

## 2. Run Backend (1 minute)

```bash
cd backend
npm install

# Create .env file with:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key

npm run dev
# Backend running at http://localhost:3000
```

## 3. Run Frontend (1 minute)

1. Open `frontend/index.html` in your browser
2. Or run a local server:
```bash
cd frontend
python -m http.server 8000
# Visit http://localhost:8000
```

That's it! The app should work now.

## Quick Test

1. Click "Buscar"
2. Type any name
3. Click "Agregar" to create a test student
4. Try searching again
5. Mark them present

## Next Steps

- Read [API_DOCUMENTATION.md](API_DOCUMENTATION.md) to understand endpoints
- Read [DATABASE_SETUP.md](DATABASE_SETUP.md) for database details
- Read [DEPLOYMENT.md](DEPLOYMENT.md) when ready to go live

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot reach API" | Check backend is running: `npm run dev` in backend folder |
| "Database error" | Verify SUPABASE_URL and SUPABASE_KEY in .env match your project |
| "Tables don't exist" | Run SQL from step 1 in Supabase SQL Editor |
| "CORS error" | Backend should have CORS enabled (it does by default) |

## File Locations

- Backend code: `backend/api/index.js`
- Frontend HTML: `frontend/index.html`
- Frontend JS: `frontend/index.js`
- Frontend CSS: `frontend/base.css`

## Add Test Data

Run this in Supabase SQL Editor to add sample students:

```sql
INSERT INTO students (nombre, grado, edad) VALUES
  ('Juan Pérez', '3°', 'Medianos'),
  ('María García', '2°', 'Chiquitos'),
  ('Carlos López', '4°', 'Grandes');
```

Now search for "Juan" or "María" in the app.

## One-Minute Summary

1. Create Supabase project + run SQL
2. `cd backend && npm install && npm run dev`
3. Open `frontend/index.html` in browser
4. Done! Start using the app

For detailed info, see the main [README.md](../README.md)
