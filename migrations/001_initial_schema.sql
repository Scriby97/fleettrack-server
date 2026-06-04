-- FleetTrack baseline schema migration
-- Consolidates former migrations 001-014 into one initial setup script.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core tables
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "contactEmail" VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  "firstName" VARCHAR(255),
  "lastName" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" UUID
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plate VARCHAR(255) NOT NULL,
  "snowsatNumber" VARCHAR(255) NOT NULL,
  "organizationId" UUID NOT NULL,
  "isRetired" BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  "vehicleType" TEXT,
  "fuelType" TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicleId" UUID NOT NULL,
  "usageDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creatorId" UUID NOT NULL,
  "startOperatingHours" NUMERIC(10,1) NOT NULL,
  "endOperatingHours" NUMERIC(10,1) NOT NULL,
  "fuelLitersRefilled" INTEGER NOT NULL DEFAULT 0,
  "creationDate" BIGINT DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,
  "organizationId" UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  "invitedBy" UUID,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "usedBy" UUID,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_profiles_organization') THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT fk_user_profiles_organization
      FOREIGN KEY ("organizationId")
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vehicles_organization') THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT fk_vehicles_organization
      FOREIGN KEY ("organizationId")
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usages_vehicle') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT fk_usages_vehicle
      FOREIGN KEY ("vehicleId")
      REFERENCES public.vehicles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usages_creator') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT fk_usages_creator
      FOREIGN KEY ("creatorId")
      REFERENCES public.user_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_invites_organizationId_fkey') THEN
    ALTER TABLE public.organization_invites
      ADD CONSTRAINT "organization_invites_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES public.organizations(id);
  END IF;
END $$;

-- Data integrity checks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_start_operating_hours_non_negative') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT check_start_operating_hours_non_negative
      CHECK ("startOperatingHours" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_end_operating_hours_positive') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT check_end_operating_hours_positive
      CHECK ("endOperatingHours" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_end_hours_gte_start_hours') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT check_end_hours_gte_start_hours
      CHECK ("endOperatingHours" >= "startOperatingHours");
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_organization ON public.vehicles("organizationId");
CREATE INDEX IF NOT EXISTS idx_users_organization ON public.user_profiles("organizationId");
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_organization ON public.organization_invites("organizationId");
CREATE INDEX IF NOT EXISTS idx_vehicles_isretired ON public.vehicles("isRetired");
CREATE INDEX IF NOT EXISTS idx_usages_creation_date ON public.usages("creationDate");

-- RLS setup
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read own organization" ON public.organizations;
CREATE POLICY "Users can read own organization"
  ON public.organizations
  FOR SELECT
  USING (
    id IN (
      SELECT "organizationId"
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can read invites for their organization" ON public.organization_invites;
CREATE POLICY "Users can read invites for their organization"
  ON public.organization_invites
  FOR SELECT
  USING (
    "organizationId" IN (
      SELECT "organizationId"
      FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Public can read invite by token" ON public.organization_invites;
CREATE POLICY "Public can read invite by token"
  ON public.organization_invites
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can read vehicles from their organization" ON public.vehicles;
CREATE POLICY "Users can read vehicles from their organization"
  ON public.vehicles
  FOR SELECT
  USING (
    "organizationId" IN (
      SELECT "organizationId"
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can read usages from their organization" ON public.usages;
CREATE POLICY "Users can read usages from their organization"
  ON public.usages
  FOR SELECT
  USING (
    "vehicleId" IN (
      SELECT v.id
      FROM public.vehicles v
      INNER JOIN public.user_profiles up
        ON v."organizationId" = up."organizationId"
      WHERE up.id = auth.uid()
    )
  );
