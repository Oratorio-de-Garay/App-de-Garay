# Local Development Setup

Complete guide for setting up the development environment on your machine.

## Prerequisites

- **Git**: https://git-scm.com/download
- **Node.js 16+**: https://nodejs.org (includes npm)
- **Code Editor**: VS Code (recommended) or any text editor
- **Browser**: Chrome, Firefox, Safari (modern version)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/oratorio-app.git
cd oratorio-app
```

### 2. Set Up Backend

```bash
cd backend

# Install dependencies
npm install

# Create .env file
# Copy the contents below into a new file called .env
```

Create `.env` file in `backend/` directory:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key
```

Get these values from:
1. Go to https://supabase.com
2. Select your project
3. Settings → API
4. Copy Project URL and Anon Public Key

### 3. Set Up Frontend

No installation needed - it's just HTML/CSS/JS. The `frontend/` folder is ready to use.

### 4. Start Development

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Output: Server running on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd frontend

# Option A: Use Python's built-in server (Linux/Mac)
python -m http.server 8000

# Option B: Use Node's http-server
npm install -g http-server
http-server

# Option C: Open directly in browser
# Just open frontend/index.html in your browser
```

**Open in Browser:**
- Frontend: http://localhost:8000 (or open `frontend/index.html`)
- API: http://localhost:3000

## File Structure

```
oratorio-app/
├── backend/
│   ├── api/
│   │   └── index.js              ← API server code
│   ├── package.json              ← Dependencies
│   ├── vercel.json              ← Deployment config
│   └── .env                     ← Environment (create this)
├── frontend/
│   ├── index.html               ← Main page
│   ├── index.js                 ← App logic (update API_URL here)
│   └── base.css                 ← Styles
├── docs/
│   ├── API_DOCUMENTATION.md     ← API reference
│   ├── DATABASE_SETUP.md        ← Database guide
│   ├── QUICK_START.md          ← 5-minute setup
│   └── ...
├── README.md                    ← Main documentation
└── .env.example                 ← Environment template
```

## Development Workflow

### Making Changes

1. **Backend changes** (`backend/api/index.js`):
   - Server auto-reloads with `npm run dev`
   - Test with `curl` or Postman
   - Example:
   ```bash
   curl "http://localhost:3000/api/students/search?q=juan"
   ```

2. **Frontend changes** (`frontend/index.js` or `frontend/index.html`):
   - Refresh browser (F5 or Cmd+R)
   - Hard refresh to bypass cache (Ctrl+Shift+R or Cmd+Shift+R)
   - Check browser console for errors (F12)

3. **CSS changes** (`frontend/base.css`):
   - Refresh browser to see changes
   - Use browser DevTools to debug styles (F12)

### API URL Configuration

In `frontend/index.html`, update if needed:

```javascript
// For local development (already set):
window.API_URL = "http://localhost:3000";

// For production:
window.API_URL = "https://your-backend.vercel.app";
```

## Testing the API

### Using curl

```bash
# Search students
curl "http://localhost:3000/api/students/search?q=test"

# Get health status
curl "http://localhost:3000/api/health"

# Create student
curl -X POST http://localhost:3000/api/students \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test Student","edad":"Medianos"}'

# Mark present
curl -X POST http://localhost:3000/api/attendance/mark \
  -H "Content-Type: application/json" \
  -d '{"student_id":1,"fecha":"2024-01-15"}'

# Update student
curl -X PATCH http://localhost:3000/api/students/1 \
  -H "Content-Type: application/json" \
  -d '{"tiene_ficha":"Sí"}'
```

### Using Browser Console

```javascript
// In browser DevTools Console (F12)

// Search
fetch('http://localhost:3000/api/students/search?q=test')
  .then(r => r.json())
  .then(d => console.log(d));

// Create
fetch('http://localhost:3000/api/students', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nombre: 'Test',
    edad: 'Medianos'
  })
})
  .then(r => r.json())
  .then(d => console.log(d));
```

### Using Postman

1. Download Postman: https://www.postman.com/downloads
2. Create requests:
   - Method: GET/POST/PATCH
   - URL: http://localhost:3000/api/...
   - Body: JSON for POST/PATCH
   - Headers: Content-Type: application/json

## Common Development Tasks

### Add a New API Endpoint

Edit `backend/api/index.js`:

```javascript
// Example: Add new endpoint
app.get("/api/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

Test with:
```bash
curl "http://localhost:3000/api/students/1"
```

### Update Frontend UI

Edit `frontend/index.html` and `frontend/index.js`:

1. Add HTML elements to `index.html`
2. Add JavaScript functions to `index.js`
3. Style with CSS in `base.css`
4. Refresh browser to see changes

### Modify Database Schema

Edit Supabase SQL directly:

1. Go to https://supabase.com
2. Project → SQL Editor
3. Write SQL to modify tables
4. Test thoroughly before deploying

Example:
```sql
-- Add new column
ALTER TABLE students ADD COLUMN phone TEXT;

-- Create new table
CREATE TABLE guardians (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  nombre TEXT NOT NULL,
  telefono TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Debugging

### Backend Debugging

```javascript
// Add console.log statements
console.log('Request received:', req.body);

// Use error stack traces
app.get("/api/test", (req, res) => {
  try {
    // Your code
  } catch (error) {
    console.error('Full error:', error); // Shows stack trace
    res.status(500).json({ error: error.message });
  }
});
```

Run with: `npm run dev`

### Frontend Debugging

1. Open DevTools: F12 or Ctrl+Shift+I
2. Console tab: See console.log() and errors
3. Network tab: See API requests/responses
4. Elements tab: Inspect HTML/CSS
5. Sources tab: Set breakpoints in code

Example:
```javascript
// In frontend/index.js
async function buscar() {
  console.log('Search initiated');
  const res = await fetch(`${API_URL}/api/students/search?q=...`);
  console.log('Response:', res);
  const data = await res.json();
  console.log('Data:', data);
}
```

### Database Debugging

In Supabase SQL Editor:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check student data
SELECT * FROM students LIMIT 5;

-- Check attendance data
SELECT * FROM attendance LIMIT 5;

-- Count records
SELECT COUNT(*) FROM students;
SELECT COUNT(*) FROM attendance;
```

## Performance Profiling

### Frontend

```javascript
// Measure function execution time
const start = performance.now();
// ... your code
const end = performance.now();
console.log(`Execution time: ${end - start}ms`);
```

### Backend

```javascript
// Add timing to endpoints
app.get("/api/students/search", async (req, res) => {
  const start = Date.now();
  
  // ... your code
  
  const duration = Date.now() - start;
  console.log(`Search took ${duration}ms`);
  res.json({ data, duration });
});
```

## Useful Commands

```bash
# Backend
npm run dev              # Start development server (auto-reload)
npm start               # Start production server
npm test               # Run tests (if configured)

# Frontend (no npm scripts needed)
# Just open frontend/index.html or use http-server

# Git
git status              # Check changed files
git add .              # Stage changes
git commit -m "message" # Commit
git push               # Push to remote
git pull               # Pull from remote
```

## Environment Troubleshooting

### "npm command not found"
- Node.js not installed
- Solution: Install from https://nodejs.org

### "Port 3000 already in use"
```bash
# Find and kill process using port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID [PID] /F

# Mac/Linux:
lsof -i :3000
kill -9 [PID]
```

### "CORS error" in browser
- Backend CORS is already enabled
- Check API_URL is correct in frontend/index.html
- Verify backend is running

### "Cannot reach database"
- Check SUPABASE_URL and SUPABASE_KEY in .env
- Verify database tables exist
- Check Supabase project is accessible

### "Module not found"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Best Practices

1. **Always use .env for secrets** - Never commit credentials
2. **Test locally first** - Before pushing to git
3. **Keep code simple** - Avoid over-engineering
4. **Write comments** - For non-obvious logic only
5. **Test edge cases** - Empty searches, special characters
6. **Use meaningful names** - For variables and functions
7. **Keep APIs consistent** - Follow REST conventions
8. **Monitor performance** - Profile slow operations

## Next Steps

1. ✅ Complete this setup
2. ✅ Make a small change and test it
3. ✅ Try creating a new endpoint
4. ✅ Test thoroughly
5. ✅ Read [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
6. ✅ Read [DEPLOYMENT.md](DEPLOYMENT.md) for production

## Getting Help

- **API Questions**: See [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Database Questions**: See [DATABASE_SETUP.md](DATABASE_SETUP.md)
- **Supabase Docs**: https://supabase.com/docs
- **Express Docs**: https://expressjs.com
- **JavaScript Docs**: https://developer.mozilla.org/en-US/docs/Web/JavaScript

## Quick Reference

| Task | Command |
|------|---------|
| Start backend | `cd backend && npm run dev` |
| Start frontend | Open `frontend/index.html` |
| Test API | `curl http://localhost:3000/api/health` |
| View logs | `npm run dev` or browser F12 |
| Restart backend | Ctrl+C, then `npm run dev` |
| Clear cache | Ctrl+Shift+R in browser |

Happy coding! 🚀
