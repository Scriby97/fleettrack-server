-- ============================================
-- FINAL FIX: Manuelles Schema-Setup
-- ============================================
-- Führe dies aus und dann starte den Server mit synchronize: false

-- Stelle sicher, dass die Spalte name mit NOT NULL existiert
DO $$
BEGIN
  -- Prüfe ob Spalte existiert
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'name'
  ) THEN
    -- Spalte existiert bereits - stelle sicher dass sie NOT NULL ist
    ALTER TABLE organizations 
    ALTER COLUMN name SET NOT NULL;
    
    RAISE NOTICE 'Column name set to NOT NULL';
  ELSE
    -- Spalte existiert nicht - erstelle sie
    ALTER TABLE organizations 
    ADD COLUMN name VARCHAR(255) NOT NULL;
    
    RAISE NOTICE 'Column name created with NOT NULL';
  END IF;
END $$;

-- Stelle sicher, dass name UNIQUE ist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'UQ_organizations_name'
  ) THEN
    ALTER TABLE organizations 
    ADD CONSTRAINT UQ_organizations_name UNIQUE (name);
    
    RAISE NOTICE 'Added UNIQUE constraint on name';
  END IF;
END $$;

-- Zeige finales Schema
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;

-- ============================================
-- Jetzt starte den Server mit synchronize: false
-- ============================================
