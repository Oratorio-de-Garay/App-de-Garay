# Deployment Guide

Step-by-step instructions for deploying the Oratorio App to production.

## Overview

The app is split into two parts:
1. **Backend**: Express.js API (deployed to Vercel)
2. **Frontend**: Static HTML/CSS/JS (deployed to Vercel or similar)

Both can be deployed independently.

## Prerequisites

- GitHub account with repositories for frontend and backend
- Supabase account with configured database
- Vercel account (free tier is sufficient)

## Step 1: Prepare Supabase

### 1.1 Create Supabase Project

1. Go to https://supabase.com and sign up
2. Create a new project
3. Choose a region closest to your users
4. Wait for project initialization (5-10 minutes)

### 1.2 Set Up Database

1. Go to SQL Editor
2. Copy and paste the SQL from [DATABASE_SETUP.md](DATABASE_SETUP.md)
3. Execute the SQL to create tables

### 1.3 Get Credentials

1. Go to Project Settings → API
2. Copy the **Project URL** (this is your SUPABASE_URL)
3. Copy the **Anon Public Key** (this is your SUPABASE_KEY)
4. Save these - you'll need them soon

## Step 2: Prepare GitHub Repositories

### 2.1 Backend Repository

```bash
cd backend
git init
git add .
git commit -m "Initial commit: Express backend"
git remote add origin https://github.com/YOUR_USERNAME/oratorio-backend.git
git branch -M main
git push -u origin main
```

### 2.2 Frontend Repository

```bash
cd frontend
git init
git add .
git commit -m "Initial commit: Frontend"
git remote add origin https://github.com/YOUR_USERNAME/oratorio-frontend.git
git branch -M main
git push -u origin main
```

Or combine both in a single repository (recommended).

## Step 3: Deploy Backend to Vercel

### 3.1 Create Vercel Project

1. Go to https://vercel.com and sign in
2. Click "New Project"
3. Select your GitHub repository (backend)
4. Select "Other" as framework
5. In "Root Directory", enter `backend`
6. Click "Deploy"

### 3.2 Add Environment Variables

1. After deployment, go to Project Settings
2. Select "Environment Variables"
3. Add two variables:
   - Name: `SUPABASE_URL`, Value: `https://your-project.supabase.co`
   - Name: `SUPABASE_KEY`, Value: `your-anon-public-key`
4. Redeploy the project to apply changes

### 3.3 Note Your URL

Your backend is now deployed at:
```
https://[deployment-name].vercel.app
```

This is your production `API_URL`.

## Step 4: Deploy Frontend

### Option A: Deploy to Vercel (Recommended)

1. Create a new Vercel project from your frontend repo
2. Select "Static Site" as project type
3. No environment variables needed for frontend
4. Deploy

### Option B: Deploy to Netlify

1. Go to https://netlify.com
2. Click "New site from Git"
3. Select your frontend repository
4. Build settings:
   - Build command: (leave empty)
   - Publish directory: `frontend`
5. Deploy

### Option C: Deploy to GitHub Pages

1. Create a `.github/workflows/deploy.yml` file:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
      - name: Deploy
        run: |
          cd frontend
          # GitHub Pages will serve from ./frontend directory
```

## Step 5: Update API URL

### For Vercel/Netlify Frontend

Update `frontend/index.html`:

```javascript
// Change from:
window.API_URL = "http://localhost:3000";

// To your production backend URL:
window.API_URL = "https://[your-backend].vercel.app";
```

Redeploy frontend after this change.

### For GitHub Pages

Same as above, but make sure to push changes before redeploying.

## Step 6: Verify Deployment

### Check Backend

```bash
curl https://[your-backend].vercel.app/api/health
# Should return: {"status":"ok"}
```

### Check Frontend

1. Visit your frontend URL
2. Try searching for a student
3. Try creating a new student
4. Verify data saves correctly

## Production Checklist

Before going live:

- [ ] Supabase database created and populated
- [ ] Backend deployed to Vercel
- [ ] Frontend deployed (Vercel/Netlify/GitHub Pages)
- [ ] API URL updated in frontend
- [ ] Search functionality works
- [ ] Create student works
- [ ] Mark attendance works
- [ ] Edit student data works
- [ ] No console errors in browser dev tools
- [ ] Mobile view tested
- [ ] Tested from different network/device

## Monitoring

### Vercel

1. Dashboard shows deployment status
2. Check "Deployments" tab for logs
3. Check "Monitoring" tab for errors/analytics

### Supabase

1. Go to "Database" dashboard
2. Check active connections
3. Monitor storage usage
4. Review API usage in "Logs"

## Troubleshooting Deployment

### "Build failed" on Vercel

1. Check build logs in Vercel dashboard
2. Common issues:
   - Missing `package.json` in backend directory
   - Wrong Node version (use 16+)
   - Syntax errors in code

Solution:
```bash
# Verify locally
npm install
npm start

# If it works locally, check Vercel config
cat vercel.json
```

### "Cannot connect to API" in frontend

1. Verify API_URL in frontend/index.html is correct
2. Test API directly:
   ```bash
   curl https://[your-backend].vercel.app/api/health
   ```
3. Check Vercel backend logs for errors
4. Verify environment variables are set in Vercel

### "Database connection failed"

1. Verify SUPABASE_URL and SUPABASE_KEY in Vercel
2. Test connection in Supabase:
   ```sql
   SELECT * FROM students LIMIT 1;
   ```
3. Check if tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

### Frontend shows old version

1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Verify deployment completed in Vercel
4. Check file timestamps in Vercel deployment

## Updating Code

### Deploy Backend Changes

```bash
cd backend
# Make changes...
git add .
git commit -m "Your change description"
git push origin main
# Vercel auto-deploys within 1-2 minutes
```

### Deploy Frontend Changes

```bash
cd frontend
# Make changes...
git add .
git commit -m "Your change description"
git push origin main
# Vercel auto-deploys within 1-2 minutes
```

## Scaling & Performance

### Current Setup

- **Backend**: Vercel serverless (auto-scales)
- **Database**: Supabase free tier (25 MB storage, plenty for small use)
- **Frontend**: CDN distribution (fast global access)

### If You Need More

1. Upgrade Supabase plan (more storage, dedicated database)
2. Add Redis caching layer
3. Implement request batching
4. Use database connection pooling

## Security in Production

### Enable HTTPS

Both Vercel and Netlify provide HTTPS by default.

### Add Authentication (Optional)

To restrict access to authorized users only:

```javascript
// In backend/api/index.js, add Supabase Auth:
import { createClient } from '@supabase/supabase-js';

// Verify token on each request
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Verify token with Supabase Auth
  next();
});
```

See Supabase Auth docs: https://supabase.com/docs/guides/auth

### Set Up Row Level Security

In Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Add policies for authenticated users only
CREATE POLICY "Authenticated users can read"
  ON students FOR SELECT
  USING (auth.role() = 'authenticated');
```

## Backup Strategy

### Automated

- Supabase automatically backs up your database
- Vercel keeps deployment history (30 days)

### Manual Backup

```bash
# Export data from Supabase
# Go to Supabase Dashboard → Settings → Backups
```

### Recovery

If something breaks:

1. Check Supabase backups
2. Restore from Vercel deployment history
3. Contact support if needed

## Domain Setup (Optional)

### Point Custom Domain to Vercel

1. In Vercel, go to Project Settings → Domains
2. Add your domain name
3. Update your domain registrar's DNS settings (Vercel provides instructions)
4. Wait for DNS propagation (up to 48 hours)

## Performance Optimization

### Frontend

- Minimize CSS/JS files
- Use service workers for offline capability
- Cache static assets

### Backend

- Add response caching headers
- Implement database query caching
- Monitor slow queries in Supabase

### Database

- Indexes already created (see DATABASE_SETUP.md)
- Monitor query performance
- Archive old attendance records if dataset grows

## Next Steps

1. Test thoroughly in staging
2. Get team feedback
3. Train users on new system
4. Plan data migration if coming from Google Sheets
5. Schedule launch date
6. Set up monitoring and alerts

## Support

If deployment fails:
1. Check Vercel/Netlify logs
2. Verify environment variables
3. Test backend locally
4. Check Supabase connectivity
5. Review this guide step-by-step

Contact support:
- Vercel: https://vercel.com/support
- Supabase: https://supabase.com/docs
- Express.js: https://expressjs.com
