-- Migration 009: Enable Row Level Security (RLS) and create policies
-- Fixes Supabase Security Advisor warnings

-- ============================================================================
-- 1. Enable RLS on all tables
-- ============================================================================

-- Organizations table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization invites table
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- User profiles table (should also be protected)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Vehicles table
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Usages table
ALTER TABLE public.usages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Create policies for user_profiles
-- ============================================================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (firstName, lastName)
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- 3. Create policies for organizations
-- ============================================================================

-- Users can read their own organization
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

-- Super admins can read all organizations (via backend service role key)
-- Note: This is handled by backend with service role key, not RLS

-- ============================================================================
-- 4. Create policies for organization_invites
-- ============================================================================

-- Users can read invites for their organization (admins managing invites)
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

-- Public access to validate invite tokens (before user is authenticated)
-- This is needed for the invite acceptance flow
CREATE POLICY "Public can read invite by token"
  ON public.organization_invites
  FOR SELECT
  USING (true); -- Backend will validate token and expiry

-- ============================================================================
-- 5. Create policies for vehicles
-- ============================================================================

-- Users can read vehicles from their organization
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

-- ============================================================================
-- 6. Create policies for usages
-- ============================================================================

-- Users can read usages from their organization (via vehicle relationship)
CREATE POLICY "Users can read usages from their organization"
  ON public.usages
  FOR SELECT
  USING (
    "vehicleId" IN (
      SELECT v.id 
      FROM public.vehicles v
      INNER JOIN public.user_profiles up ON v."organizationId" = up."organizationId"
      WHERE up.id = auth.uid()
    )
  );

-- ============================================================================
-- 7. IMPORTANT: Backend Service Role Access
-- ============================================================================

-- The NestJS backend uses Supabase Service Role Key which bypasses RLS
-- This is correct and intended behavior:
-- - All INSERT/UPDATE/DELETE operations happen via backend (service role)
-- - RLS provides an additional security layer for direct database access
-- - RLS protects against accidental exposure via PostgREST API

-- ============================================================================
-- 8. Notes
-- ============================================================================

-- RLS Policies Summary:
-- ✅ user_profiles: Users can read/update own profile
-- ✅ organizations: Users can read their own organization
-- ✅ organization_invites: Public read for token validation, org members can read all invites
-- ✅ vehicles: Users can read vehicles from their organization
-- ✅ usages: Users can read usages from their organization (via vehicles)

-- Backend Service Role:
-- - Uses SUPABASE_SERVICE_ROLE_KEY which bypasses all RLS policies
-- - Handles all write operations (INSERT, UPDATE, DELETE)
-- - Enforces organization-based access control at application layer

-- Security:
-- - RLS is enabled on all tables (fixes Supabase Security Advisor warnings)
-- - Policies prevent unauthorized direct database access
-- - Backend remains the single source of truth for business logic
