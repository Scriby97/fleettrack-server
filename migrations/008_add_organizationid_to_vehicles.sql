-- Add organizationId column to vehicles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicles' AND column_name = 'organizationId'
  ) THEN
    ALTER TABLE vehicles 
    ADD COLUMN "organizationId" UUID NOT NULL 
    DEFAULT '3c1479e0-a291-460b-8bb7-bc00e45c2cd0'; -- Default Organization
    
    -- Remove default after adding
    ALTER TABLE vehicles 
    ALTER COLUMN "organizationId" DROP DEFAULT;
    
    RAISE NOTICE 'Column organizationId added to vehicles';
  ELSE
    RAISE NOTICE 'Column organizationId already exists in vehicles';
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_vehicles_organization'
  ) THEN
    ALTER TABLE vehicles 
    ADD CONSTRAINT FK_vehicles_organization 
    FOREIGN KEY ("organizationId") 
    REFERENCES organizations(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key vehicles -> organizations added';
  ELSE
    RAISE NOTICE 'Foreign key already exists';
  END IF;
END $$;

-- Assign user nicolas_balmer to Default Organization
UPDATE user_profiles 
SET "organizationId" = '3c1479e0-a291-460b-8bb7-bc00e45c2cd0'
WHERE email = 'nicolas_balmer@hotmail.com' 
  AND "organizationId" IS NULL;
