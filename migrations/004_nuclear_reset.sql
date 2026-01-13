-- ============================================
-- NUCLEAR OPTION: Kompletter Neustart
-- ============================================
-- WARNUNG: Dies löscht alle organizations und invites!
-- Aber deine Vehicles und Users bleiben erhalten.

-- SCHRITT 1: Entferne alle Foreign Key Constraints
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS "FK_vehicles_organizationId";
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS "FK_68abe2b00417c5ed4c61c939530";
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS "FK_user_profiles_organizationId";
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS "FK_9f0e3b6c3e9c6f8a8b4d3a2c1b0";

-- SCHRITT 2: Lösche organization_invites Tabelle komplett
DROP TABLE IF EXISTS organization_invites CASCADE;

-- SCHRITT 3: Lösche organizations Tabelle komplett
DROP TABLE IF EXISTS organizations CASCADE;

-- SCHRITT 4: Entferne organizationId Spalten
ALTER TABLE vehicles DROP COLUMN IF EXISTS "organizationId";
ALTER TABLE user_profiles DROP COLUMN IF EXISTS "organizationId";

-- SCHRITT 5: Erstelle alles neu
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "contactEmail" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SCHRITT 6: Erstelle Default Organization
INSERT INTO organizations (name, "isActive", "createdAt", "updatedAt")
VALUES (
  'Default Organization',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- SCHRITT 7: Füge organizationId zu vehicles hinzu
ALTER TABLE vehicles 
ADD COLUMN "organizationId" UUID NOT NULL DEFAULT (SELECT id FROM organizations LIMIT 1);

-- SCHRITT 8: Füge organizationId zu user_profiles hinzu (nullable für super_admins)
ALTER TABLE user_profiles 
ADD COLUMN "organizationId" UUID REFERENCES organizations(id);

-- Update alle normalen User
UPDATE user_profiles 
SET "organizationId" = (SELECT id FROM organizations LIMIT 1)
WHERE role != 'super_admin';

-- SCHRITT 9: Füge Foreign Key Constraints hinzu
ALTER TABLE vehicles 
ADD CONSTRAINT "FK_vehicles_organizationId" 
FOREIGN KEY ("organizationId") 
REFERENCES organizations(id);

-- SCHRITT 10: Erstelle organization_invites Tabelle
CREATE TABLE organization_invites (
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

-- SCHRITT 11: Erstelle Indexes
CREATE INDEX idx_vehicles_organization ON vehicles("organizationId");
CREATE INDEX idx_users_organization ON user_profiles("organizationId");
CREATE INDEX idx_invites_token ON organization_invites(token);
CREATE INDEX idx_invites_organization ON organization_invites("organizationId");

-- SCHRITT 12: Verification
SELECT 
  'organizations' as table_name,
  COUNT(*) as count,
  array_agg(name) as names
FROM organizations

UNION ALL

SELECT 
  'vehicles',
  COUNT(*),
  ARRAY[COUNT(*)::text]
FROM vehicles

UNION ALL

SELECT 
  'user_profiles',
  COUNT(*),
  ARRAY[COUNT(*)::text]
FROM user_profiles;

-- Zeige Detail-Info
SELECT 
  'Vehicles with org' as info,
  COUNT(*) as count
FROM vehicles 
WHERE "organizationId" IS NOT NULL

UNION ALL

SELECT 
  'Users with org',
  COUNT(*)
FROM user_profiles 
WHERE "organizationId" IS NOT NULL

UNION ALL

SELECT 
  'Users without org (should only be super_admins)',
  COUNT(*)
FROM user_profiles 
WHERE "organizationId" IS NULL;

-- ============================================
-- Nach diesem Script starte den Server neu.
-- TypeORM sollte jetzt funktionieren!
-- ============================================
