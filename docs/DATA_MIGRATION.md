# Data Migration Guide: Google Sheets → Supabase

How to migrate your existing student data from Google Sheets to Supabase.

## Option 1: Using Supabase's Import Feature (Easiest)

### Step 1: Export Data from Google Sheets

#### Export "Pibes" sheet (Student data)

1. Open your Google Sheet
2. Click on "Pibes" sheet tab
3. Select all data (Ctrl+A or Cmd+A)
4. Copy (Ctrl+C or Cmd+C)
5. Open a text editor or spreadsheet program
6. Paste data
7. Export as CSV:
   - **Google Sheets**: File → Download → CSV (.csv)
   - **Excel**: File → Save As → CSV (Comma delimited)
   - **LibreOffice**: File → Save As → CSV

#### Export "Presentes" sheet (Attendance data)

Repeat the above steps for the "Presentes" sheet.

### Step 2: Prepare CSV Files

The CSVs should look like this:

**pibes.csv** (from "Pibes" sheet):
```csv
id,nombre,grado,tiene_ficha,edad,observaciones
1,Juan Pérez,3°,Sí,Medianos,Energético
2,María García,2°,No,Chiquitos,
3,Carlos López,4°,Sí,Grandes,Tímido
```

**presentes.csv** (from "Presentes" sheet):
```csv
nombre,2024-01-15,2024-01-22,2024-01-29
Juan Pérez,x,,x
María García,x,x,
Carlos López,,x,x
```

**Important**: 
- Headers must be in the first row
- Save with UTF-8 encoding
- Use consistent date format (YYYY-MM-DD)

### Step 3: Import to Supabase

1. Go to Supabase Dashboard → Your Project
2. Click "SQL Editor" in left sidebar
3. Create students first:

```sql
-- Clear existing data if needed
DELETE FROM attendance;
DELETE FROM students;

-- Then use the import UI or SQL insert
```

4. Click "New Query" and use this approach:

**Option A: CSV Upload (Easiest)**

1. Go to "Database" → "students" table
2. Click "Import data" button
3. Select your `pibes.csv` file
4. Map columns:
   - CSV column → Database column
   - Verify the mapping
5. Click "Import"

**Option B: SQL INSERT**

Copy and paste this into SQL Editor:

```sql
INSERT INTO students (id, nombre, grado, tiene_ficha, edad, observaciones) 
VALUES 
  (1, 'Juan Pérez', '3°', true, 'Medianos', 'Energético'),
  (2, 'María García', '2°', false, 'Chiquitos', NULL),
  (3, 'Carlos López', '4°', true, 'Grandes', 'Tímido');
```

### Step 4: Import Attendance Data

Convert "Presentes" data format:

```sql
-- From the presentes.csv data structure:
-- nombre,2024-01-15,2024-01-22,2024-01-29
-- Juan Pérez,x,,x

-- Convert to attendance table format:
INSERT INTO attendance (student_id, fecha, marked) VALUES
  (1, '2024-01-15', true),  -- Juan present on 1/15
  (1, '2024-01-29', true),  -- Juan present on 1/29
  (2, '2024-01-15', true),  -- María present on 1/15
  (2, '2024-01-22', true),  -- María present on 1/22
  (3, '2024-01-22', true),  -- Carlos present on 1/22
  (3, '2024-01-29', true);  -- Carlos present on 1/29
```

---

## Option 2: Using a Script (For Large Datasets)

If you have thousands of records, use this Node.js script:

```javascript
// migrate.js
const fs = require('fs');
const csv = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function migrateStudents() {
  const data = fs.readFileSync('pibes.csv', 'utf-8');
  const records = csv.parse(data, { columns: true });
  
  for (const record of records) {
    const { error } = await supabase
      .from('students')
      .insert({
        id: parseInt(record.id),
        nombre: record.nombre,
        grado: record.grado,
        tiene_ficha: record.tiene_ficha.toLowerCase() === 'sí',
        edad: record.edad,
        observaciones: record.observaciones || null
      });
    
    if (error) console.error('Error:', error);
    else console.log(`Imported: ${record.nombre}`);
  }
}

migrateStudents();
```

Run with:
```bash
npm install csv-parse @supabase/supabase-js
node migrate.js
```

---

## Option 3: Manual Entry (For Small Datasets)

If you have just a few students:

1. Go to Supabase Dashboard
2. Click on "students" table
3. Click "Insert row"
4. Fill in the fields manually
5. Click "Save"
6. Repeat for each student

Then add attendance manually:
1. Click on "attendance" table
2. Click "Insert row"
3. Select student, date, and mark as present
4. Click "Save"

---

## Data Validation

After migration, verify the data:

```sql
-- Check student count
SELECT COUNT(*) as total_students FROM students;

-- Check attendance records
SELECT COUNT(*) as total_attendance FROM attendance;

-- Verify data integrity
SELECT 
  s.nombre,
  COUNT(a.id) as visitas
FROM students s
LEFT JOIN attendance a ON s.id = a.student_id
GROUP BY s.id, s.nombre
ORDER BY visitas DESC;

-- Check for missing names
SELECT * FROM students WHERE nombre IS NULL OR nombre = '';
```

---

## Handling Special Cases

### Students with No ID in Google Sheets

If students don't have IDs, Supabase will auto-generate them:

```sql
-- Remove ID from INSERT if not provided
INSERT INTO students (nombre, grado, tiene_ficha, edad, observaciones)
VALUES ('New Student', '3°', false, 'Medianos', NULL);
-- ID will be auto-generated
```

### Duplicate Students

If you find duplicates:

```sql
-- Find duplicates
SELECT nombre, COUNT(*) as count
FROM students
GROUP BY nombre
HAVING COUNT(*) > 1;

-- Remove duplicates (keep the one with more attendance)
DELETE FROM students
WHERE id NOT IN (
  SELECT MAX(id) FROM students
  GROUP BY LOWER(nombre)
);
```

### Date Format Issues

If dates are in different formats:

```sql
-- Convert various date formats to YYYY-MM-DD
UPDATE attendance
SET fecha = TO_DATE(fecha, 'DD/MM/YYYY')
WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$';
```

---

## Rollback Plan

If something goes wrong:

```sql
-- Delete all migrated data
DELETE FROM attendance;
DELETE FROM students;

-- Restore from backup (in Supabase, go to Project Settings → Backups)
-- Or re-export from Google Sheets and try again
```

---

## Verification Checklist

After migration, verify:

- [ ] All students are in the database
- [ ] No duplicate students
- [ ] Attendance records match Google Sheets
- [ ] Date formats are correct (YYYY-MM-DD)
- [ ] Field values are appropriate (Sí/No for ficha)
- [ ] IDs are unique and sequential
- [ ] Search functionality works in the app
- [ ] Attendance count is accurate

---

## Common Issues

### "Column count mismatch"
- Make sure CSV headers match table column names exactly
- Check for extra spaces in headers

### "Invalid date format"
- Dates must be YYYY-MM-DD
- Convert DD/MM/YYYY to YYYY-MM-DD first

### "Foreign key constraint violation"
- Make sure student_id exists in students table before adding attendance
- Import students first, then attendance

### "Duplicate key value"
- IDs must be unique
- If ID already exists, let Supabase auto-generate it (don't specify ID)

### "UTF-8 encoding issues"
- Make sure CSV is saved with UTF-8 encoding
- Accented characters (á, é, í, ó, ú, ñ) should be preserved

---

## Performance Tips

For large datasets (10,000+ records):

```sql
-- Disable indexes during import
ALTER TABLE students DISABLE TRIGGER ALL;

-- Import data...

-- Re-enable indexes
ALTER TABLE students ENABLE TRIGGER ALL;

-- Rebuild indexes
REINDEX TABLE students;
```

---

## After Migration

1. ✅ Test the app thoroughly
2. ✅ Verify all searches work
3. ✅ Test marking attendance
4. ✅ Verify attendance counts are correct
5. ✅ Keep Google Sheets as backup for a month
6. ✅ Archive or delete Google Sheets after verification
7. ✅ Update team documentation

---

## Support

If migration fails:
- Check Supabase logs: Dashboard → Logs
- Verify CSV format with a validator
- Test with a small subset first
- Contact Supabase support: https://supabase.com/support

## Next Steps

After successful migration:
1. Go to [QUICK_START.md](QUICK_START.md)
2. Follow the deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)
3. Test the app in production
