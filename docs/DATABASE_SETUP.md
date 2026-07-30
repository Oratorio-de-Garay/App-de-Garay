# Database Setup Guide

This guide explains how to set up the PostgreSQL database in Supabase for the Oratorio App.

## Prerequisites

1. Create a Supabase account at https://supabase.com
2. Create a new project
3. Access the SQL editor in your Supabase dashboard

## Creating the Tables

Copy and paste the following SQL into the Supabase SQL editor and execute it:

```sql
-- Create students table
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

-- Create attendance table
CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  marked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_students_nombre ON students(nombre);
CREATE INDEX idx_attendance_student_id ON attendance(student_id);
CREATE INDEX idx_attendance_fecha ON attendance(fecha);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Allow public read access" ON students
  FOR SELECT USING (TRUE);

CREATE POLICY "Allow public insert" ON students
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Allow public update" ON students
  FOR UPDATE USING (TRUE);

CREATE POLICY "Allow public read attendance" ON attendance
  FOR SELECT USING (TRUE);

CREATE POLICY "Allow public insert attendance" ON attendance
  FOR INSERT WITH CHECK (TRUE);
```

## Schema Description

### students table
- **id**: Auto-incrementing primary key
- **nombre**: Student's full name (required)
- **grado**: Student's grade/level (optional)
- **tiene_ficha**: Boolean indicating if student submitted form (default: false)
- **edad**: Age category (e.g., "Chiquitos", "Medianos", "Grandes", "Gigantes")
- **observaciones**: Notes/observations about the student
- **created_at**: Timestamp when record was created
- **updated_at**: Timestamp when record was last updated

### attendance table
- **id**: Auto-incrementing primary key
- **student_id**: Foreign key referencing students.id
- **fecha**: Date of attendance (DATE format: YYYY-MM-DD)
- **marked**: Boolean flag (always true for marked attendance)
- **created_at**: Timestamp when attendance was recorded

## Getting Your Credentials

After creating the database:

1. Go to Project Settings → API
2. Copy your **Project URL** (SUPABASE_URL)
3. Copy your **Anon Public Key** (SUPABASE_KEY)
4. Add these to your `.env` file

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key
```

## Security Notes

- The Row Level Security (RLS) policies above allow public access for demonstration
- **For production**, implement proper authentication and RLS policies
- Consider using Supabase Auth to add user authentication
- Never commit your `.env` file with real credentials to version control

## Data Migration from Google Sheets

If migrating from the existing Google Sheets:

1. Export data from Google Sheets as CSV
2. Use Supabase's import feature to load the CSV
3. Adjust column names to match the schema above
4. Verify data integrity

## Verifying Setup

Run this query in Supabase SQL editor to verify tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Should show: `attendance` and `students`
