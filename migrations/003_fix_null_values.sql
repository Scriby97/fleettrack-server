-- ============================================
-- CLEANUP: Behebe NULL-Werte in organizations
-- ============================================

-- SCHRITT 1: Lösche alle Organizations mit NULL-Werten
-- (Da sie keine gültigen Daten haben)
DELETE FROM organization_invites 
WHERE "organizationId" IN (
  SELECT id FROM organizations WHERE name IS NULL
);

DELETE FROM organizations 
WHERE name IS NULL;

-- SCHRITT 2: Update Vehicles die auf gelöschte Organizations zeigen
-- Falls es welche gibt, weise sie einer neuen Default-Org zu
DO $$
DECLARE
  default_org_id UUID;
  orphaned_vehicles INT;
BEGIN
  -- Zähle verwaiste Vehicles
  SELECT COUNT(*) INTO orphaned_vehicles
  FROM vehicles v
  LEFT JOIN organizations o ON v."organizationId" = o.id
  WHERE v."organizationId" IS NOT NULL 
    AND o.id IS NULL;
  
  IF orphaned_vehicles > 0 THEN
    -- Erstelle Default-Org falls noch nicht vorhanden
    SELECT id INTO default_org_id
    FROM organizations
    WHERE name = 'Default Organization'
    LIMIT 1;
    
    IF default_org_id IS NULL THEN
      INSERT INTO organizations (name, "isActive", "createdAt", "updatedAt")
      VALUES (
        'Default Organization',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING id INTO default_org_id;
      
      RAISE NOTICE 'Created Default Organization: %', default_org_id;
    END IF;
    
    -- Update verwaiste Vehicles
    UPDATE vehicles
    SET "organizationId" = default_org_id
    WHERE "organizationId" NOT IN (SELECT id FROM organizations);
    
    RAISE NOTICE 'Fixed % orphaned vehicles', orphaned_vehicles;
  END IF;
END $$;

-- SCHRITT 3: Update User Profiles die auf gelöschte Organizations zeigen
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id
  FROM organizations
  WHERE name = 'Default Organization'
  LIMIT 1;
  
  IF default_org_id IS NOT NULL THEN
    UPDATE user_profiles
    SET "organizationId" = default_org_id
    WHERE "organizationId" IS NOT NULL 
      AND "organizationId" NOT IN (SELECT id FROM organizations)
      AND role != 'super_admin';
  END IF;
END $$;

-- SCHRITT 4: Verification - zeige aktuelle Situation
SELECT 
  'organizations' as table_name,
  COUNT(*) as total_count,
  COUNT(CASE WHEN name IS NULL THEN 1 END) as null_names
FROM organizations

UNION ALL

SELECT 
  'vehicles',
  COUNT(*),
  COUNT(CASE WHEN "organizationId" IS NULL THEN 1 END)
FROM vehicles

UNION ALL

SELECT 
  'user_profiles',
  COUNT(*),
  COUNT(CASE WHEN "organizationId" IS NULL AND role != 'super_admin' THEN 1 END)
FROM user_profiles;

-- SCHRITT 5: Zeige alle Organizations
SELECT * FROM organizations ORDER BY "createdAt" DESC;
