-- Add foreign key from usages to vehicles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_usages_vehicle'
  ) THEN
    ALTER TABLE usages 
    ADD CONSTRAINT FK_usages_vehicle 
    FOREIGN KEY ("vehicleId") 
    REFERENCES vehicles(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key usages -> vehicles added';
  ELSE
    RAISE NOTICE 'Foreign key usages -> vehicles already exists';
  END IF;
END $$;

-- Add foreign key from usages to user_profiles (creator)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_usages_creator'
  ) THEN
    ALTER TABLE usages 
    ADD CONSTRAINT FK_usages_creator 
    FOREIGN KEY ("creatorId") 
    REFERENCES user_profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Foreign key usages -> user_profiles (creator) added';
  ELSE
    RAISE NOTICE 'Foreign key usages -> user_profiles already exists';
  END IF;
END $$;
