-- Add organizationId column to user_profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'organizationId'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN "organizationId" UUID;
    
    RAISE NOTICE 'Column organizationId added to user_profiles';
  ELSE
    RAISE NOTICE 'Column organizationId already exists in user_profiles';
  END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_user_profiles_organization'
  ) THEN
    ALTER TABLE user_profiles 
    ADD CONSTRAINT FK_user_profiles_organization 
    FOREIGN KEY ("organizationId") 
    REFERENCES organizations(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Foreign key constraint added';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists';
  END IF;
END $$;
