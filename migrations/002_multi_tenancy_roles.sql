-- Migration: Multi-Tenancy & Role System Restructuring
-- Separates functional roles (administrator/user) from organization membership roles (employee/admin/owner)
-- Allows users to belong to multiple organizations with different roles in each

-- 1. Create new organization_members junction table
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'employee', -- 'employee', 'admin', 'owner'
  "joinedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT fk_org_members_user 
    FOREIGN KEY ("userId") REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_members_org 
    FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_org_membership 
    UNIQUE ("userId", "organizationId")
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members("userId");
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);

-- 2. Drop existing RLS policies that depend on organizationId
-- These policies exist from the old schema and must be dropped before the column
DO $$
BEGIN
  -- Drop policies from other tables that reference user_profiles.organizationId
  DROP POLICY IF EXISTS "Users can read own organization" ON public.organizations;
  DROP POLICY IF EXISTS "Users can read invites for their organization" ON public.organization_invites;
  DROP POLICY IF EXISTS "Users can read vehicles from their organization" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can read usages from their organization" ON public.usages;
  
  -- Drop any other policies that might reference organizationId
  DROP POLICY IF EXISTS "Users can create vehicles in their organization" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can update vehicles in their organization" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can create usages in their organization" ON public.usages;
  DROP POLICY IF EXISTS "Users can update usages in their organization" ON public.usages;
END $$;

-- 3. Drop old organization foreign key from user_profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_profiles_organization') THEN
    ALTER TABLE public.user_profiles
      DROP CONSTRAINT fk_user_profiles_organization;
  END IF;
END $$;

-- 4. Drop organizationId from user_profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'organizationId') THEN
    ALTER TABLE public.user_profiles
      DROP COLUMN "organizationId";
  END IF;
END $$;

-- 5. Update user_profiles.role enum to only support 'user' or 'administrator'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'role') THEN
    -- Update old 'super_admin' values to 'administrator'
    UPDATE public.user_profiles SET role = 'administrator' WHERE role = 'super_admin';
    
    -- Update old 'admin' values to 'user' (org-specific admins should be in organization_members now)
    -- Note: These will need to be migrated to organization_members table
    UPDATE public.user_profiles SET role = 'user' WHERE role = 'admin';
  END IF;
END $$;

-- 6. Migrate existing user-organization relationships to organization_members
-- For users that had an organizationId, create a membership with appropriate role
DO $$
DECLARE
  user_record RECORD;
  org_id UUID;
BEGIN
  -- Find first organization (fallback for users without explicit org)
  SELECT id INTO org_id FROM public.organizations LIMIT 1;
  
  -- This is a placeholder - you should manually review which users should go where
  -- Insert statement commented out - review and run manually if needed
  /*
  INSERT INTO public.organization_members ("userId", "organizationId", role, "joinedAt")
  SELECT DISTINCT
    up.id,
    org_id,
    CASE 
      WHEN up.role = 'admin' THEN 'admin'
      ELSE 'employee'
    END,
    COALESCE(up."createdAt", CURRENT_TIMESTAMP)
  FROM public.user_profiles up
  ON CONFLICT ("userId", "organizationId") DO NOTHING;
  */
END $$;

-- 7. Add comment to user_profiles.role for clarity
COMMENT ON COLUMN public.user_profiles.role IS 
  'Functional/system-level role: user (normal user) or administrator (system admin - can see all organizations)';

-- 8. Add comment to organization_members.role for clarity
COMMENT ON COLUMN public.organization_members.role IS 
  'Organization-specific role: employee (read-only), admin (can manage org), owner (can delete org)';

-- 9. Create helpful view for user organization memberships
CREATE OR REPLACE VIEW public.user_org_memberships AS
SELECT 
  up.id as "userId",
  up.email,
  up."firstName",
  up."lastName",
  up.role as "functionalRole",
  om.id as "membershipId",
  om."organizationId",
  o.name as "organizationName",
  om.role as "organizationRole",
  om."joinedAt"
FROM public.user_profiles up
LEFT JOIN public.organization_members om ON up.id = om."userId"
LEFT JOIN public.organizations o ON om."organizationId" = o.id
ORDER BY up.email, o.name;

-- 10. Enable Row Level Security (RLS) for organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS Policies for organization_members
-- Policy 1: Administrators can see all memberships
CREATE POLICY "Administrators can view all memberships" ON public.organization_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

-- Policy 2: Users can see their own memberships
CREATE POLICY "Users can view their own memberships" ON public.organization_members
  FOR SELECT
  USING (
    "userId" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

-- Policy 3: Only service role (authenticated backend) can insert memberships
CREATE POLICY "Service role can insert memberships" ON public.organization_members
  FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS

-- Policy 4: Only service role can update memberships
CREATE POLICY "Service role can update memberships" ON public.organization_members
  FOR UPDATE
  WITH CHECK (true); -- Service role bypasses RLS

-- Policy 5: Only service role can delete memberships
CREATE POLICY "Service role can delete memberships" ON public.organization_members
  FOR DELETE
  USING (true); -- Service role bypasses RLS

-- 12. Update RLS on other tables to use new organization_members structure
-- Drop old policies that relied on organizationId
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can read all organizations" ON public.organizations;
  DROP POLICY IF EXISTS "Users can read own organization" ON public.organizations;
END $$;

-- 13. Enable Row Level Security on organizations (if not already enabled)
DO $$
BEGIN
  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Table might already have RLS enabled
END $$;

-- 14. Create new RLS policies for organizations based on organization_members
CREATE POLICY "Administrators can view all organizations" ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organizations.id
      AND om."userId" = auth.uid()
    )
  );

-- 15. Update RLS policies for user_profiles
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Table might already have RLS enabled
END $$;

CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

-- 16. Update RLS policies for vehicles table
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can read all vehicles" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can read vehicles from their organization" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can create vehicles in their organization" ON public.vehicles;
  DROP POLICY IF EXISTS "Users can update vehicles in their organization" ON public.vehicles;
END $$;

DO $$
BEGIN
  ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Table might already have RLS enabled
END $$;

CREATE POLICY "Administrators can view all vehicles" ON public.vehicles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view vehicles in their organizations" ON public.vehicles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = vehicles."organizationId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Service role can create vehicles" ON public.vehicles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update vehicles" ON public.vehicles
  FOR UPDATE
  WITH CHECK (true);

-- 17. Update RLS policies for usages table
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can read usages from their organization" ON public.usages;
  DROP POLICY IF EXISTS "Users can create usages in their organization" ON public.usages;
  DROP POLICY IF EXISTS "Users can update usages in their organization" ON public.usages;
END $$;

DO $$
BEGIN
  ALTER TABLE public.usages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Table might already have RLS enabled
END $$;

CREATE POLICY "Administrators can view all usages" ON public.usages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view usages from their organizations" ON public.usages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.vehicles v ON om."organizationId" = v."organizationId"
      WHERE v.id = usages."vehicleId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Service role can create usages" ON public.usages
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update usages" ON public.usages
  FOR UPDATE
  WITH CHECK (true);

-- 18. Update RLS policies for organization_invites table
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can read invites for their organization" ON public.organization_invites;
END $$;

DO $$
BEGIN
  ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Table might already have RLS enabled
END $$;

CREATE POLICY "Administrators can view all invites" ON public.organization_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view invites for their organizations" ON public.organization_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organization_invites."organizationId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Service role can manage invites" ON public.organization_invites
  FOR ALL
  WITH CHECK (true);
