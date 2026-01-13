-- ============================================
-- QUICK FIX: Bestehende Daten migrieren
-- ============================================
-- Dieses Script löst den Fehler:
-- "column organizationId of relation vehicles contains null values"

-- SCHRITT 0: Erstelle organizations Tabelle falls sie nicht existiert
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "contactEmail" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Erstelle organization_invites Tabelle falls sie nicht existiert
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,
  "organizationId" UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  "invitedBy" UUID,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "usedBy" UUID,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Füge organizationId zu user_profiles hinzu (falls noch nicht vorhanden)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES organizations(id);

-- Füge organizationId zu vehicles hinzu (falls noch nicht vorhanden)
-- WICHTIG: Erst nullable, dann füllen wir die Daten, dann machen wir es NOT NULL
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS "organizationId" UUID;

-- SCHRITT 1: Default-Organisation erstellen
-- WICHTIG: Notiere die zurückgegebene UUID!
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  -- Prüfe ob Default-Org schon existiert
  SELECT id INTO default_org_id
  FROM organizations
  WHERE name = 'Default Organization'
  LIMIT 1;

  -- Falls nicht, erstelle sie
  IF default_org_id IS NULL THEN
    INSERT INTO organizations (name, "isActive", "createdAt", "updatedAt")
    VALUES (
      'Default Organization',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING id INTO default_org_id;
    
    RAISE NOTICE 'Created Default Organization with ID: %', default_org_id;
  ELSE
    RAISE NOTICE 'Default Organization already exists with ID: %', default_org_id;
  END IF;

  -- SCHRITT 2: Update alle Vehicles ohne Organization
  UPDATE vehicles 
  SET "organizationId" = default_org_id
  WHERE "organizationId" IS NULL;
  
  RAISE NOTICE 'Updated % vehicles', (SELECT COUNT(*) FROM vehicles WHERE "organizationId" = default_org_id);

  -- SCHRITT 3: Update alle User ohne Organization (außer super_admins)
  UPDATE user_profiles 
  SET "organizationId" = default_org_id
  WHERE "organizationId" IS NULL 
    AND role != 'super_admin';
  
  RAISE NOTICE 'Updated % users', (SELECT COUNT(*) FROM user_profiles WHERE "organizationId" = default_org_id);

END $$;

-- SCHRITT 4: Jetzt können wir die Foreign Key Constraint hinzufügen
-- (TypeORM würde das automatisch machen, aber wir machen es manuell für Sicherheit)
DO $$
BEGIN
  -- Prüfe ob Constraint schon existiert
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_vehicles_organizationId'
  ) THEN
    ALTER TABLE vehicles 
    ADD CONSTRAINT FK_vehicles_organizationId 
    FOREIGN KEY ("organizationId") 
    REFERENCES organizations(id);
  END IF;
END $$;

-- SCHRITT 5: Erstelle Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_vehicles_organization ON vehicles("organizationId");
CREATE INDEX IF NOT EXISTS idx_users_organization ON user_profiles("organizationId");
CREATE INDEX IF NOT EXISTS idx_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_organization ON organization_invites("organizationId");

-- SCHRITT 6: Verification
-- Prüfe dass keine NULL-Werte mehr existieren
SELECT 
  'vehicles' as table_name,
  COUNT(*) as null_count
FROM vehicles 
WHERE "organizationId" IS NULL

UNION ALL

SELECT 
  'user_profiles',
  COUNT(*)
FROM user_profiles 
WHERE "organizationId" IS NULL 
  AND role != 'super_admin';

-- SCHRITT 7: Zeige alle Organizations
SELECT 
  id,
  name,
  "isActive",
  (SELECT COUNT(*) FROM vehicles WHERE "organizationId" = organizations.id) as vehicle_count,
  (SELECT COUNT(*) FROM user_profiles WHERE "organizationId" = organizations.id) as user_count
FROM organizations;

-- ============================================
-- Nach diesem Script kannst du den Server 
-- neu starten - TypeORM kann jetzt die 
-- NOT NULL Constraint setzen!
-- ============================================
