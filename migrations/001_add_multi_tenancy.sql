-- ============================================
-- Multi-Tenancy Migration Script
-- ============================================

-- 1. Organizations Tabelle erstellen
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "contactEmail" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. User Profiles Tabelle erweitern
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES organizations(id);

-- 3. Vehicles Tabelle erweitern
-- ACHTUNG: Dies erfordert, dass entweder:
-- a) Noch keine Vehicles existieren, ODER
-- b) Eine Default-Organization existiert
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES organizations(id);

-- 4. Indexes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_vehicles_organization 
ON vehicles("organizationId");

CREATE INDEX IF NOT EXISTS idx_users_organization 
ON user_profiles("organizationId");

-- 5. Optional: Trigger für auto-update von updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at 
BEFORE UPDATE ON organizations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Optional: Supabase Row Level Security (RLS)
-- ============================================

-- RLS für Vehicles aktivieren
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Policy: Users sehen nur Vehicles ihrer Organisation
DROP POLICY IF EXISTS vehicles_org_isolation ON vehicles;
CREATE POLICY vehicles_org_isolation ON vehicles
  FOR ALL
  USING (
    "organizationId" IN (
      SELECT "organizationId" 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
    OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'super_admin'
    )
  );

-- RLS für User Profiles aktivieren
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users sehen nur Profile ihrer Organisation
DROP POLICY IF EXISTS user_profiles_org_isolation ON user_profiles;
CREATE POLICY user_profiles_org_isolation ON user_profiles
  FOR ALL
  USING (
    "organizationId" IN (
      SELECT "organizationId" 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
    OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'super_admin'
    )
    OR
    id = auth.uid() -- User kann immer sein eigenes Profil sehen
  );

-- RLS für Organizations aktivieren
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Nur Super-Admins können Organisationen verwalten
DROP POLICY IF EXISTS organizations_super_admin_only ON organizations;
CREATE POLICY organizations_super_admin_only ON organizations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'super_admin'
    )
  );

-- Policy: Admins können ihre eigene Organisation sehen
DROP POLICY IF EXISTS organizations_own_org_read ON organizations;
CREATE POLICY organizations_own_org_read ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT "organizationId" 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================
-- Daten-Migration (Optional)
-- ============================================

-- Wenn bereits Daten existieren, erstelle eine Default-Organization
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  -- Erstelle Default-Organization falls Vehicles ohne Organization existieren
  IF EXISTS (SELECT 1 FROM vehicles WHERE "organizationId" IS NULL) THEN
    INSERT INTO organizations (name, "isActive")
    VALUES ('Default Organization', true)
    RETURNING id INTO default_org_id;
    
    -- Weise alle Vehicles ohne Organization der Default-Organization zu
    UPDATE vehicles 
    SET "organizationId" = default_org_id 
    WHERE "organizationId" IS NULL;
    
    -- Weise alle Users ohne Organization der Default-Organization zu
    UPDATE user_profiles 
    SET "organizationId" = default_org_id 
    WHERE "organizationId" IS NULL AND role != 'super_admin';
  END IF;
END $$;

-- ============================================
-- Verification Queries
-- ============================================

-- Prüfe die Struktur
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('organizations', 'vehicles', 'user_profiles')
  AND column_name LIKE '%organization%'
ORDER BY table_name, ordinal_position;

-- Prüfe Indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('organizations', 'vehicles', 'user_profiles')
ORDER BY tablename, indexname;

-- Zähle Datensätze
SELECT 
  'organizations' as table_name, 
  COUNT(*) as count 
FROM organizations
UNION ALL
SELECT 
  'vehicles', 
  COUNT(*) 
FROM vehicles
UNION ALL
SELECT 
  'user_profiles', 
  COUNT(*) 
FROM user_profiles;
