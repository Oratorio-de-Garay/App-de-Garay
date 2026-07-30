# Oratorio App - Student Attendance Tracker

A modern web application for tracking student attendance at a volunteer organization. Migrated from Google Apps Script + Google Sheets to a robust stack using Node.js/Express, Supabase (PostgreSQL), and Vercel.

## Features

- **Student Search**: Quickly find students by name or surname
- **Attendance Tracking**: Mark students as present with date selection
- **Student Management**: Add new students and maintain their records
- **Form Tracking**: Track which students have submitted required forms (fichas)
- **Visit Counting**: Automatically count student visits throughout the year
- **Notes/Observations**: Store and update observations about each student
- **Mobile-Friendly**: Fully responsive design optimized for mobile usage

## Tech Stack

### Frontend
- **Vanilla JavaScript** (no frameworks)
- **HTML5** with semantic markup
- **CSS3** with CSS variables for theming
- **Mobile-first responsive design**

### Backend
- **Node.js** with Express.js
- **Vercel** for deployment (serverless functions)
- **PostgreSQL** (via Supabase)

### Database
- **Supabase** (PostgreSQL with REST API)
- Automatic backups and high availability

## Project Structure

```
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── index.js            # Frontend JavaScript
│   └── base.css            # Styles
├── backend/
│   ├── api/
│   │   └── index.js        # Express server & routes
│   ├── package.json        # Dependencies
│   ├── vercel.json         # Vercel configuration
│   └── .env.example        # Environment variables template
├── docs/
│   ├── API_DOCUMENTATION.md    # API endpoint reference
│   ├── DATABASE_SETUP.md       # Database setup guide
│   └── DEPLOYMENT.md           # Deployment instructions
└── README.md              # This file
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Supabase account (free tier works great)
- Vercel account (free tier)
- Git

### 1. Database Setup

1. Create a Supabase project at https://supabase.com
2. Follow the SQL setup in [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)
3. Note your `SUPABASE_URL` and `SUPABASE_KEY`

### 2. Backend Setup (Local Development)

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key
```

Start the development server:
```bash
npm run dev
```

Server runs on `http://localhost:3000`

### 3. Frontend Setup

The frontend is just HTML/CSS/JS - no build step needed.

For local development, open `frontend/index.html` in your browser and update the API URL in `frontend/index.html`:

```javascript
// In frontend/index.html, change the API_URL:
window.API_URL = "http://localhost:3000";
```

### 4. Testing

Use the API endpoints as described in [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)

## Deployment

### Deploy Backend to Vercel

1. Push your backend code to GitHub
2. Go to https://vercel.com and create a new project
3. Select your repository
4. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
5. Deploy

Note your Vercel deployment URL (e.g., `https://your-app.vercel.app`)

### Deploy Frontend

1. Update the API URL in `frontend/index.html`:
```javascript
window.API_URL = "https://your-app.vercel.app";
```

2. Deploy the frontend to:
   - **Vercel** (recommended)
   - **Netlify**
   - **GitHub Pages**
   - **Any static host**

For Vercel deployment:
1. Push frontend to GitHub
2. Create a new Vercel project from the frontend directory
3. Deploy

## API Endpoints

See [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for complete API reference.

### Quick Reference

```
GET  /api/students/search?q=name        # Search students
POST /api/attendance/mark               # Mark present
POST /api/students                      # Create new student
PATCH /api/students/:id                 # Update student
GET  /api/health                        # Health check
```

## Environment Variables

### Backend (.env)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key
```

### Frontend (index.html)
```javascript
window.API_URL = "http://localhost:3000"  // Development
window.API_URL = "https://your-backend.vercel.app"  // Production
```

## Database Schema

### students table
- `id`: Primary key (auto-increment)
- `nombre`: Student name
- `grado`: Grade level
- `tiene_ficha`: Form submission status
- `edad`: Age category
- `observaciones`: Notes
- `created_at`, `updated_at`: Timestamps

### attendance table
- `id`: Primary key (auto-increment)
- `student_id`: Foreign key to students
- `fecha`: Date (YYYY-MM-DD)
- `marked`: Boolean (always true)
- `created_at`: Timestamp

## Development

### Adding New Features

1. **Backend**: Add new endpoints to `backend/api/index.js`
2. **Frontend**: Add new functions to `frontend/index.js`
3. **Database**: Modify schema in Supabase if needed

### Code Style

- **Frontend**: Vanilla JS with clear function names
- **Backend**: Express middleware pattern
- **No external build tools** - keep it simple

### Testing API Locally

```bash
# In another terminal, after running `npm run dev`:

# Search
curl "http://localhost:3000/api/students/search?q=juan"

# Create student
curl -X POST http://localhost:3000/api/students \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test Student","edad":"Medianos"}'
```

## Maintenance

### Regular Tasks

- Monitor Supabase usage (storage, API calls)
- Check Vercel logs for errors
- Backup important data regularly
- Review and update dependencies monthly

### Performance Tips

- Database indexes are already created
- API responses are optimized
- Frontend uses efficient CSS selectors
- Consider adding caching headers for static files

## Troubleshooting

### "Cannot connect to API"
- Verify `window.API_URL` is correct
- Check backend is running (dev) or deployed (prod)
- Verify CORS is enabled (should be by default)

### "Database connection failed"
- Check `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Verify Supabase project exists and tables are created
- Check database credentials have permissions

### "CORS error"
- CORS is enabled by default for all origins
- If restricted, update CORS in `backend/api/index.js`

### Frontend not updating after saving
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Verify API is responding

## Security Considerations

### Current Limitations
- No authentication (open to anyone)
- No rate limiting
- No request validation (beyond basic checks)

### Recommended for Production
1. Add user authentication (Supabase Auth)
2. Implement Row Level Security (RLS) policies
3. Add rate limiting
4. Validate all inputs server-side
5. Use HTTPS only
6. Add request logging and monitoring

## Migration from Google Apps Script

### Data Export Steps

1. Export "Pibes" sheet as CSV
2. Export "Presentes" sheet as CSV
3. Use Supabase import tool to load data
4. Map columns to new schema

### Column Mapping

**Old → New**
- Id → students.id
- Nombre y Apellido → students.nombre
- Grado → students.grado
- TieneFicha → students.tiene_ficha
- Edad → students.edad
- Observaciones → students.observaciones

## Documentation

- **API Docs**: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)
- **Database Setup**: [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)
- **Deployment**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Contributing

For junior developers:
1. Read the code comments in `backend/api/index.js`
2. Understand the database schema
3. Test changes locally before deploying
4. Update documentation when adding features

## License

MIT

## Version History

- **1.0.0** (2024) - Initial migration from Google Apps Script
  - Supabase PostgreSQL backend
  - Express.js REST API
  - Vercel deployment
  - Vanilla JS frontend (no frameworks)

